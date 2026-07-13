import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant } from "../tenant";
import { exportService, type ExportType } from "../services/exportService";
import { sanitizeFilename, routeParam } from "./_helpers";
import { z } from "zod";
import {
  enforceSharedRateLimits,
  getRateLimitClientAddress,
} from "../public-rate-limit";
import { resourceRateLimitPolicies } from "../resource-abuse";
import { toPublicHttpError } from "../http-error-response";

const exportRequestSchema = z.object({
  type: z.enum(["ai_systems", "system_controls", "approval_workflows", "audit_logs", "evidence_files"]),
});

export function registerExportRoutes(app: Express): void {
  app.post("/api/exports", requireAuth, requireTenant, async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const clientAddress = getRateLimitClientAddress(req);
    if (!(await enforceSharedRateLimits(req, res, [
      { policy: resourceRateLimitPolicies.exportCreateOrg, identity: [organizationId] },
      { policy: resourceRateLimitPolicies.exportCreateUser, identity: [organizationId, req.user!.id] },
      { policy: resourceRateLimitPolicies.exportCreateIp, identity: [clientAddress] },
    ]))) return;

    const parsed = exportRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "A supported export type is required",
        code: "INVALID_EXPORT_REQUEST",
      });
    }

    try {
      const created = await exportService.createExport({
        organizationId,
        actor: req.user!,
        membershipRole: req.tenant!.membershipRole,
        type: parsed.data.type as ExportType,
      });
      res.status(201).json(created);
    } catch (error) {
      const publicError = toPublicHttpError(error, {
        fallbackStatus: 500,
        internalMessage: "Failed to create export",
      });
      console.error("Failed to create export", {
        requestId: req.requestId ?? null,
        organizationId,
        error: error instanceof Error ? error.message : "Unknown export error",
      });
      res.setHeader("X-Error-Code", publicError.code);
      res.status(publicError.status).json({ message: publicError.message, code: publicError.code });
    }
  });

  app.get("/api/exports/:exportId/download", requireAuth, requireTenant, async (req, res) => {
    const organizationId = req.tenant!.organizationId;
    const clientAddress = getRateLimitClientAddress(req);
    if (!(await enforceSharedRateLimits(req, res, [
      { policy: resourceRateLimitPolicies.exportDownloadOrg, identity: [organizationId] },
      { policy: resourceRateLimitPolicies.exportDownloadUser, identity: [organizationId, req.user!.id] },
      { policy: resourceRateLimitPolicies.exportDownloadIp, identity: [clientAddress] },
    ]))) return;

    try {
      const record = await exportService.claimExportForDownload({
        organizationId,
        exportId: routeParam(req.params.exportId),
        actorUserId: req.user!.id,
        membershipRole: req.tenant!.membershipRole,
      });
      if (!record) {
        return res.status(404).json({ message: "Export not found" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(record.fileName)}"`);
      res.setHeader("Content-Type", record.mimeType);
      res.setHeader("Cache-Control", "no-store");
      return res.sendFile(record.filePath, (error) => {
        if (error) {
          exportService.releaseDownload(record.exportId);
          console.error("Failed to send export", {
            requestId: req.requestId ?? null,
            exportId: record.exportId,
            error: error.message,
          });
          if (!res.headersSent) {
            res.setHeader("X-Error-Code", "EXPORT_DOWNLOAD_FAILED");
            res.status(500).json({
              message: "Failed to download export",
              code: "EXPORT_DOWNLOAD_FAILED",
            });
          } else if (!res.writableEnded) {
            res.end();
          }
          return;
        }
        void exportService.completeDownload(record.exportId).catch((cleanupError) => {
          console.error("Failed to clean completed export", {
            exportId: record.exportId,
            error: cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error",
          });
        });
      });
    } catch (error) {
      const publicError = toPublicHttpError(error, {
        fallbackStatus: 500,
        internalMessage: "Failed to download export",
      });
      console.error("Failed to prepare export download", {
        requestId: req.requestId ?? null,
        organizationId,
        error: error instanceof Error ? error.message : "Unknown export error",
      });
      res.setHeader("X-Error-Code", publicError.code);
      return res.status(publicError.status).json({ message: publicError.message, code: publicError.code });
    }
  });
}
