import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { seedDatabase } from "./seed";
import { setupAuth } from "./auth";
import { applySecurityHeaders, createCsrfMiddleware } from "./security";
import { randomUUID } from "crypto";
import { monitoringService } from "./services/monitoringService";
import { backgroundJobService } from "./services/backgroundJobService";
import { retentionService } from "./services/retentionService";

const app = express();
const httpServer = createServer(app);

function parseAllowedOrigins(origins: string | undefined): Set<string> {
  if (!origins) return new Set();
  return new Set(
    origins
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}

const allowedCorsOrigins = parseAllowedOrigins(
  process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_ORIGINS,
);

if (process.env.TRUST_PROXY === "true" || process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

if (allowedCorsOrigins.size > 0) {
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!origin || !allowedCorsOrigins.has(origin)) {
      return next();
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, X-Telemetry-Key, X-API-Key, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE");
    res.setHeader("Access-Control-Expose-Headers", "X-CSRF-Token");
    res.append("Vary", "Origin");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    return next();
  });
}

applySecurityHeaders(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    if (!path.startsWith("/api")) {
      return;
    }

    const authenticatedUser = req.user as { id?: string } | undefined;
    const errorCodeHeader = res.getHeader("X-Error-Code");
    const statusCode = res.statusCode;
    const severity = statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

    log(
      JSON.stringify({
        level: severity,
        event: "api_request",
        requestId,
        method: req.method,
        route: path,
        status: statusCode,
        durationMs: Date.now() - start,
        organizationId: req.tenant?.organizationId ?? null,
        userId: authenticatedUser?.id ?? null,
        ip: req.ip,
        userAgent: req.get("user-agent") ?? null,
        errorCode: typeof errorCodeHeader === "string" ? errorCodeHeader : null,
      }),
      "api",
    );
  });

  next();
});

process.on("unhandledRejection", (reason) => {
  void monitoringService.reportProcessIssue({
    level: "error",
    event: "process.unhandled_rejection",
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack ?? null : null,
    metadata: {
      kind: typeof reason,
    },
  });
});

process.on("uncaughtExceptionMonitor", (error, origin) => {
  void monitoringService.reportProcessIssue({
    level: "critical",
    event: "process.uncaught_exception",
    message: error.message,
    stack: error.stack ?? null,
    metadata: {
      origin,
    },
  });
});

(async () => {
  setupAuth(app);
  backgroundJobService.start();
  retentionService.start();
  app.use(
    createCsrfMiddleware({
      enforced: process.env.CSRF_ENFORCED === "true",
      exemptPaths: ["/api/track", "/api/leads", "/api/monitoring/client-errors", "/api/telemetry/sdk-ingest", "/api/telemetry/sdk-evaluate"],
    }),
  );

  await seedDatabase().catch((err) => {
    console.error("Failed to seed database:", err);
  });
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    const errorCode =
      err.code ||
      (status === 400
        ? "BAD_REQUEST"
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : status === 404
              ? "NOT_FOUND"
              : status === 409
                ? "CONFLICT"
                : "INTERNAL_SERVER_ERROR");

    console.error("Internal Server Error:", err);
    if (status >= 500) {
      void monitoringService.reportServerError({
        level: status >= 500 ? "error" : "warn",
        event: "api.unhandled_error",
        message,
        requestId: _req.requestId ?? null,
        organizationId: _req.tenant?.organizationId ?? null,
        userId: (_req.user as { id?: string } | undefined)?.id ?? null,
        route: _req.path,
        method: _req.method,
        status,
        stack: err instanceof Error ? err.stack ?? null : null,
        metadata: {
          errorCode,
        },
      });
    }

    if (res.headersSent) {
      return next(err);
    }

    res.setHeader("X-Error-Code", errorCode);
    return res.status(status).json({ message, code: errorCode, requestId: _req.requestId ?? null });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  if (process.platform === "win32") {
    httpServer.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });
  } else {
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
        reusePort: true,
      },
      () => {
        log(`serving on port ${port}`);
      },
    );
  }
})();
