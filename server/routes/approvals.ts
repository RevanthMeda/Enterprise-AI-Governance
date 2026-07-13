import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { storage } from "../storage";
import { insertApprovalWorkflowSchema, type ApprovalWorkflow } from "@shared/schema";
import { workflowService } from "../services/workflowService";
import { auditService } from "../services/auditService";
import { jiraService } from "../services/jiraService";
import { decisionAuditService } from "../services/decisionAuditService";
import { compileLawPackRuntimeOverlay, resolveWorkflowLawPackIds, resolveWorkflowLegalProfile } from "@shared/law-packs";
import { notifyAllAdmins, notifyUser, routeParam } from "./_helpers";

export function registerApprovalsRoutes(app: Express): void {
  app.get(
    "/api/approval-workflows",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      const filters = {
        status: req.query.status as string | undefined,
        priority: req.query.priority as string | undefined,
        systemId: req.query.systemId as string | undefined,
      };
      const workflows = await workflowService.listWorkflows({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        filters,
      });
      res.json(workflows);
    },
  );

  app.post(
    "/api/approval-workflows",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      let committedWorkflow: ApprovalWorkflow | undefined;
      try {
        const parsed = insertApprovalWorkflowSchema.parse(req.body);
        const wf = await workflowService.createWorkflow({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: parsed,
        });
        committedWorkflow = wf;
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "approval_workflow",
            entityId: wf.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Approval workflow "${wf.title}" created and routed to ${wf.committeeType?.replace(/_/g, " ") || "technical team"} as ${wf.decisionTier?.replace("_", " ") || "tier 1"}`,
          },
        });
        const linkedSystem = await storage.getAiSystemById(req.tenant!.organizationId, wf.systemId);
        if (wf.reviewer) {
          const reviewer = await workflowService.findUserByNameOrUsername({
            organizationId: req.tenant!.organizationId,
            identity: wf.reviewer,
          });
          if (reviewer) {
            const workflowLawPackIds = resolveWorkflowLawPackIds(wf, linkedSystem ?? undefined);
            await notifyUser(
              req.tenant!.organizationId,
              reviewer.id,
              "Approval Request Assigned",
              `You have been assigned to review "${wf.title}"`,
              "approval_assigned",
              "approval_workflow",
              wf.id,
              {
                legalProfileApplied: resolveWorkflowLegalProfile(wf, linkedSystem ?? undefined),
                lawPackIdsApplied: workflowLawPackIds,
                lawPackDecisionConstraints: compileLawPackRuntimeOverlay(workflowLawPackIds).decisionConstraints,
              },
            );
          }
        }
        const jiraSync = await jiraService.syncWorkflowIfNeeded({
          organizationId: req.tenant!.organizationId,
          workflow: wf,
          systemName: linkedSystem?.name ?? wf.systemId,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        if (jiraSync.status === "linked" && jiraSync.issueKey) {
          await auditService.createLog({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            input: {
              entityType: "approval_workflow",
              entityId: wf.id,
              action: "jira_linked",
              performedBy: req.user!.fullName,
              details: `Linked Jira issue ${jiraSync.issueKey} for workflow \"${wf.title}\"`,
            },
          });
        }
        if (jiraSync.status === "error") {
          const workflowLawPackIds = resolveWorkflowLawPackIds(wf, linkedSystem ?? undefined);
          await notifyAllAdmins(
            req.tenant!.organizationId,
            "Jira sync failed",
            `Workflow \"${wf.title}\" could not be synced to Jira: ${jiraSync.message}`,
            "workflow_status_changed",
            "approval_workflow",
            wf.id,
            {
              legalProfileApplied: resolveWorkflowLegalProfile(wf, linkedSystem ?? undefined),
              lawPackIdsApplied: workflowLawPackIds,
            },
          );
        }
        const finalWorkflow = jiraSync.workflow ?? wf;
        committedWorkflow = finalWorkflow;
        await decisionAuditService.syncWorkflowTrace({
          organizationId: req.tenant!.organizationId,
          workflow: finalWorkflow,
          actorName: req.user!.fullName,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        return res.status(201).json(finalWorkflow);
      } catch (err: any) {
        if (committedWorkflow) {
          console.error("[approval] Post-create processing failed after the workflow was committed", {
            workflowId: committedWorkflow.id,
            requestId: req.requestId,
            errorName: err instanceof Error ? err.name : "UnknownError",
          });
          return res.status(201).json({
            ...committedWorkflow,
            postCommitWarning: "Workflow saved, but one or more follow-up operations need review.",
          });
        }
        return res.status(err?.status ?? 400).json({ message: err.message || "Failed to create workflow" });
      }
    },
  );

  app.patch(
    "/api/approval-workflows/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      let committedWorkflow: ApprovalWorkflow | undefined;
      try {
        const updated = await workflowService.updateWorkflow({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          workflowId: routeParam(req.params.id),
          input: req.body,
        });
        if (!updated) return res.status(404).json({ message: "Workflow not found" });
        committedWorkflow = updated;
        const action = req.body.status === "approved" ? "approved" : req.body.status === "rejected" ? "rejected" : "status_changed";
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "approval_workflow",
            entityId: updated.id,
            action,
            performedBy: req.user!.fullName,
            details: `Workflow "${updated.title}" ${action} under ${updated.decisionTier?.replace("_", " ") || "tier 1"} / ${updated.committeeType?.replace(/_/g, " ") || "technical team"}`,
          },
        });
        const requester = await workflowService.findUserByNameOrUsername({
          organizationId: req.tenant!.organizationId,
          identity: updated.requestedBy,
        });
        const linkedSystem = await storage.getAiSystemById(req.tenant!.organizationId, updated.systemId);
        if (requester) {
          const workflowLawPackIds = resolveWorkflowLawPackIds(updated, linkedSystem ?? undefined);
          await notifyUser(
            req.tenant!.organizationId,
            requester.id,
            `Workflow ${action}`,
            `Your workflow "${updated.title}" has been ${action}`,
            "workflow_status_changed",
            "approval_workflow",
            updated.id,
            {
              legalProfileApplied: resolveWorkflowLegalProfile(updated, linkedSystem ?? undefined),
              lawPackIdsApplied: workflowLawPackIds,
            },
          );
        }
        const jiraSync = await jiraService.syncWorkflowIfNeeded({
          organizationId: req.tenant!.organizationId,
          workflow: updated,
          systemName: linkedSystem?.name ?? updated.systemId,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        if (jiraSync.status === "linked" && jiraSync.issueKey) {
          await auditService.createLog({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            input: {
              entityType: "approval_workflow",
              entityId: updated.id,
              action: "jira_linked",
              performedBy: req.user!.fullName,
              details: `Linked Jira issue ${jiraSync.issueKey} for workflow \"${updated.title}\"`,
            },
          });
        }
        const finalWorkflow = jiraSync.workflow ?? updated;
        committedWorkflow = finalWorkflow;
        await decisionAuditService.syncWorkflowTrace({
          organizationId: req.tenant!.organizationId,
          workflow: finalWorkflow,
          actorName: req.user!.fullName,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        return res.json(finalWorkflow);
      } catch (err: any) {
        if (committedWorkflow) {
          console.error("[approval] Post-update processing failed after the workflow was committed", {
            workflowId: committedWorkflow.id,
            requestId: req.requestId,
            errorName: err instanceof Error ? err.name : "UnknownError",
          });
          return res.status(200).json({
            ...committedWorkflow,
            postCommitWarning: "Workflow saved, but one or more follow-up operations need review.",
          });
        }
        return res.status(err?.status ?? 400).json({ message: err.message || "Failed to update workflow" });
      }
    },
  );

  app.post(
    "/api/approval-workflows/:id/jira-sync",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const workflow = await workflowService.getWorkflow({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          workflowId: routeParam(req.params.id),
        });
        if (!workflow) return res.status(404).json({ message: "Workflow not found" });

        const result = await jiraService.refreshWorkflowIssueStatus(req.tenant!.organizationId, workflow);
        if (result.status === "linked" && result.remoteStatus) {
          await auditService.createLog({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            input: {
              entityType: "approval_workflow",
              entityId: workflow.id,
              action: "jira_status_synced",
              performedBy: req.user!.fullName,
              details: `Synced Jira issue ${workflow.jiraIssueKey}: ${result.remoteStatus.name ?? "Unknown status"}`,
            },
          });
        }

        res.status(200).json(result);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to sync Jira status" });
      }
    },
  );
}
