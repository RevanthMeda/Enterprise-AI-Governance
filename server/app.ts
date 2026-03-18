import express, { type Express, type Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";
import { setupAuth } from "./auth";
import { applySecurityHeaders, createCsrfMiddleware } from "./security";
import { monitoringService } from "./services/monitoringService";
import { backgroundJobService } from "./services/backgroundJobService";
import { retentionService } from "./services/retentionService";

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

export interface AppBootstrapOptions {
  serveStaticClient?: boolean;
  startProcessWorkers?: boolean;
  seedOnStartup?: boolean;
  enableCronRoutes?: boolean;
}

export interface AppRuntime {
  app: Express;
  httpServer: Server;
}

let processHandlersRegistered = false;
let vercelRuntimePromise: Promise<AppRuntime> | null = null;

function parseAllowedOrigins(origins: string | undefined): Set<string> {
  if (!origins) return new Set();
  return new Set(
    origins
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  );
}

function shouldStartProcessWorkers() {
  if (process.env.VERCEL === "1") {
    return false;
  }

  return true;
}

function shouldSeedOnStartup() {
  if (process.env.AUTO_SEED_ON_STARTUP === "true") {
    return true;
  }

  if (process.env.AUTO_SEED_ON_STARTUP === "false") {
    return false;
  }

  return process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";
}

function verifyCronSecret(req: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return process.env.NODE_ENV !== "production";
  }

  return req.get("authorization") === `Bearer ${configuredSecret}`;
}

function registerProcessHandlers() {
  if (processHandlersRegistered) {
    return;
  }

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

  processHandlersRegistered = true;
}

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function bootstrapApp(
  options: AppBootstrapOptions = {},
): Promise<AppRuntime> {
  const serveStaticClient = options.serveStaticClient ?? false;
  const startProcessWorkers =
    options.startProcessWorkers ?? shouldStartProcessWorkers();
  const seedOnStartup = options.seedOnStartup ?? shouldSeedOnStartup();
  const enableCronRoutes = options.enableCronRoutes ?? false;

  const app = express();
  const httpServer = createServer(app);

  const allowedCorsOrigins = parseAllowedOrigins(
    process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_ORIGINS,
  );

  if (
    process.env.TRUST_PROXY === "true" ||
    process.env.NODE_ENV === "production"
  ) {
    app.set("trust proxy", 1);
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
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, X-CSRF-Token, X-Telemetry-Key, X-API-Key, Authorization",
      );
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE",
      );
      res.setHeader("Access-Control-Expose-Headers", "X-CSRF-Token");
      res.append("Vary", "Origin");

      if (req.method === "OPTIONS") {
        return res.sendStatus(204);
      }

      return next();
    });
  }

  applySecurityHeaders(app);
  registerProcessHandlers();

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
      const severity =
        statusCode >= 500 ? "error" : statusCode >= 400 ? "warn" : "info";

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
          errorCode:
            typeof errorCodeHeader === "string" ? errorCodeHeader : null,
        }),
        "api",
      );
    });

    next();
  });

  setupAuth(app);

  if (startProcessWorkers) {
    backgroundJobService.start();
    retentionService.start();
  }

  app.use(
    createCsrfMiddleware({
      enforced: process.env.CSRF_ENFORCED === "true",
      exemptPaths: [
        "/api/track",
        "/api/leads",
        "/api/monitoring/client-errors",
        "/api/telemetry/sdk-ingest",
        "/api/telemetry/sdk-evaluate",
      ],
    }),
  );

  if (seedOnStartup) {
    await seedDatabase().catch((err) => {
      console.error("Failed to seed database:", err);
    });
  }

  await registerRoutes(httpServer, app);

  if (enableCronRoutes) {
    app.get("/api/cron/background-jobs", async (req, res) => {
      if (!verifyCronSecret(req)) {
        res.setHeader("X-Error-Code", "CRON_UNAUTHORIZED");
        return res.status(401).json({
          ok: false,
          message: "Unauthorized cron request",
          code: "CRON_UNAUTHORIZED",
        });
      }

      const result = await backgroundJobService.runPendingOnce();
      return res.json({ ok: true, result });
    });

    app.get("/api/cron/retention", async (req, res) => {
      if (!verifyCronSecret(req)) {
        res.setHeader("X-Error-Code", "CRON_UNAUTHORIZED");
        return res.status(401).json({
          ok: false,
          message: "Unauthorized cron request",
          code: "CRON_UNAUTHORIZED",
        });
      }

      const result = await retentionService.enforceDueRetention({
        actorName: "Vercel Cron",
      });
      return res.json({ ok: true, result });
    });
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
        requestId: req.requestId ?? null,
        organizationId: req.tenant?.organizationId ?? null,
        userId: (req.user as { id?: string } | undefined)?.id ?? null,
        route: req.path,
        method: req.method,
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
    return res
      .status(status)
      .json({ message, code: errorCode, requestId: req.requestId ?? null });
  });

  if (serveStaticClient) {
    serveStatic(app);
  }

  return { app, httpServer };
}

export function getVercelApp(): Promise<AppRuntime> {
  if (!vercelRuntimePromise) {
    vercelRuntimePromise = bootstrapApp({
      serveStaticClient: false,
      startProcessWorkers: false,
      seedOnStartup: false,
      enableCronRoutes: true,
    });
  }

  return vercelRuntimePromise;
}
