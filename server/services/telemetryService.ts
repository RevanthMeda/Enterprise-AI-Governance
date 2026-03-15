import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { aiTelemetryEvents, type AiTelemetryEvent, type InsertAiTelemetryEvent } from "@shared/schema";
import { incidentService } from "./incidentService";
import { notificationService } from "./notificationService";
import { storage } from "../storage";
import { telemetryPolicyService } from "./telemetryPolicyService";

type ThresholdEvaluation = {
  thresholdBreaches: string[];
  shouldEscalateIncident: boolean;
  incidentCategory: "bias" | "reliability" | "safety";
  severity: "warning" | "critical";
};

function getMetadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function evaluateThresholds(
  input: Omit<InsertAiTelemetryEvent, "organizationId">,
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
): ThresholdEvaluation {
  const metadata = getMetadataRecord(input.metadata);
  const biasFlags = Array.isArray(input.biasFlags) ? input.biasFlags.filter((entry): entry is string => typeof entry === "string") : [];
  const safetyFlags = getStringArray(metadata.safetyFlags);
  const overrideRate = getNumberValue(metadata.overrideRate);
  const errorRate = getNumberValue(metadata.errorRate);
  const thresholdBreaches: string[] = [];

  if ((input.driftScore ?? 0) >= policy.driftAlertThreshold) {
    thresholdBreaches.push("drift_gt_5_percent");
  }
  if (biasFlags.length >= policy.biasFlagThreshold) {
    thresholdBreaches.push("bias_flags_detected");
  }
  if (safetyFlags.length >= policy.safetyFlagThreshold) {
    thresholdBreaches.push("safety_flags_detected");
  }
  if (overrideRate !== null && overrideRate >= policy.overrideRateWarningThreshold) {
    thresholdBreaches.push("override_rate_spike");
  }
  if (errorRate !== null && errorRate >= policy.errorRateWarningThreshold) {
    thresholdBreaches.push("error_rate_anomaly");
  }
  if (input.eventType === "override_spike") {
    thresholdBreaches.push("override_rate_spike");
  }
  if (input.eventType === "error_rate_anomaly") {
    thresholdBreaches.push("error_rate_anomaly");
  }

  const severity: "warning" | "critical" =
    input.severity === "critical" ||
    safetyFlags.length >= policy.safetyFlagThreshold ||
    biasFlags.length >= policy.biasFlagThreshold ||
    (input.driftScore ?? 0) >= policy.driftCriticalThreshold ||
    (overrideRate ?? 0) >= policy.overrideRateCriticalThreshold ||
    (errorRate ?? 0) >= policy.errorRateCriticalThreshold
      ? "critical"
      : "warning";

  const incidentCategory =
    safetyFlags.length > 0 ? "safety" : biasFlags.length > 0 ? "bias" : "reliability";

  return {
    thresholdBreaches: Array.from(new Set(thresholdBreaches)),
    shouldEscalateIncident: thresholdBreaches.length > 0 && severity === "critical" && policy.autoEscalateCritical,
    incidentCategory,
    severity,
  };
}

export class TelemetryService {
  async listForOrg(organizationId: string, limit = 50) {
    return db
      .select()
      .from(aiTelemetryEvents)
      .where(eq(aiTelemetryEvents.organizationId, organizationId))
      .orderBy(desc(aiTelemetryEvents.detectedAt))
      .limit(limit);
  }

  async createForOrg(organizationId: string, input: Omit<InsertAiTelemetryEvent, "organizationId">): Promise<AiTelemetryEvent> {
    const metadata = getMetadataRecord(input.metadata);
    const policy = await telemetryPolicyService.getEffectiveForOrg(organizationId);
    const evaluation = evaluateThresholds(input, policy);
    const enrichedMetadata = {
      ...metadata,
      thresholdBreaches: evaluation.thresholdBreaches,
      thresholdEvaluatedAt: new Date().toISOString(),
      thresholdPolicy: {
        driftAlertThreshold: policy.driftAlertThreshold,
        driftCriticalThreshold: policy.driftCriticalThreshold,
        biasFlagThreshold: policy.biasFlagThreshold,
        safetyFlagThreshold: policy.safetyFlagThreshold,
        overrideRateWarningThreshold: policy.overrideRateWarningThreshold,
        overrideRateCriticalThreshold: policy.overrideRateCriticalThreshold,
        errorRateWarningThreshold: policy.errorRateWarningThreshold,
        errorRateCriticalThreshold: policy.errorRateCriticalThreshold,
      },
    };

    const [created] = await db
      .insert(aiTelemetryEvents)
      .values({ ...input, organizationId, metadata: enrichedMetadata })
      .returning();

    if (evaluation.thresholdBreaches.length > 0 && (policy.notifyOnWarning || evaluation.severity === "critical")) {
      await this.notifyAdminsForThresholdBreach(organizationId, created, evaluation.thresholdBreaches);
    }

    if (evaluation.shouldEscalateIncident) {
      const incidentId = await this.escalateThresholdBreach(organizationId, created, evaluation);
      if (incidentId) {
        const [updated] = await db
          .update(aiTelemetryEvents)
          .set({
            metadata: {
              ...enrichedMetadata,
              escalatedIncidentId: incidentId,
            },
          })
          .where(eq(aiTelemetryEvents.id, created.id))
          .returning();
        return updated;
      }
    }

    return created;
  }

  async getSummaryForOrg(organizationId: string) {
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        critical: sql<number>`count(*) filter (where ${aiTelemetryEvents.severity} = 'critical')::int`,
        warnings: sql<number>`count(*) filter (where ${aiTelemetryEvents.severity} = 'warning')::int`,
        driftAlerts: sql<number>`count(*) filter (where ${aiTelemetryEvents.driftScore} is not null and ${aiTelemetryEvents.driftScore} >= 5)::int`,
        biasAlerts: sql<number>`count(*) filter (where jsonb_array_length(${aiTelemetryEvents.biasFlags}) > 0)::int`,
        thresholdBreaches: sql<number>`count(*) filter (where coalesce(jsonb_array_length(${aiTelemetryEvents.metadata} -> 'thresholdBreaches'), 0) > 0)::int`,
        escalatedIncidents: sql<number>`count(*) filter (where ${aiTelemetryEvents.metadata} ? 'escalatedIncidentId')::int`,
      })
      .from(aiTelemetryEvents)
      .where(
        and(
          eq(aiTelemetryEvents.organizationId, organizationId),
          sql`${aiTelemetryEvents.detectedAt} >= now() - interval '30 days'`,
        ),
      );

    return {
      total: totals?.total ?? 0,
      critical: totals?.critical ?? 0,
      warnings: totals?.warnings ?? 0,
      driftAlerts: totals?.driftAlerts ?? 0,
      biasAlerts: totals?.biasAlerts ?? 0,
      thresholdBreaches: totals?.thresholdBreaches ?? 0,
      escalatedIncidents: totals?.escalatedIncidents ?? 0,
      targetDetectionDays: 7,
    };
  }

  private async notifyAdminsForThresholdBreach(
    organizationId: string,
    event: AiTelemetryEvent,
    thresholdBreaches: string[],
  ) {
    const admins = await storage.getUsersByOrganizationRoles(organizationId, [
      "owner",
      "admin",
      "cro",
      "ciso",
      "compliance_lead",
    ]);

    await Promise.all(
      admins.map((admin) =>
        notificationService.createForUser({
          organizationId,
          userId: admin.id,
          input: {
            title: "Telemetry threshold breach",
            message: `${event.summary} Thresholds: ${thresholdBreaches.join(", ")}`,
            type: "workflow_status_changed",
            entityType: "telemetry_event",
            entityId: event.id,
            read: false,
          },
        }),
      ),
    );
  }

  private async escalateThresholdBreach(
    organizationId: string,
    event: AiTelemetryEvent,
    evaluation: ThresholdEvaluation,
  ) {
    const openIncidents = await incidentService.listForOrg(organizationId, { status: "open" });
    const duplicate = openIncidents.find(
      (incident) =>
        incident.systemId === (event.systemId ?? null) &&
        incident.category === evaluation.incidentCategory &&
        incident.title === `Telemetry threshold breach: ${event.eventType}`,
    );

    if (duplicate) {
      return duplicate.id;
    }

    const created = await incidentService.createForOrg(organizationId, {
      systemId: event.systemId ?? null,
      workflowId: null,
      title: `Telemetry threshold breach: ${event.eventType}`,
      category: evaluation.incidentCategory,
      severity: evaluation.severity === "critical" ? "critical" : "high",
      status: "open",
      description: `${event.summary}\n\nThreshold breaches: ${evaluation.thresholdBreaches.join(", ")}`,
      playbook: {},
      owner: null,
      escalatedTo: "Operations and governance leads",
      detectedAt: event.detectedAt ?? new Date(),
      dueAt: null,
      containedAt: null,
      resolvedAt: null,
    });

    return created.id;
  }
}

export const telemetryService = new TelemetryService();
