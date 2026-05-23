import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant } from "../tenant";
import { exportService, type ExportType } from "../services/exportService";
import { sanitizeFilename, routeParam } from "./_helpers";
import { z } from "zod";

const exportRequestSchema = z.object({
  type: z.enum(["ai_systems", "system_controls", "approval_workflows", "audit_logs", "evidence_files"]),
});

export function registerExportRoutes(app: Express): void {
  app.post("/api/exports", requireAuth, requireTenant, async (req, res) => {
    try {
      const { type } = exportRequestSchema.parse(req.body);
      const created = await exportService.createExport({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        type: type as ExportType,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/exports/:exportId/download", requireAuth, requireTenant, async (req, res) => {
    try {
      const record = await exportService.getExportForDownload({
        organizationId: req.tenant!.organizationId,
        exportId: routeParam(req.params.exportId),
      });
      if (!record) {
        return res.status(404).json({ message: "Export not found" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(record.fileName)}"`);
      res.setHeader("Content-Type", record.mimeType);
      res.sendFile(record.filePath);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
