import type { Express } from "express";
import { db } from "../db";
import { backgroundJobService } from "../services/backgroundJobService";
import { monitoringService } from "../services/monitoringService";
import {
  getEvidenceStorageReadiness,
  getReleaseIdentity,
} from "../runtime-readiness";
import { sql } from "drizzle-orm";
import { z } from "zod";
import {
  enforceSharedRateLimits,
  getRateLimitClientAddress,
  globalRateLimitIdentity,
  publicRateLimitPolicies,
} from "../public-rate-limit";
import { boundedPublicMetadataSchema } from "../public-payload";

const clientErrorEventSchema = z.object({
  event: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  route: z.string().min(1).max(500),
  requestId: z.string().min(1).max(100).nullable().optional(),
  stack: z.string().max(12000).nullable().optional(),
  metadata: boundedPublicMetadataSchema.nullable().optional(),
});

export function registerHealthRoutes(app: Express): void {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "ai-control-grid",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/ready", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const release = getReleaseIdentity();
    try {
      await db.execute(sql`select 1`);
      const queue = await backgroundJobService.getGlobalSummary();
      const evidenceStorage = getEvidenceStorageReadiness();
      const backgroundJobsReady = queue.workerHealthy;
      const payload = {
        ok: backgroundJobsReady && evidenceStorage.ready,
        ready: backgroundJobsReady && evidenceStorage.ready,
        service: "ai-control-grid",
        release,
        checks: {
          database: { ready: true },
          backgroundJobs: {
            ready: backgroundJobsReady,
            workerEnabled: queue.workerEnabled,
            workerRunning: queue.workerRunning,
            workerHealthy: queue.workerHealthy,
            lastSuccessfulRunAt: queue.lastSuccessfulRunAt,
            lastFailedRunAt: queue.lastFailedRunAt,
          },
          evidenceStorage,
        },
        queue,
        timestamp: new Date().toISOString(),
      };

      if (!backgroundJobsReady) {
        const code = "BACKGROUND_JOBS_NOT_READY";
        res.setHeader("X-Error-Code", code);
        return res.status(503).json({
          ...payload,
          ok: false,
          ready: false,
          message: "Background job worker is not ready",
          code,
        });
      }

      if (!evidenceStorage.ready) {
        const code = evidenceStorage.code ?? "EVIDENCE_STORAGE_NOT_READY";
        res.setHeader("X-Error-Code", code);
        return res.status(503).json({
          ...payload,
          ok: false,
          ready: false,
          message: "Evidence storage is not ready",
          code,
        });
      }

      return res.json(payload);
    } catch (error) {
      console.error("Readiness check failed", error);
      res.setHeader("X-Error-Code", "READINESS_CHECK_FAILED");
      return res.status(503).json({
        ok: false,
        ready: false,
        service: "ai-control-grid",
        release,
        message: "Readiness check failed",
        code: "READINESS_CHECK_FAILED",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/monitoring/client-errors", async (req, res) => {
    const clientAddress = getRateLimitClientAddress(req);
    if (
      !(await enforceSharedRateLimits(req, res, [
        { policy: publicRateLimitPolicies.clientErrorGlobal, identity: globalRateLimitIdentity() },
        { policy: publicRateLimitPolicies.clientErrorIp, identity: [clientAddress] },
      ]))
    ) {
      return;
    }

    const parsed = clientErrorEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.setHeader("X-Error-Code", "CLIENT_ERROR_PAYLOAD_INVALID");
      return res.status(400).json({
        message: "Invalid client error payload",
        code: "CLIENT_ERROR_PAYLOAD_INVALID",
      });
    }

    const payload = parsed.data;
    await monitoringService.reportClientError({
      level: "error",
      event: payload.event,
      message: payload.message,
      requestId: payload.requestId ?? req.requestId ?? null,
      route: payload.route,
      stack: payload.stack ?? null,
      metadata: payload.metadata ?? null,
    });

    return res.status(202).json({ ok: true });
  });
}
