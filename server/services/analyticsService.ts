import type { AnalyticsDistributionSlice, AnalyticsOverviewResponse } from "@shared/analytics-overview";
import { storage } from "../storage";
import { decisionAuditService } from "./decisionAuditService";
import { incidentService } from "./incidentService";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildDistribution(items: Array<{ label: string; value: number }>) {
  return items.filter((item) => item.value > 0);
}

export class AnalyticsService {
  async getOverview(params: { organizationId: string; actor: Actor; membershipRole: string }): Promise<AnalyticsOverviewResponse> {
    const [systems, controls, workflows, incidents, evidence, decisions] = await Promise.all([
      storage.getAiSystemsByOrg(params.organizationId),
      storage.getSystemControlsByOrg(params.organizationId),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      incidentService.listForOrg(params.organizationId, { status: "all" }),
      storage.getEvidenceFilesByOrg(params.organizationId),
      decisionAuditService.listForOrg(params.organizationId),
    ]);

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const highRiskSystems = systems.filter((system) => system.riskLevel === "high" || system.riskLevel === "unacceptable");
    const compliantControls = controls.filter((control) => control.status === "implemented" || control.status === "verified");
    const evidenceCoveredSystems = systems.filter((system) => evidence.some((file) => file.systemId === system.id));
    const openIncidents = incidents.filter((incident) => incident.status === "open" || incident.status === "contained");
    const breachedIncidents = openIncidents.filter((incident) => incident.dueAt && new Date(incident.dueAt) < now);
    const containmentHours = incidents
      .filter((incident) => incident.detectedAt && incident.containedAt)
      .map((incident) => {
        const detectedAt = new Date(incident.detectedAt);
        const containedAt = new Date(incident.containedAt!);
        return (containedAt.getTime() - detectedAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((value) => Number.isFinite(value) && value >= 0);
    const resolutionHours = incidents
      .filter((incident) => incident.detectedAt && incident.resolvedAt)
      .map((incident) => {
        const detectedAt = new Date(incident.detectedAt);
        const resolvedAt = new Date(incident.resolvedAt!);
        return (resolvedAt.getTime() - detectedAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((value) => Number.isFinite(value) && value >= 0);

    const pendingWorkflows = workflows.filter((workflow) => workflow.status === "pending" || workflow.status === "in_review");
    const approvalsClosed30d = workflows.filter((workflow) => {
      if (!workflow.updatedAt) return false;
      if (workflow.status !== "approved" && workflow.status !== "rejected") return false;
      return new Date(workflow.updatedAt) >= thirtyDaysAgo;
    });

    const tracedWorkflowIds = new Set(
      decisions.map((decision) => decision.workflowId).filter((workflowId): workflowId is string => Boolean(workflowId)),
    );

    const weekStarts: Date[] = [];
    const weekLabels: string[] = [];
    for (let i = 7; i >= 0; i -= 1) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      weekStart.setHours(0, 0, 0, 0);
      const day = weekStart.getDay();
      weekStart.setDate(weekStart.getDate() - day);
      weekStarts.push(new Date(weekStart));
      weekLabels.push(`${weekStart.getMonth() + 1}/${weekStart.getDate()}`);
    }

    const getWeekIndex = (value: Date | string | null | undefined) => {
      if (!value) {
        return -1;
      }
      const date = new Date(value);
      for (let index = weekStarts.length - 1; index >= 0; index -= 1) {
        if (date >= weekStarts[index]) {
          return index;
        }
      }
      return -1;
    };

    const trends = weekLabels.map((period, index) => ({
      period,
      incidentsCreated: incidents.filter((incident) => getWeekIndex(incident.detectedAt) === index).length,
      incidentsResolved: incidents.filter((incident) => getWeekIndex(incident.resolvedAt) === index).length,
      approvalsSubmitted: workflows.filter((workflow) => getWeekIndex(workflow.createdAt) === index).length,
      approvalsClosed: workflows.filter(
        (workflow) =>
          (workflow.status === "approved" || workflow.status === "rejected") && getWeekIndex(workflow.updatedAt) === index,
      ).length,
      evidenceAdded: evidence.filter((file) => getWeekIndex(file.createdAt) === index).length,
    }));

    const riskLevels: AnalyticsDistributionSlice[] = buildDistribution([
      { label: "High / Unacceptable", value: highRiskSystems.length },
      { label: "Limited", value: systems.filter((system) => system.riskLevel === "limited").length },
      { label: "Minimal", value: systems.filter((system) => system.riskLevel === "minimal").length },
      { label: "Medium", value: systems.filter((system) => system.riskLevel === "medium").length },
    ]);

    const workflowStatuses: AnalyticsDistributionSlice[] = buildDistribution([
      { label: "Pending", value: workflows.filter((workflow) => workflow.status === "pending").length },
      { label: "In review", value: workflows.filter((workflow) => workflow.status === "in_review").length },
      { label: "Approved", value: workflows.filter((workflow) => workflow.status === "approved").length },
      { label: "Rejected", value: workflows.filter((workflow) => workflow.status === "rejected").length },
      { label: "Escalated", value: workflows.filter((workflow) => workflow.status === "escalated").length },
    ]);

    const incidentSeverities: AnalyticsDistributionSlice[] = buildDistribution([
      { label: "Critical", value: incidents.filter((incident) => incident.severity === "critical").length },
      { label: "High", value: incidents.filter((incident) => incident.severity === "high").length },
      { label: "Medium", value: incidents.filter((incident) => incident.severity === "medium").length },
      { label: "Low", value: incidents.filter((incident) => incident.severity === "low").length },
    ]);

    const controlStatuses: AnalyticsDistributionSlice[] = buildDistribution([
      { label: "Verified", value: controls.filter((control) => control.status === "verified").length },
      { label: "Implemented", value: controls.filter((control) => control.status === "implemented").length },
      { label: "In progress", value: controls.filter((control) => control.status === "in_progress").length },
      { label: "Not started", value: controls.filter((control) => control.status === "not_started").length },
    ]);

    const summary = {
      totalSystems: systems.length,
      highRiskSystems: highRiskSystems.length,
      controlCoverageRate: controls.length > 0 ? Math.round((compliantControls.length / controls.length) * 100) : 100,
      evidenceCoverageRate: systems.length > 0 ? Math.round((evidenceCoveredSystems.length / systems.length) * 100) : 100,
      openIncidents: openIncidents.length,
      breachedIncidents: breachedIncidents.length,
      avgContainmentHours: average(containmentHours),
      avgResolutionHours: average(resolutionHours),
      pendingWorkflows: pendingWorkflows.length,
      approvalsClosed30d: approvalsClosed30d.length,
      decisionTraceCoverageRate: workflows.length > 0 ? Math.round((tracedWorkflowIds.size / workflows.length) * 100) : 100,
    };

    const highlights = [
      summary.breachedIncidents > 0
        ? `${summary.breachedIncidents} open incidents are beyond containment target and need reviewer attention.`
        : "No open incidents are currently beyond containment target.",
      summary.controlCoverageRate < 85
        ? `Control coverage is ${summary.controlCoverageRate}%, so implementation and verification work should stay on the operator watchlist.`
        : `Control coverage is ${summary.controlCoverageRate}%, which is within a healthy governed-operating range.`,
      summary.pendingWorkflows > 0
        ? `${summary.pendingWorkflows} workflows are still pending or in review, so reviewer throughput remains a live operational constraint.`
        : "No approval backlog is currently building in the workflow queue.",
    ];

    return {
      generatedAt: now.toISOString(),
      summary,
      distributions: {
        riskLevels,
        workflowStatuses,
        incidentSeverities,
        controlStatuses,
      },
      trends,
      highlights,
      reportPresets: [
        {
          id: "executive_snapshot",
          label: "Executive snapshot",
          description: "Board-level posture summary with risk, incident, and coverage metrics.",
        },
        {
          id: "incident_ops_review",
          label: "Incident operations review",
          description: "Open-incident, severity, and containment trend pack for operational reviewers.",
        },
        {
          id: "compliance_snapshot",
          label: "Compliance snapshot",
          description: "Control coverage, evidence posture, and workflow readiness summary.",
        },
      ],
    };
  }
}

export const analyticsService = new AnalyticsService();
