import type {
  AutomationActionPreview,
  GovernanceAutomationRunResponse,
  GovernanceAutomationSummaryResponse,
} from "@shared/governance-events";
import {
  type GovernanceAutomationConfig,
  type GovernanceAutomationRuleConfig,
  sanitizeGovernanceAutomationConfig,
} from "@shared/governance-automation-builder";
import { storage } from "../storage";
import { auditService } from "./auditService";
import { governanceEventService } from "./governanceEventService";
import { incidentService } from "./incidentService";
import { notificationService } from "./notificationService";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

type RemediationTarget = {
  userId: string;
  fullName: string;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

const severityRank: Record<string, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

export class GovernanceAutomationService {
  private async getUserDirectory(organizationId: string) {
    const users = await storage.getUsersByOrganization(organizationId);
    return users.map((user) => ({
      userId: user.id,
      fullName: user.fullName || user.username,
      email: user.email ?? null,
    }));
  }

  private matchUserByName(
    directory: Awaited<ReturnType<GovernanceAutomationService["getUserDirectory"]>>,
    candidate: string | null | undefined,
  ) {
    const needle = normalize(candidate);
    if (!needle) {
      return null;
    }

    return directory.find((entry) => normalize(entry.fullName) === needle || normalize(entry.email) === needle) ?? null;
  }

  async getConfigForOrg(organizationId: string): Promise<GovernanceAutomationConfig> {
    const organization = await storage.getOrganizationById(organizationId);
    const settings =
      organization?.settings && typeof organization.settings === "object" && !Array.isArray(organization.settings)
        ? (organization.settings as Record<string, unknown>)
        : {};
    return sanitizeGovernanceAutomationConfig(settings.governanceAutomationConfig);
  }

  private ruleByKey(config: GovernanceAutomationConfig, key: GovernanceAutomationRuleConfig["key"]) {
    return config.rules.find((rule) => rule.key === key);
  }

  private meetsSeverityThreshold(currentSeverity: string, minimumSeverity: GovernanceAutomationRuleConfig["minSeverity"]) {
    return (severityRank[currentSeverity] ?? 0) >= (severityRank[minimumSeverity] ?? 0);
  }

  private async resolveIncidentTargets(
    organizationId: string,
    directory: Awaited<ReturnType<GovernanceAutomationService["getUserDirectory"]>>,
    incident: Awaited<ReturnType<typeof incidentService.listForOrg>>[number],
  ) {
    const directOwner = this.matchUserByName(directory, incident.owner);
    if (directOwner) {
      return [directOwner];
    }

    const assignment = await incidentService.resolveDefaultAssignmentForOrg(organizationId, incident.category, incident.systemId ?? null);
    if (!assignment) {
      return [];
    }

    const assignee = directory.find((entry) => entry.userId === assignment.ownerUserId);
    return assignee ? [assignee] : [];
  }

  async getSummaryForOrg(params: { organizationId: string; actor: Actor }): Promise<GovernanceAutomationSummaryResponse> {
    const [incidents, workflows, config] = await Promise.all([
      incidentService.listForOrg(params.organizationId, { status: "all" }),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      this.getConfigForOrg(params.organizationId),
    ]);

    const now = Date.now();
    const incidentOwnerRule = this.ruleByKey(config, "incident-owner-notify");
    const incidentSlaRule = this.ruleByKey(config, "incident-sla-escalation");
    const workflowReminderRule = this.ruleByKey(config, "workflow-reviewer-reminder");

    const openCriticalIncidents = incidentOwnerRule?.enabled
      ? incidents.filter(
          (incident) =>
            (incident.status === "open" || incident.status === "contained") &&
            this.meetsSeverityThreshold(incident.severity, incidentOwnerRule.minSeverity),
        )
      : [];
    const breachedIncidents = incidentSlaRule?.enabled
      ? incidents.filter(
          (incident) =>
            (incident.status === "open" || incident.status === "contained") &&
            this.meetsSeverityThreshold(incident.severity, incidentSlaRule.minSeverity) &&
            incident.dueAt &&
            new Date(incident.dueAt).getTime() < now,
        )
      : [];
    const staleWorkflows = workflowReminderRule?.enabled
      ? workflows.filter((workflow) => {
          if (workflow.status !== "pending" && workflow.status !== "in_review") {
            return false;
          }
          if (!workflow.createdAt) {
            return false;
          }
          return (now - new Date(workflow.createdAt).getTime()) / (1000 * 60 * 60 * 24) >= workflowReminderRule.staleDays;
        })
      : [];

    const actions: AutomationActionPreview[] = [];
    if (openCriticalIncidents.length > 0) {
      actions.push({
        key: "incident-owner-notify",
        title: "Notify owners on open critical incidents",
        summary: "Escalate critical or high-severity incidents that remain open or only contained.",
        severity: "critical",
        targetCount: openCriticalIncidents.length,
      });
    }
    if (breachedIncidents.length > 0) {
      actions.push({
        key: "incident-sla-escalation",
        title: "Escalate breached containment SLAs",
        summary: "Create reviewer-facing escalation notifications for overdue containment targets.",
        severity: "high",
        targetCount: breachedIncidents.length,
      });
    }
    if (staleWorkflows.length > 0) {
      actions.push({
        key: "workflow-reviewer-reminder",
        title: "Remind reviewers about stale workflows",
        summary: `Push notifications for workflows that have stayed pending or in review for ${workflowReminderRule?.staleDays ?? 3}+ days.`,
        severity: "medium",
        targetCount: staleWorkflows.length,
      });
    }

    return {
      actions,
      totals: {
        openCriticalIncidents: openCriticalIncidents.length,
        breachedIncidents: breachedIncidents.length,
        staleWorkflows: staleWorkflows.length,
      },
      runMode: config.runMode,
    };
  }

  async runForOrg(params: { organizationId: string; actor: Actor }): Promise<GovernanceAutomationRunResponse> {
    const [summary, incidents, workflows, directory, config] = await Promise.all([
      this.getSummaryForOrg(params),
      incidentService.listForOrg(params.organizationId, { status: "all" }),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      this.getUserDirectory(params.organizationId),
      this.getConfigForOrg(params.organizationId),
    ]);
    const incidentOwnerRule = this.ruleByKey(config, "incident-owner-notify");
    const incidentSlaRule = this.ruleByKey(config, "incident-sla-escalation");
    const workflowReminderRule = this.ruleByKey(config, "workflow-reviewer-reminder");

    let notificationsCreated = 0;
    let emittedEvents = 0;

    const notify = async (
      targets: RemediationTarget[],
      input: {
        title: string;
        message: string;
        type: string;
        entityType?: string;
        entityId?: string | null;
        metadata?: Record<string, unknown>;
      },
    ) => {
      for (const target of targets) {
        await notificationService.createForUser({
          organizationId: params.organizationId,
          userId: target.userId,
          input: {
            title: input.title,
            message: input.message,
            type: input.type,
            entityType: input.entityType ?? null,
            entityId: input.entityId ?? null,
            metadata: input.metadata ?? {},
            read: false,
          },
        });
        notificationsCreated += 1;
      }
    };

    for (const incident of incidents) {
      const isOpenCritical =
        incidentOwnerRule?.enabled === true &&
        (incident.status === "open" || incident.status === "contained") &&
        this.meetsSeverityThreshold(incident.severity, incidentOwnerRule.minSeverity);
      const isBreached =
        incidentSlaRule?.enabled === true &&
        (incident.status === "open" || incident.status === "contained") &&
        this.meetsSeverityThreshold(incident.severity, incidentSlaRule.minSeverity) &&
        incident.dueAt &&
        new Date(incident.dueAt).getTime() < Date.now();

      if (!isOpenCritical && !isBreached) {
        continue;
      }

      const targets = await this.resolveIncidentTargets(params.organizationId, directory, incident);
      if (targets.length === 0) {
        continue;
      }

      await notify(targets, {
        title: isBreached ? "Incident SLA breach needs containment" : "Critical incident requires owner action",
        message: `${incident.title} is ${incident.status} and needs reviewer-owner follow-through.`,
        type: "automation_action",
        entityType: "incident",
        entityId: incident.id,
        metadata: {
          automationKey: isBreached ? "incident-sla-escalation" : "incident-owner-notify",
          severity: incident.severity,
        },
      });
    }

    for (const workflow of workflows) {
      if ((workflow.status !== "pending" && workflow.status !== "in_review") || !workflow.createdAt) {
        continue;
      }
      const ageDays = (Date.now() - new Date(workflow.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (!workflowReminderRule?.enabled || ageDays < workflowReminderRule.staleDays) {
        continue;
      }

      const reviewer = this.matchUserByName(directory, workflow.reviewer);
      if (!reviewer) {
        continue;
      }

      await notify([reviewer], {
        title: "Workflow review reminder",
        message: `${workflow.title} has been ${workflow.status.replace(/_/g, " ")} for ${Math.floor(ageDays)} days.`,
        type: "automation_action",
        entityType: "approval_workflow",
        entityId: workflow.id,
        metadata: {
          automationKey: "workflow-reviewer-reminder",
          priority: workflow.priority ?? null,
          staleDays: workflowReminderRule.staleDays,
        },
      });
    }

    if (summary.actions.length > 0) {
      const result = await governanceEventService.emitForOrg({
        organizationId: params.organizationId,
        actor: params.actor,
        eventType: "automation.sweep.completed",
        title: "Governance remediation sweep completed",
        summary: `${summary.actions.length} automation actions were evaluated and ${notificationsCreated} notifications were created.`,
        severity: summary.totals.breachedIncidents > 0 ? "warning" : "info",
        entityType: "automation_run",
        metadata: {
          actionKeys: summary.actions.map((action) => action.key),
          notificationsCreated,
        },
      });
      if (result.queued) {
        emittedEvents += 1;
      }
    }

    await auditService.createLog({
      organizationId: params.organizationId,
      actor: params.actor,
      input: {
        entityType: "automation",
        entityId: params.organizationId,
        action: "governance_sweep_run",
        performedBy: params.actor.fullName,
        details: `Governance remediation sweep created ${notificationsCreated} notifications across ${summary.actions.length} action groups.`,
      },
    });

    return {
      ok: true,
      notificationsCreated,
      emittedEvents,
      actionsRun: summary.actions,
    };
  }
}

export const governanceAutomationService = new GovernanceAutomationService();
