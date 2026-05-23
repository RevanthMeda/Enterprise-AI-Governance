import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { incidentService } from "../services/incidentService";
import { incidentResolutionSuggestionService } from "../services/incidentResolutionSuggestionService";
import { auditService } from "../services/auditService";
import { notificationService } from "../services/notificationService";
import { notifyAllAdmins, routeParam } from "./_helpers";
import { evaluateIncidentPriority, summarizeIncidentPriorities } from "@shared/incident-prioritization";
import { incidentCategories, incidentSeverities, incidentStatuses } from "@shared/schema";
import { z } from "zod";

const incidentPayloadSchema = z.object({
  systemId: z.string().trim().max(120).optional().nullable(),
  workflowId: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  category: z.enum(incidentCategories),
  severity: z.enum(incidentSeverities).default("medium"),
  status: z.enum(incidentStatuses).default("open"),
  description: z.string().trim().min(1).max(6000),
  playbook: z.record(z.string(), z.unknown()).optional(),
  rootCause: z.string().trim().max(4000).optional().nullable(),
  postIncidentReview: z.record(z.string(), z.unknown()).optional(),
  affectedDecisionTraceIds: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  regulatoryNotifications: z.array(
    z.object({
      authority: z.string().trim().min(1).max(200),
      status: z.enum(["planned", "sent", "not_required"]),
      notes: z.string().trim().max(1000).optional().nullable(),
      completedAt: z.string().trim().datetime().optional().nullable(),
    }),
  ).max(20).optional(),
  owner: z.string().trim().max(200).optional().nullable(),
  escalatedTo: z.string().trim().max(200).optional().nullable(),
  detectedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  containedAt: z.coerce.date().optional().nullable(),
  resolvedAt: z.coerce.date().optional().nullable(),
  postmortemCompletedAt: z.coerce.date().optional().nullable(),
});

export function registerIncidentsRoutes(app: Express): void {
  app.get(
    "/api/incidents",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const rows = await incidentService.listForOrg(req.tenant!.organizationId, {
        status: req.query.status as string | undefined,
        severity: req.query.severity as string | undefined,
      });
      const enriched = rows.map((row) => ({
        ...row,
        priority: evaluateIncidentPriority(row),
      }));
      res.json(enriched);
    },
  );

  app.get(
    "/api/incidents/summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const [summary, incidents] = await Promise.all([
        incidentService.getSummaryForOrg(req.tenant!.organizationId),
        incidentService.listForOrg(req.tenant!.organizationId, { status: "all" }),
      ]);
      res.json({
        ...summary,
        ...summarizeIncidentPriorities(incidents),
      });
    },
  );

  app.get(
    "/api/incidents/assignees",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const assignees = await incidentService.listAssignableOwnersForOrg(req.tenant!.organizationId);
      res.json(assignees);
    },
  );

  app.get(
    "/api/incidents/:id/resolution-suggestion",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const suggestion = await incidentResolutionSuggestionService.getForIncident(
        req.tenant!.organizationId,
        routeParam(req.params.id),
      );
      if (!suggestion) {
        return res.status(404).json({ message: "Incident not found" });
      }
      return res.json(suggestion);
    },
  );

  app.post(
    "/api/incidents",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = incidentPayloadSchema.parse(req.body);
        const created = await incidentService.createForOrg(req.tenant!.organizationId, {
          ...parsed,
          systemId: parsed.systemId ?? null,
          workflowId: parsed.workflowId ?? null,
          playbook: parsed.playbook ?? {},
          rootCause: parsed.rootCause ?? null,
          postIncidentReview: parsed.postIncidentReview ?? {},
          affectedDecisionTraceIds: parsed.affectedDecisionTraceIds ?? [],
          regulatoryNotifications: parsed.regulatoryNotifications ?? [],
          owner: parsed.owner ?? null,
          escalatedTo: parsed.escalatedTo ?? null,
          dueAt: parsed.dueAt ?? null,
          containedAt: parsed.containedAt ?? null,
          resolvedAt: parsed.resolvedAt ?? null,
          postmortemCompletedAt: parsed.postmortemCompletedAt ?? null,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_incident",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `AI incident \"${created.title}\" opened`,
          },
        });
        const assignment = incidentService.getAssignmentMetadata(created.playbook);
        if (assignment?.ownerUserId) {
          const priority = evaluateIncidentPriority(created);
          await notificationService.createForUser({
            organizationId: req.tenant!.organizationId,
            userId: assignment.ownerUserId,
            input: {
              title: "AI incident assigned",
              message: `${created.severity.toUpperCase()} incident "${created.title}" has been assigned to you for review.`,
              type: "workflow_status_changed",
              entityType: "ai_incident",
              entityId: created.id,
              metadata: {
                incidentId: created.id,
                assignmentRole: assignment.ownerRole,
                autoAssigned: assignment.autoAssigned,
                incidentPriorityLevel: priority.level,
                incidentPriorityScore: priority.score,
                incidentPriorityReasons: priority.reasons,
              },
              read: false,
            },
          });
        }
        if (created.severity === "critical" || created.severity === "high") {
          await notifyAllAdmins(
            req.tenant!.organizationId,
            `AI incident: ${created.title}`,
            `${created.severity.toUpperCase()} incident opened in category ${created.category}.`,
            "workflow_status_changed",
            "ai_incident",
            created.id,
          );
        }
        res.status(201).json(created);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to create incident" });
      }
    },
  );

  app.patch(
    "/api/incidents/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = incidentPayloadSchema.partial().parse(req.body);
        const updated = await incidentService.updateForOrg(req.tenant!.organizationId, routeParam(req.params.id), {
          ...parsed,
          playbook: parsed.playbook ?? undefined,
          rootCause: parsed.rootCause ?? undefined,
          postIncidentReview: parsed.postIncidentReview ?? undefined,
          affectedDecisionTraceIds: parsed.affectedDecisionTraceIds ?? undefined,
          regulatoryNotifications: parsed.regulatoryNotifications ?? undefined,
          owner: parsed.owner ?? undefined,
          escalatedTo: parsed.escalatedTo ?? undefined,
          dueAt: parsed.dueAt ?? undefined,
          containedAt: parsed.containedAt ?? undefined,
          resolvedAt: parsed.resolvedAt ?? undefined,
          postmortemCompletedAt: parsed.postmortemCompletedAt ?? undefined,
        });
        if (!updated) {
          return res.status(404).json({ message: "Incident not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_incident",
            entityId: updated.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `AI incident \"${updated.title}\" moved to ${updated.status}`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to update incident" });
      }
    },
  );
}
