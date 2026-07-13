import express, { type Express, type Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { randomUUID } from "crypto";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { seedDatabase } from "./seed";
import { setupAuth } from "./auth";
import { applyCors } from "./cors";
import { applySecurityHeaders, createCsrfMiddleware } from "./security";
import { monitoringService } from "./services/monitoringService";
import { backgroundJobService } from "./services/backgroundJobService";
import { retentionService } from "./services/retentionService";
import {
  isProductionEnvironment,
  isVercelRuntime,
  parseBooleanEnv,
  validateRuntimeEnvironment,
} from "./env";
import { toPublicHttpError } from "./http-error-response";
import { secretsMatch } from "./secret-comparison";

declare module "http" {
  interface IncomingMessage {
    rawBody: Buffer;
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
let fatalProcessExitScheduled = false;

function shouldStartProcessWorkers() {
  return !isVercelRuntime();
}

function shouldSeedOnStartup() {
  // Development seed flags are always ignored in production. This keeps a
  // stale hosting-provider variable from either enabling seed behavior or
  // preventing an otherwise safe production process from starting.
  if (isProductionEnvironment()) {
    return false;
  }

  if (process.env.AUTO_SEED_ON_STARTUP !== undefined) {
    return parseBooleanEnv(process.env.AUTO_SEED_ON_STARTUP, false);
  }

  return !isVercelRuntime();
}

function verifyCronSecret(req: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
  if (!configuredSecret) {
    return !isProductionEnvironment();
  }

  const authorization = req.get("authorization") ?? "";
  const suppliedSecret = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  return secretsMatch(configuredSecret, suppliedSecret);
}

function registerProcessHandlers() {
  if (processHandlersRegistered) {
    return;
  }

  process.on("unhandledRejection", (reason) => {
    const reportPromise = monitoringService.reportProcessIssue({
      level: "error",
      event: "process.unhandled_rejection",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? null : null,
      metadata: {
        kind: typeof reason,
      },
    });

    if (!isProductionEnvironment() || fatalProcessExitScheduled) {
      void reportPromise.catch((reportError) => {
        console.error("Failed to report unhandled rejection:", reportError);
      });
      return;
    }

    fatalProcessExitScheduled = true;
    const forcedExit = setTimeout(() => process.exit(1), 2_500);
    forcedExit.unref();
    void reportPromise.then(
      () => {
        clearTimeout(forcedExit);
        process.exit(1);
      },
      (reportError) => {
        console.error("Failed to report unhandled rejection:", reportError);
        clearTimeout(forcedExit);
        process.exit(1);
      },
    );
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
  const runtimeConfig = validateRuntimeEnvironment();
  const serveStaticClient = options.serveStaticClient ?? false;
  const startProcessWorkers =
    options.startProcessWorkers ?? shouldStartProcessWorkers();
  const seedOnStartup = options.seedOnStartup ?? shouldSeedOnStartup();
  const enableCronRoutes = options.enableCronRoutes ?? false;

  const app = express();
  const httpServer = createServer(app);

  if (runtimeConfig.trustProxy) {
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

  applyCors(app, runtimeConfig.allowedCorsOrigins);

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
      enforced: runtimeConfig.csrfEnforced,
      exemptPaths: [
        "/api/health",
        "/api/ready",
        "/api/track",
        "/api/leads",
        "/api/monitoring/client-errors",
        "/api/telemetry/sdk-ingest",
        "/api/telemetry/sdk-evaluate",
        "/api/gateway/*",
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
    const publicError = toPublicHttpError(err);
    const internalMessage =
      typeof err?.message === "string" && err.message.trim()
        ? err.message.trim()
        : "Internal Server Error";

    console.error("Internal Server Error:", err);
    if (publicError.status >= 500) {
      void monitoringService.reportServerError({
        level: "error",
        event: "api.unhandled_error",
        message: internalMessage,
        requestId: req.requestId ?? null,
        organizationId: req.tenant?.organizationId ?? null,
        userId: (req.user as { id?: string } | undefined)?.id ?? null,
        route: req.path,
        method: req.method,
        status: publicError.status,
        stack: err instanceof Error ? err.stack ?? null : null,
        metadata: {
          errorCode: publicError.code,
        },
      });
    }

    if (res.headersSent) {
      return next(err);
    }

    res.setHeader("X-Error-Code", publicError.code);
    return res
      .status(publicError.status)
      .json({
        message: publicError.message,
        code: publicError.code,
        requestId: req.requestId ?? null,
      });
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
