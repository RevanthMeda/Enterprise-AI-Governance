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
  shouldNotify: boolean;
  shouldBlock: boolean;
  incidentCategory: "bias" | "reliability" | "safety" | "privacy";
  severity: "info" | "warning" | "critical";
  decision: "allow" | "warn" | "escalate" | "block";
  restrictedPromptMatches: string[];
  notificationRoles: string[];
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

function getStringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function evaluateThresholds(
  input: Omit<InsertAiTelemetryEvent, "organizationId">,
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
): ThresholdEvaluation {
  const metadata = getMetadataRecord(input.metadata);
  const biasFlags = Array.isArray(input.biasFlags) ? input.biasFlags.filter((entry): entry is string => typeof entry === "string") : [];
  const safetySignals = getStringArray(input.safetySignals ?? metadata.safetySignals ?? metadata.safetyFlags);
  const piiFlags = getStringArray(input.piiFlags ?? metadata.piiFlags);
  const overrideRate = getNumberValue(metadata.overrideRate);
  const errorRate = getNumberValue(metadata.errorRate);
  const toxicityScore = input.toxicityScore ?? getNumberValue(metadata.toxicityScore);
  const promptText = (getStringValue(input.promptText) ?? "").toLowerCase();
  const thresholdBreaches: string[] = [];
  const restrictedPromptMatches = policy.restrictedPromptPatterns.filter((pattern) =>
    promptText.includes(pattern.toLowerCase()),
  );

  if ((input.driftScore ?? 0) >= policy.driftAlertThreshold) {
    thresholdBreaches.push("drift_gt_5_percent");
  }
  if (biasFlags.length >= policy.biasFlagThreshold) {
    thresholdBreaches.push("bias_flags_detected");
  }
  if (safetySignals.length >= policy.safetyFlagThreshold) {
    thresholdBreaches.push("safety_flags_detected");
  }
  if (toxicityScore !== null && toxicityScore >= policy.toxicityWarningThreshold) {
    thresholdBreaches.push("toxicity_warning");
  }
  if (piiFlags.length >= policy.piiFlagThreshold) {
    thresholdBreaches.push("pii_detected");
  }
  if (overrideRate !== null && overrideRate >= policy.overrideRateWarningThreshold) {
    thresholdBreaches.push("override_rate_spike");
  }
  if (errorRate !== null && errorRate >= policy.errorRateWarningThreshold) {
    thresholdBreaches.push("error_rate_anomaly");
  }
  if (restrictedPromptMatches.length > 0) {
    thresholdBreaches.push("restricted_prompt_detected");
  }
  if (input.eventType === "override_spike") {
    thresholdBreaches.push("override_rate_spike");
  }
  if (input.eventType === "error_rate_anomaly") {
    thresholdBreaches.push("error_rate_anomaly");
  }

  const severity: "info" | "warning" | "critical" =
    thresholdBreaches.length === 0
      ? input.severity === "critical" ? "critical" : input.severity === "warning" ? "warning" : "info"
      :
    input.severity === "critical" ||
    safetySignals.length >= policy.safetyFlagThreshold ||
    biasFlags.length >= policy.biasFlagThreshold ||
    piiFlags.length >= policy.piiFlagThreshold ||
    (toxicityScore ?? 0) >= policy.toxicityCriticalThreshold ||
    (input.driftScore ?? 0) >= policy.driftCriticalThreshold ||
    (overrideRate ?? 0) >= policy.overrideRateCriticalThreshold ||
    (errorRate ?? 0) >= policy.errorRateCriticalThreshold ||
    restrictedPromptMatches.length > 0
      ? "critical"
      : "warning";

  const incidentCategory =
    piiFlags.length > 0
      ? "privacy"
      : safetySignals.length > 0 || (toxicityScore ?? 0) >= policy.toxicityWarningThreshold || restrictedPromptMatches.length > 0
        ? "safety"
        : biasFlags.length > 0
          ? "bias"
          : "reliability";

  const shouldBlock =
    policy.enforceBlocking &&
    (
      (policy.blockOnPii && piiFlags.length >= policy.piiFlagThreshold) ||
      (policy.blockOnSafetyCritical &&
        (
          safetySignals.length >= policy.safetyFlagThreshold ||
          (toxicityScore ?? 0) >= policy.toxicityCriticalThreshold
        )) ||
      (policy.blockOnRestrictedPrompt && restrictedPromptMatches.length > 0)
    );

  const shouldEscalateIncident = thresholdBreaches.length > 0 && severity === "critical" && policy.autoEscalateCritical;
  const shouldNotify = thresholdBreaches.length > 0 && (severity === "critical" || policy.notifyOnWarning);
  const notificationRoles =
    severity === "critical"
      ? ["system_owner", "compliance_lead", "owner", "admin", "cro", "ciso"]
      : ["system_owner", "compliance_lead"];
  const decision =
    shouldBlock
      ? "block"
      : shouldEscalateIncident
        ? "escalate"
        : thresholdBreaches.length > 0
          ? "warn"
          : "allow";

  return {
    thresholdBreaches: Array.from(new Set(thresholdBreaches)),
    shouldEscalateIncident,
    shouldNotify,
    shouldBlock,
    incidentCategory,
    severity,
    decision,
    restrictedPromptMatches,
    notificationRoles,
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
    const policy = input.systemId
      ? await telemetryPolicyService.getEffectiveForSystem(organizationId, input.systemId)
      : await telemetryPolicyService.getEffectiveForOrg(organizationId);
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
        toxicityWarningThreshold: policy.toxicityWarningThreshold,
        toxicityCriticalThreshold: policy.toxicityCriticalThreshold,
        piiFlagThreshold: policy.piiFlagThreshold,
        enforceBlocking: policy.enforceBlocking,
        blockOnPii: policy.blockOnPii,
        blockOnSafetyCritical: policy.blockOnSafetyCritical,
        blockOnRestrictedPrompt: policy.blockOnRestrictedPrompt,
        restrictedPromptPatterns: policy.restrictedPromptPatterns,
      },
      restrictedPromptMatches: evaluation.restrictedPromptMatches,
      notificationRoles: evaluation.notificationRoles,
      policyDecision: evaluation.decision,
    };

    const [created] = await db
      .insert(aiTelemetryEvents)
      .values({
        ...input,
        organizationId,
        safetySignals: input.safetySignals ?? getStringArray(metadata.safetySignals ?? metadata.safetyFlags),
        piiFlags: input.piiFlags ?? getStringArray(metadata.piiFlags),
        toxicityScore: input.toxicityScore ?? getNumberValue(metadata.toxicityScore),
        runtimeContext: getMetadataRecord(input.runtimeContext),
        correlationId: input.correlationId ?? null,
        actionTaken: evaluation.decision,
        blocked: evaluation.shouldBlock,
        metadata: enrichedMetadata,
      })
      .returning();

    if (evaluation.shouldNotify) {
      await this.notifyOperatorsForThresholdBreach(organizationId, created, evaluation);
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
        blocked: sql<number>`count(*) filter (where ${aiTelemetryEvents.blocked} = true)::int`,
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
      blocked: totals?.blocked ?? 0,
      targetDetectionDays: 7,
    };
  }

  private async notifyOperatorsForThresholdBreach(
    organizationId: string,
    event: AiTelemetryEvent,
    evaluation: ThresholdEvaluation,
  ) {
    const users = await storage.getUsersByOrganizationRoles(
      organizationId,
      Array.from(new Set(evaluation.notificationRoles)),
    );

    await Promise.all(
      users.map((user) =>
        notificationService.createForUser({
          organizationId,
          userId: user.id,
          input: {
            title:
              evaluation.decision === "block"
                ? "Runtime event blocked by telemetry policy"
                : evaluation.severity === "critical"
                  ? "Critical telemetry breach"
                  : "Telemetry warning",
            message: `${event.summary} Thresholds: ${evaluation.thresholdBreaches.join(", ")}. Decision: ${evaluation.decision}.`,
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

    const detectedAt = event.detectedAt ?? new Date();
    const dueAt = new Date(detectedAt.getTime() + 4 * 60 * 60 * 1000);
    const created = await incidentService.createForOrg(organizationId, {
      systemId: event.systemId ?? null,
      workflowId: null,
      title: `Telemetry threshold breach: ${event.eventType}`,
      category: evaluation.incidentCategory,
      severity: evaluation.severity === "critical" ? "critical" : "high",
      status: "open",
      description: `${event.summary}\n\nThreshold breaches: ${evaluation.thresholdBreaches.join(", ")}`,
      playbook: {
        targetContainmentHours: 4,
        decision: evaluation.decision,
        restrictedPromptMatches: evaluation.restrictedPromptMatches,
        steps: [
          "Freeze or narrow the affected model release or gateway route.",
          "Review prompt, output, context, and threshold evidence captured with the event.",
          "Confirm whether customer, safety, privacy, or fairness impact occurred.",
          "Document containment and assign post-incident review owner.",
        ],
      },
      owner: null,
      escalatedTo: "System owner, compliance lead, and governance operations",
      detectedAt,
      dueAt,
      containedAt: null,
      resolvedAt: null,
    });

    return created.id;
  }
}

export const telemetryService = new TelemetryService();
