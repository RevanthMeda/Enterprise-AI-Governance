import { storage } from "../storage";
import { decisionAuditService } from "./decisionAuditService";
import { incidentService } from "./incidentService";
import { telemetryService } from "./telemetryService";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class DashboardService {
  async getTrends(params: { organizationId: string; actor: Actor }) {
    const [systems, workflows, logs, evidence] = await Promise.all([
      storage.getAiSystemsByOrg(params.organizationId),
      storage.getApprovalWorkflowsByOrg(params.organizationId),
      storage.getAuditLogsByOrg(params.organizationId),
      storage.getEvidenceFilesByOrg(params.organizationId),
    ]);

    const now = new Date();
    const weekLabels: string[] = [];
    const weekStarts: Date[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      d.setHours(0, 0, 0, 0);
      const dayOfWeek = d.getDay();
      d.setDate(d.getDate() - dayOfWeek);
      weekStarts.push(new Date(d));
      weekLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
    }

    const getWeekIndex = (date: Date | string | null) => {
      if (!date) return -1;
      const d = new Date(date);
      for (let i = weekStarts.length - 1; i >= 0; i--) {
        if (d >= weekStarts[i]) return i;
      }
      return -1;
    };

    const riskTrends = weekLabels.map((label, i) => {
      const beforeEnd = i < weekStarts.length - 1 ? weekStarts[i + 1] : new Date();
      const sysBefore = systems.filter((s) => s.createdAt && new Date(s.createdAt) < beforeEnd);
      return {
        week: label,
        high: sysBefore.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable").length,
        limited: sysBefore.filter((s) => s.riskLevel === "limited").length,
        minimal: sysBefore.filter((s) => s.riskLevel === "minimal").length,
      };
    });

    const approvalTrends = weekLabels.map((label, i) => {
      const weekWfs = workflows.filter((w) => getWeekIndex(w.createdAt) === i);
      return {
        week: label,
        submitted: weekWfs.length,
        approved: weekWfs.filter((w) => w.status === "approved").length,
        rejected: weekWfs.filter((w) => w.status === "rejected").length,
      };
    });

    const auditTrends = weekLabels.map((label, i) => ({
      week: label,
      events: logs.filter((l) => getWeekIndex(l.createdAt) === i).length,
    }));

    const evidenceTrends = weekLabels.map((label, i) => {
      const beforeEnd = i < weekStarts.length - 1 ? weekStarts[i + 1] : new Date();
      return {
        week: label,
        total: evidence.filter((e) => e.createdAt && new Date(e.createdAt) < beforeEnd).length,
      };
    });

    return { riskTrends, approvalTrends, auditTrends, evidenceTrends };
  }

  async getExitReadiness(params: { organizationId: string; actor: Actor }) {
    const [workflows, decisions, decisionSummary, incidents, incidentSummary, telemetrySummary, telemetryEvents] =
      await Promise.all([
        storage.getApprovalWorkflowsByOrg(params.organizationId),
        decisionAuditService.listForOrg(params.organizationId),
        decisionAuditService.getSummaryForOrg(params.organizationId),
        incidentService.listForOrg(params.organizationId),
        incidentService.getSummaryForOrg(params.organizationId),
        telemetryService.getSummaryForOrg(params.organizationId),
        telemetryService.listForOrg(params.organizationId, 100),
      ]);

    const tracedWorkflowIds = new Set(
      decisions.map((decision) => decision.workflowId).filter((workflowId): workflowId is string => Boolean(workflowId)),
    );
    const totalDecisions = workflows.length;
    const decisionDocumentationRate =
      totalDecisions > 0 ? Math.round((tracedWorkflowIds.size / totalDecisions) * 100) : 100;

    const outcomeTrackingCount = decisions.filter((decision) => {
      const outcome90d = decision.outcome90d as Record<string, unknown> | null;
      return Boolean(outcome90d && Object.keys(outcome90d).length > 0);
    }).length;
    const outcomeTrackingRate =
      decisions.length > 0 ? Math.round((outcomeTrackingCount / decisions.length) * 100) : 100;

    const containmentHours = incidents
      .filter((incident) => incident.containedAt && incident.detectedAt)
      .map((incident) => {
        const detectedAt = new Date(incident.detectedAt);
        const containedAt = new Date(incident.containedAt!);
        return (containedAt.getTime() - detectedAt.getTime()) / (1000 * 60 * 60);
      })
      .filter((value) => Number.isFinite(value) && value >= 0);

    const incidentContainmentHours =
      containmentHours.length > 0
        ? Math.round((containmentHours.reduce((sum, value) => sum + value, 0) / containmentHours.length) * 10) /
          10
        : null;

    const driftDetectionSamples = telemetryEvents
      .map((event) => {
        const metadata =
          event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
            ? (event.metadata as Record<string, unknown>)
            : null;
        const observedAtRaw = metadata?.observedAt;
        if (typeof observedAtRaw !== "string" || !event.detectedAt) {
          return null;
        }
        const observedAt = new Date(observedAtRaw);
        const detectedAt = new Date(event.detectedAt);
        const diffDays = (detectedAt.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
        return Number.isFinite(diffDays) && diffDays >= 0 ? diffDays : null;
      })
      .filter((value): value is number => value !== null);

    const modelDriftDetectionDays =
      driftDetectionSamples.length > 0
        ? Math.round((driftDetectionSamples.reduce((sum, value) => sum + value, 0) / driftDetectionSamples.length) * 10) / 10
        : telemetrySummary.driftAlerts > 0
          ? telemetrySummary.targetDetectionDays
          : null;

    const metrics = [
      {
        key: "decision_documentation_rate",
        label: "Decision Documentation Rate",
        value: decisionDocumentationRate,
        unit: "%",
        target: "> 99%",
        status: decisionDocumentationRate >= 99 ? "green" : decisionDocumentationRate >= 90 ? "yellow" : "red",
        detail: `${tracedWorkflowIds.size} of ${totalDecisions} workflows have linked decision traces.`,
      },
      {
        key: "human_override_rate",
        label: "Human Override Rate",
        value: decisionSummary.overrideRate,
        unit: "%",
        target: "15% - 40%",
        status:
          decisionSummary.overrideRate >= 15 && decisionSummary.overrideRate <= 40
            ? "green"
            : decisionSummary.overrideRate >= 5 && decisionSummary.overrideRate <= 60
              ? "yellow"
              : "red",
        detail: `${decisionSummary.overrides} traced decisions include human overrides.`,
      },
      {
        key: "override_rationale_capture_rate",
        label: "Override Rationale Capture Rate",
        value: decisionSummary.rationaleCaptureRate,
        unit: "%",
        target: "> 95%",
        status:
          decisionSummary.rationaleCaptureRate >= 95
            ? "green"
            : decisionSummary.rationaleCaptureRate >= 80
              ? "yellow"
              : "red",
        detail: "Percentage of overrides with documented rationale.",
      },
      {
        key: "model_drift_detection_time",
        label: "Model Drift Detection Time",
        value: modelDriftDetectionDays,
        unit: "days",
        target: "< 7 days",
        status:
          modelDriftDetectionDays === null
            ? "yellow"
            : modelDriftDetectionDays < 7
              ? "green"
              : modelDriftDetectionDays <= 10
                ? "yellow"
                : "red",
        detail:
          modelDriftDetectionDays === null
            ? "No observedAt telemetry markers yet; using alert counts only."
            : `Based on ${driftDetectionSamples.length || telemetrySummary.driftAlerts} drift detection samples.`,
      },
      {
        key: "incident_response_time",
        label: "Incident Containment Time",
        value: incidentContainmentHours,
        unit: "hours",
        target: "< 4 hours",
        status:
          incidentContainmentHours === null
            ? "yellow"
            : incidentContainmentHours < 4
              ? "green"
              : incidentContainmentHours <= 8
                ? "yellow"
                : "red",
        detail: `${incidentSummary.open} open incidents, ${incidentSummary.breached} containment SLA breaches.`,
      },
      {
        key: "outcome_tracking_rate",
        label: "90-Day Outcome Tracking Rate",
        value: outcomeTrackingRate,
        unit: "%",
        target: "> 90%",
        status: outcomeTrackingRate >= 90 ? "green" : outcomeTrackingRate >= 75 ? "yellow" : "red",
        detail: `${outcomeTrackingCount} of ${decisions.length} decision traces include 90-day outcomes.`,
      },
    ];

    return {
      metrics,
      summary: {
        workflows: totalDecisions,
        traces: decisions.length,
        tracedWorkflows: tracedWorkflowIds.size,
        openIncidents: incidentSummary.open,
        highSeverityIncidents: incidentSummary.highSeverity,
        telemetryAlerts: telemetrySummary.critical + telemetrySummary.warnings,
        tierBreakdown: {
          tier1: workflows.filter((workflow) => workflow.decisionTier === "tier_1").length,
          tier2: workflows.filter((workflow) => workflow.decisionTier === "tier_2").length,
          tier3: workflows.filter((workflow) => workflow.decisionTier === "tier_3").length,
        },
      },
    };
  }
}

export const dashboardService = new DashboardService();
