import type { Express } from "express";
import { db } from "../db";
import { backgroundJobService } from "../services/backgroundJobService";
import { monitoringService } from "../services/monitoringService";
import { sql } from "drizzle-orm";
import { z } from "zod";

const clientErrorEventSchema = z.object({
  event: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  route: z.string().min(1).max(500),
  requestId: z.string().min(1).max(100).nullable().optional(),
  stack: z.string().max(12000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
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
    try {
      await db.execute(sql`select 1`);
      const queue = await backgroundJobService.getGlobalSummary();
      res.json({
        ok: true,
        ready: true,
        service: "ai-control-grid",
        queue,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.setHeader("X-Error-Code", "READINESS_CHECK_FAILED");
      res.status(503).json({
        ok: false,
        ready: false,
        service: "ai-control-grid",
        message: error instanceof Error ? error.message : "Readiness check failed",
        code: "READINESS_CHECK_FAILED",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/monitoring/client-errors", async (req, res) => {
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
