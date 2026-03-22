import type { GovernanceEventFeedItem, GovernanceEventFeedResponse } from "@shared/governance-events";
import { connectorMatchesEvent, type IntegrationConnectorConfig } from "@shared/integration-connectors";
import { storage } from "../storage";
import { backgroundJobService } from "./backgroundJobService";
import { incidentService } from "./incidentService";
import { integrationConnectorService } from "./integrationConnectorService";

const GOVERNANCE_EVENT_WEBHOOK_URL = process.env.GOVERNANCE_EVENT_WEBHOOK_URL?.trim() || "";
const GOVERNANCE_EVENT_WEBHOOK_TOKEN = process.env.GOVERNANCE_EVENT_WEBHOOK_TOKEN?.trim() || "";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

function severityFromIncident(incident: { severity: string }) {
  if (incident.severity === "critical") return "critical" as const;
  if (incident.severity === "high") return "warning" as const;
  return "info" as const;
}

function stripSecretUrl(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return url;
  }
}

export class GovernanceEventService {
  isWebhookConfigured() {
    return GOVERNANCE_EVENT_WEBHOOK_URL.length > 0;
  }

  private buildGlobalDestination(): IntegrationConnectorConfig | null {
    if (!this.isWebhookConfigured()) {
      return null;
    }
    return {
      id: "global-governance-webhook",
      label: stripSecretUrl(GOVERNANCE_EVENT_WEBHOOK_URL),
      type: "generic_webhook" as const,
      enabled: true,
      webhookUrl: GOVERNANCE_EVENT_WEBHOOK_URL,
      authToken: GOVERNANCE_EVENT_WEBHOOK_TOKEN || null,
      eventFilters: [] as string[],
      severityFloor: "info" as const,
    };
  }

  async getFeedForOrg(params: { organizationId: string; actor: Actor; limit?: number }): Promise<GovernanceEventFeedResponse> {
    const limit = Math.min(30, Math.max(5, params.limit ?? 20));
    const [incidents, workflows, auditLogs, jobs, connectors] = await Promise.all([
      incidentService.listForOrg(params.organizationId, { status: "all" }),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      storage.getAuditLogsByOrg(params.organizationId),
      backgroundJobService.getJobsForOrganization({ organizationId: params.organizationId, limit: 20 }),
      integrationConnectorService.getForOrg(params.organizationId),
    ]);
    const globalDestination = this.buildGlobalDestination();
    const destinations = [
      ...connectors.filter((connector) => connector.enabled && connector.webhookUrl),
      ...(globalDestination ? [globalDestination] : []),
    ];

    const incidentEvents: GovernanceEventFeedItem[] = incidents.slice(0, 8).map((incident) => ({
      id: `incident-${incident.id}`,
      eventType:
        incident.status === "resolved"
          ? "incident.resolved"
          : incident.status === "contained"
            ? "incident.contained"
            : "incident.opened",
      title: incident.title,
      summary: `${incident.category} incident is ${incident.status} with ${incident.severity} severity.`,
      severity: severityFromIncident(incident),
      source: "incident",
      entityType: "incident",
      entityId: incident.id,
      href: "/incidents",
      createdAt: new Date(incident.updatedAt ?? incident.detectedAt).toISOString(),
    }));

    const workflowEvents: GovernanceEventFeedItem[] = workflows.slice(0, 8).map((workflow) => ({
      id: `workflow-${workflow.id}`,
      eventType: `workflow.${workflow.status}`,
      title: workflow.title,
      summary: `Workflow is ${workflow.status.replace(/_/g, " ")} with priority ${workflow.priority ?? "unspecified"}.`,
      severity: workflow.priority === "critical" || workflow.priority === "high" ? "warning" : "info",
      source: "workflow",
      entityType: "approval_workflow",
      entityId: workflow.id,
      href: "/approvals",
      createdAt: new Date(workflow.updatedAt ?? workflow.createdAt ?? new Date()).toISOString(),
    }));

    const policyEvents: GovernanceEventFeedItem[] = auditLogs
      .filter((log) => ["telemetry_policy", "ai_system", "approval_workflow", "agent_governance_profile"].includes(log.entityType))
      .slice(0, 8)
      .map((log) => ({
        id: `audit-${log.id}`,
        eventType: `${log.entityType}.${log.action}`,
        title: `${log.entityType.replace(/_/g, " ")} ${log.action.replace(/_/g, " ")}`,
        summary: log.details ?? "Governance configuration changed.",
        severity: log.entityType === "telemetry_policy" ? "warning" : "info",
        source: "policy",
        entityType: log.entityType,
        entityId: log.entityId,
        href: log.entityType === "telemetry_policy" ? "/telemetry-policy" : log.entityType === "approval_workflow" ? "/approvals" : "/audit",
        createdAt: new Date(log.createdAt ?? new Date()).toISOString(),
      }));

    const automationEvents: GovernanceEventFeedItem[] = jobs
      .filter((job) => {
        const payload =
          job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
            ? (job.payload as Record<string, unknown>)
            : null;
        const body =
          payload?.body && typeof payload.body === "object" && !Array.isArray(payload.body)
            ? (payload.body as Record<string, unknown>)
            : null;
        return body?.source === "governance_event";
      })
      .slice(0, 6)
      .map((job) => ({
        id: `job-${job.id}`,
        eventType: "automation.webhook_delivery",
        title: "Governance event delivery",
        summary: `Webhook delivery is ${job.status}.`,
        severity: job.status === "failed" ? "warning" : "info",
        source: "automation",
        entityType: "background_job",
        entityId: job.id,
        href: "/integrations",
        createdAt: new Date(job.updatedAt ?? job.createdAt ?? new Date()).toISOString(),
      }));

    const events = [...incidentEvents, ...workflowEvents, ...policyEvents, ...automationEvents]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return {
      status: {
        webhookConfigured: destinations.length > 0,
        backgroundJobsEnabled: process.env.BACKGROUND_JOBS_DISABLED !== "true",
        destinationLabel: destinations[0]?.label ?? null,
        connectorCount: destinations.length,
        destinationLabels: destinations.map((destination) => destination.label),
        recentDeliveryFailures: automationEvents.filter((event) => event.severity === "warning").length,
      },
      events,
    };
  }

  async emitForOrg(params: {
    organizationId: string;
    actor: Actor;
    eventType: string;
    title: string;
    summary: string;
    severity: GovernanceEventFeedItem["severity"];
    entityType: string;
    entityId?: string | null;
    targetConnectorId?: string | null;
    metadata?: Record<string, unknown>;
  }) {
    const connectors = await integrationConnectorService.getForOrg(params.organizationId);
    const globalDestination = this.buildGlobalDestination();
    const destinations = [
      ...connectors.filter((connector) => connector.enabled && connector.webhookUrl),
      ...(globalDestination ? [globalDestination] : []),
    ]
      .filter((connector) => !params.targetConnectorId || connector.id === params.targetConnectorId)
      .filter((connector) => connectorMatchesEvent(connector, params.eventType, params.severity));

    if (destinations.length === 0) {
      return { queued: false, reason: "not_configured" as const };
    }

    const body = {
      source: "governance_event",
      eventType: params.eventType,
      title: params.title,
      summary: params.summary,
      severity: params.severity,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      organizationId: params.organizationId,
      actor: {
        id: params.actor.id,
        fullName: params.actor.fullName,
        email: params.actor.email,
      },
      metadata: params.metadata ?? {},
      emittedAt: new Date().toISOString(),
    };

    const jobs = await Promise.all(
      destinations.map((destination) =>
        backgroundJobService.enqueue({
          type: "monitoring_webhook",
          organizationId: params.organizationId,
          createdBy: params.actor.id,
          payload: {
            url: destination.webhookUrl!,
            token: destination.authToken ?? null,
            body: {
              ...body,
              connector: {
                id: destination.id,
                label: destination.label,
                type: destination.type,
              },
            },
          },
          maxAttempts: 4,
        }),
      ),
    );

    return { queued: true, jobId: jobs[0]?.id, jobCount: jobs.length };
  }
}

export const governanceEventService = new GovernanceEventService();
