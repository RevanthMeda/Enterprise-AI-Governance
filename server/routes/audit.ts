import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { auditService } from "../services/auditService";
import { decisionAuditService } from "../services/decisionAuditService";
import { retentionService } from "../services/retentionService";
import { enrichAuditLogsWithContext, getErrorStatus, routeParam } from "./_helpers";
import { z } from "zod";

const decisionAuditPayloadSchema = z.object({
  systemId: z.string().trim().min(1).max(120),
  workflowId: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  businessObjective: z.string().trim().max(1000).optional().nullable(),
  modelName: z.string().trim().max(200).optional().nullable(),
  modelVersion: z.string().trim().max(120).optional().nullable(),
  promptText: z.string().trim().max(16000).optional().nullable(),
  inputSources: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  decisionConstraints: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional().nullable(),
  uncertaintyScore: z.number().int().min(0).max(100).optional().nullable(),
  explainabilityFactors: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  documentationStatus: z.enum(["draft", "reviewed", "sealed"]).optional(),
  decisionContext: z.string().trim().min(1).max(6000),
  aiOutput: z.string().trim().min(1).max(12000),
  humanOutput: z.string().trim().max(12000).optional().nullable(),
  overrideDiff: z.string().trim().max(12000).optional().nullable(),
  overrideRationale: z.string().trim().max(4000).optional().nullable(),
  outcome30d: z.record(z.string(), z.unknown()).optional(),
  outcome60d: z.record(z.string(), z.unknown()).optional(),
  outcome90d: z.record(z.string(), z.unknown()).optional(),
  outcomeSummary: z.string().trim().max(4000).optional().nullable(),
  reviewedBy: z.string().trim().max(200).optional().nullable(),
  versionReason: z.string().trim().max(1000).optional().nullable(),
});

const decisionAuditLegalHoldSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

export function registerAuditRoutes(app: Express): void {
  app.get(
    "/api/audit-logs",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "auditor"),
    async (req, res) => {
      const filters = {
        action: req.query.action as string | undefined,
        entityType: req.query.entityType as string | undefined,
        performedBy: req.query.performedBy as string | undefined,
        dateFrom: req.query.dateFrom as string | undefined,
        dateTo: req.query.dateTo as string | undefined,
      };
      const logs = await auditService.listLogs({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        filters,
      });
      res.json(await enrichAuditLogsWithContext(req.tenant!.organizationId, logs));
    },
  );

  app.get(
    "/api/audit-logs/verify-chain",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "auditor"),
    async (req, res) => {
      const result = await auditService.verifyChain({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.status(result.ok ? 200 : 409).json(result);
    },
  );

  app.get(
    "/api/decision-audits",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const rows = await decisionAuditService.listForOrg(req.tenant!.organizationId, {
        systemId: req.query.systemId as string | undefined,
        workflowId: req.query.workflowId as string | undefined,
      });
      res.json(rows);
    },
  );

  app.get(
    "/api/decision-audits/summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const summary = await decisionAuditService.getSummaryForOrg(req.tenant!.organizationId);
      res.json(summary);
    },
  );

  app.get(
    "/api/decision-audits/retention-summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const summary = await retentionService.getSummaryForOrg(req.tenant!.organizationId);
      res.json(summary);
    },
  );

  app.get(
    "/api/decision-audits/:id/versions",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const versions = await decisionAuditService.listVersionsForOrg(req.tenant!.organizationId, routeParam(req.params.id));
      res.json(versions);
    },
  );

  app.post(
    "/api/decision-audits",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = decisionAuditPayloadSchema.parse(req.body);
        const created = await decisionAuditService.createForOrg(req.tenant!.organizationId, {
          ...parsed,
          workflowId: parsed.workflowId ?? null,
          businessObjective: parsed.businessObjective ?? null,
          modelName: parsed.modelName ?? null,
          modelVersion: parsed.modelVersion ?? null,
          promptText: parsed.promptText ?? null,
          inputSources: parsed.inputSources ?? [],
          inputSnapshot: parsed.inputSnapshot ?? {},
          decisionConstraints: parsed.decisionConstraints ?? [],
          confidenceScore: parsed.confidenceScore ?? null,
          uncertaintyScore: parsed.uncertaintyScore ?? null,
          explainabilityFactors: parsed.explainabilityFactors ?? [],
          documentationStatus: parsed.documentationStatus ?? "sealed",
          humanOutput: parsed.humanOutput ?? null,
          overrideDiff: parsed.overrideDiff ?? null,
          overrideRationale: parsed.overrideRationale ?? null,
          outcome30d: parsed.outcome30d ?? {},
          outcome60d: parsed.outcome60d ?? {},
          outcome90d: parsed.outcome90d ?? {},
          outcomeSummary: parsed.outcomeSummary ?? null,
          reviewedBy: parsed.reviewedBy ?? null,
          createdBy: req.user!.fullName,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "decision_audit",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Decision trace \"${created.title}\" recorded`,
          },
        });
        res.status(201).json(created);
      } catch (err: any) {
        res.status(getErrorStatus(err)).json({ message: err.message || "Failed to create decision trace" });
      }
    },
  );

  app.patch(
    "/api/decision-audits/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = decisionAuditPayloadSchema.partial().parse(req.body);
        const updated = await decisionAuditService.updateForOrg(req.tenant!.organizationId, routeParam(req.params.id), {
          ...parsed,
          workflowId: parsed.workflowId ?? undefined,
          businessObjective: parsed.businessObjective ?? undefined,
          modelName: parsed.modelName ?? undefined,
          modelVersion: parsed.modelVersion ?? undefined,
          promptText: parsed.promptText ?? undefined,
          inputSources: parsed.inputSources ?? undefined,
          inputSnapshot: parsed.inputSnapshot ?? undefined,
          decisionConstraints: parsed.decisionConstraints ?? undefined,
          confidenceScore: parsed.confidenceScore ?? undefined,
          uncertaintyScore: parsed.uncertaintyScore ?? undefined,
          explainabilityFactors: parsed.explainabilityFactors ?? undefined,
          documentationStatus: parsed.documentationStatus ?? undefined,
          humanOutput: parsed.humanOutput ?? undefined,
          overrideDiff: parsed.overrideDiff ?? undefined,
          overrideRationale: parsed.overrideRationale ?? undefined,
          outcome30d: parsed.outcome30d ?? undefined,
          outcome60d: parsed.outcome60d ?? undefined,
          outcome90d: parsed.outcome90d ?? undefined,
          outcomeSummary: parsed.outcomeSummary ?? undefined,
          reviewedBy: parsed.reviewedBy ?? undefined,
          versionReason: parsed.versionReason ?? undefined,
          actorName: req.user!.fullName,
        });
        if (!updated) {
          return res.status(404).json({ message: "Decision trace not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "decision_audit",
            entityId: updated.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Decision trace \"${updated.title}\" updated to v${updated.currentVersionNumber}`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(getErrorStatus(err)).json({ message: err.message || "Failed to update decision trace" });
      }
    },
  );

  app.post(
    "/api/decision-audits/:id/legal-hold",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = decisionAuditLegalHoldSchema.parse(req.body);
        const updated = await retentionService.setLegalHold({
          organizationId: req.tenant!.organizationId,
          decisionAuditId: routeParam(req.params.id),
          enabled: parsed.enabled,
          reason: parsed.reason ?? null,
          actorName: req.user!.fullName,
        });
        if (!updated) {
          return res.status(404).json({ message: "Decision trace not found" });
        }
        res.json(updated);
      } catch (err: any) {
        res.status(err?.status ?? 400).json({ message: err.message || "Failed to update legal hold" });
      }
    },
  );

  app.post(
    "/api/decision-audits/retention-enforce",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const result = await retentionService.enforceDueRetention({
        organizationId: req.tenant!.organizationId,
        actorName: req.user!.fullName,
      });
      res.json(result);
    },
  );
}
