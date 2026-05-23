import type { Express } from "express";
import path from "path";
import fs from "fs";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { storage } from "../storage";
import { insertSystemControlSchema } from "@shared/schema";
import { controlService } from "../services/controlService";
import { evidenceService } from "../services/evidenceService";
import { auditService } from "../services/auditService";
import { upload, uploadDir, sanitizeFilename, routeParam } from "./_helpers";

export function registerComplianceRoutes(app: Express): void {
  app.get("/api/compliance-controls", requireAuth, async (_req, res) => {
    const controls = await storage.getComplianceControls();
    res.json(controls);
  });

  app.get("/api/system-controls", requireAuth, requireTenant, async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      systemId: req.query.systemId as string | undefined,
      assignee: req.query.assignee as string | undefined,
    };
    const controls = await controlService.listControls({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      filters,
    });
    res.json(controls);
  });

  app.post(
    "/api/system-controls",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const parsed = insertSystemControlSchema.parse(req.body);
        const sc = await controlService.createControlAssignment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: parsed,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "system_control",
            entityId: sc.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Control "${sc.controlId}" assigned to system "${sc.systemId}"`,
          },
        });
        res.status(201).json(sc);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.patch(
    "/api/system-controls/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner", "reviewer"),
    async (req, res) => {
      try {
        const parsed = insertSystemControlSchema.partial().parse(req.body ?? {});
        const updated = await controlService.updateControlAssignment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          controlId: routeParam(req.params.id),
          input: parsed,
        });
        if (!updated) return res.status(404).json({ message: "Control not found" });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "system_control",
            entityId: updated.id,
            action: "status_changed",
            performedBy: req.user!.fullName,
            details: `Control status changed to "${updated.status}"`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(err?.status ?? 400).json({ message: err.message || "Failed to update control" });
      }
    },
  );

  app.post(
    "/api/system-controls/bulk",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const { systemIds, controlIds } = req.body;
        if (!Array.isArray(systemIds) || !Array.isArray(controlIds) || systemIds.length === 0 || controlIds.length === 0) {
          return res.status(400).json({ message: "systemIds and controlIds arrays are required" });
        }
        const result = await controlService.bulkAssignControls({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemIds,
          controlIds,
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "system_control",
            entityId: "bulk",
            action: "bulk_assigned",
            performedBy: req.user!.fullName,
            details: `Bulk assigned ${controlIds.length} controls to ${systemIds.length} systems (${result.total} new assignments)`,
          },
        });

        res.status(201).json(result);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.get(
    "/api/evidence",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const filters = {
          systemId: req.query.systemId as string | undefined,
          controlId: req.query.controlId as string | undefined,
          workflowId: req.query.workflowId as string | undefined,
        };
        const files = await evidenceService.listEvidence({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          filters,
        });
        res.json(files);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/evidence",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) {
          return res.status(400).json({ message: "No file uploaded" });
        }
        const { systemId, controlId, workflowId } = req.body;
        if (!systemId) {
          return res.status(400).json({ message: "systemId is required" });
        }
        const metadata: Record<string, unknown> = {};
        if (typeof req.body.category === "string" && req.body.category.trim()) {
          metadata.category = req.body.category.trim().slice(0, 80);
        }
        if (typeof req.body.tags === "string" && req.body.tags.trim()) {
          metadata.tags = req.body.tags
            .split(",")
            .map((tag: string) => tag.trim())
            .filter(Boolean)
            .slice(0, 12);
        }
        if (typeof req.body.expiryDate === "string" && req.body.expiryDate.trim()) {
          metadata.expiryDate = req.body.expiryDate.trim();
        }
        const evidence = await evidenceService.createEvidence({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            systemId,
            controlId: controlId || null,
            workflowId: workflowId || null,
            fileName: req.file.originalname,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            filePath: `${req.tenant!.organizationId}/${req.file.filename}`,
            metadata,
          },
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "evidence_file",
            entityId: evidence.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Evidence file "${req.file.originalname}" uploaded for system ${systemId}${Array.isArray((evidence.metadata as Record<string, unknown> | null)?.lawPackIdsApplied) ? ` under law packs ${((evidence.metadata as Record<string, unknown>).lawPackIdsApplied as string[]).join(", ")}` : ""}`,
          },
        });
        res.status(201).json(evidence);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.get(
    "/api/evidence/:id/download",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const file = await evidenceService.getEvidenceFile({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          evidenceId: routeParam(req.params.id),
        });
        if (!file) return res.status(404).json({ message: "File not found" });
        const filePath = path.join(uploadDir, file.filePath);
        if (!fs.existsSync(filePath)) {
          return res.status(404).json({ message: "File not found on disk" });
        }
        res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(file.fileName)}"`);
        res.setHeader("Content-Type", file.mimeType);
        const stream = fs.createReadStream(path.resolve(filePath));
        stream.on("error", (err) => {
          if (!res.headersSent) {
            res.status(500).json({ message: err.message || "Failed to stream evidence file" });
          } else {
            res.end();
          }
        });
        stream.pipe(res);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  app.delete(
    "/api/evidence/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      const file = await evidenceService.getEvidenceFile({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        evidenceId: routeParam(req.params.id),
      });
      if (!file) return res.status(404).json({ message: "File not found" });
      const filePath = path.join(uploadDir, file.filePath);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      await evidenceService.deleteEvidence({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        evidenceId: routeParam(req.params.id),
      });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "evidence_file",
          entityId: routeParam(req.params.id),
          action: "deleted",
          performedBy: req.user!.fullName,
          details: `Evidence file "${file.fileName}" deleted`,
        },
      });
      res.status(204).send();
    },
  );
}
