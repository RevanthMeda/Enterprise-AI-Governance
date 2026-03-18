import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  aiTelemetryEvents,
  type AiSystem,
  type AiTelemetryEvent,
  type InsertAiSystem,
  type InsertAiTelemetryEvent,
} from "@shared/schema";
import { incidentService } from "./incidentService";
import { notificationService } from "./notificationService";
import { storage } from "../storage";
import { telemetryPolicyService } from "./telemetryPolicyService";
import { riskAssessmentService } from "./riskAssessmentService";
import { auditService } from "./auditService";
import { autoDiscoveryService } from "./autoDiscoveryService";
import { telemetryReviewerExceptionService } from "./telemetryReviewerExceptionService";

type ThresholdEvaluation = {
  thresholdBreaches: string[];
  shouldEscalateIncident: boolean;
  shouldNotify: boolean;
  shouldBlock: boolean;
  incidentCategory: "bias" | "reliability" | "safety" | "privacy" | "security";
  severity: "info" | "warning" | "critical";
  decision: "allow" | "warn" | "escalate" | "block";
  restrictedPromptMatches: string[];
  notificationRoles: string[];
  appliedReviewerExceptions: Array<{
    id: string;
    promptPattern: string;
    suppressedThresholds: string[];
  }>;
};

type TelemetryCollectionProfile = "minimal" | "redacted" | "full_evidence";

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

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(value: string) {
  const knownProviders: Record<string, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    azure: "Azure",
    aws: "AWS",
  };
  const normalized = value.trim().toLowerCase();
  if (knownProviders[normalized]) {
    return knownProviders[normalized];
  }

  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function sanitizeRuntimeContext(
  runtimeContext: unknown,
  collectionProfile: TelemetryCollectionProfile,
) {
  const record = getMetadataRecord(runtimeContext);
  if (collectionProfile === "full_evidence") {
    return record;
  }

  const allowedKeys = [
    "channel",
    "region",
    "environment",
    "surface",
    "route",
    "locale",
    "integration",
  ];
  return Object.fromEntries(
    Object.entries(record).filter(([key, value]) => {
      return allowedKeys.includes(key) && ["string", "number", "boolean"].includes(typeof value);
    }),
  );
}

function redactEvidenceText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]")
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, "[REDACTED_ACCOUNT]")
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED_SECRET]")
    .replace(/\b(?:api|secret|private)\s+key\b/gi, "[REDACTED_SECRET_REFERENCE]");
}

function sanitizeTelemetryForStorage(
  input: Omit<InsertAiTelemetryEvent, "organizationId">,
  collectionProfile: TelemetryCollectionProfile,
) {
  const metadata = getMetadataRecord(input.metadata);
  const profileMetadata = {
    ...metadata,
    collectionProfileApplied: collectionProfile,
    rawPromptReceived: Boolean(input.promptText),
    rawOutputReceived: Boolean(input.modelOutput),
  };

  if (collectionProfile === "full_evidence") {
    return {
      ...input,
      runtimeContext: sanitizeRuntimeContext(input.runtimeContext, collectionProfile),
      metadata: profileMetadata,
    };
  }

  if (collectionProfile === "redacted") {
    return {
      ...input,
      promptText: redactEvidenceText(input.promptText),
      modelOutput: redactEvidenceText(input.modelOutput),
      runtimeContext: sanitizeRuntimeContext(input.runtimeContext, collectionProfile),
      metadata: {
        ...profileMetadata,
        evidenceRedacted: true,
      },
    };
  }

  return {
    ...input,
    promptText: null,
    modelOutput: null,
    runtimeContext: sanitizeRuntimeContext(input.runtimeContext, collectionProfile),
    metadata: {
      ...profileMetadata,
      evidenceRedacted: true,
      rawEvidenceStored: false,
    },
  };
}

function deriveSeverityFromBreaches(
  thresholdBreaches: string[],
  _fallbackSeverity: "info" | "warning" | "critical" | undefined,
): "info" | "warning" | "critical" {
  if (thresholdBreaches.length === 0) {
    return "info";
  }

  const criticalBreaches = new Set([
    "pii_detected",
    "safety_flags_detected",
    "bias_flags_detected",
    "restricted_prompt_detected",
    "disallowed_tool_requested",
    "disallowed_tool_returned",
    "tool_arguments_invalid_json",
    "disallowed_tool_argument_key",
    "disallowed_tool_argument_value",
    "tool_argument_oversize",
    "tool_argument_missing_required",
    "tool_argument_type_mismatch",
    "tool_argument_out_of_range",
    "tool_argument_enum_violation",
  ]);

  return thresholdBreaches.some((breach) => criticalBreaches.has(breach)) ? "critical" : "warning";
}

function deriveIncidentCategoryFromBreaches(thresholdBreaches: string[]) {
  if (
    thresholdBreaches.includes("disallowed_tool_requested") ||
    thresholdBreaches.includes("disallowed_tool_returned") ||
    thresholdBreaches.includes("tool_arguments_invalid_json") ||
    thresholdBreaches.includes("disallowed_tool_argument_key") ||
    thresholdBreaches.includes("disallowed_tool_argument_value") ||
    thresholdBreaches.includes("tool_argument_oversize") ||
    thresholdBreaches.includes("tool_argument_missing_required") ||
    thresholdBreaches.includes("tool_argument_type_mismatch") ||
    thresholdBreaches.includes("tool_argument_out_of_range") ||
    thresholdBreaches.includes("tool_argument_enum_violation")
  ) {
    return "security" as const;
  }
  if (thresholdBreaches.includes("pii_detected")) {
    return "privacy" as const;
  }
  if (
    thresholdBreaches.includes("safety_flags_detected") ||
    thresholdBreaches.includes("toxicity_warning") ||
    thresholdBreaches.includes("restricted_prompt_detected")
  ) {
    return "safety" as const;
  }
  if (thresholdBreaches.includes("bias_flags_detected")) {
    return "bias" as const;
  }
  return "reliability" as const;
}

function buildThresholdOutcome(params: {
  inputSeverity: "info" | "warning" | "critical" | undefined;
  thresholdBreaches: string[];
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>;
}) {
  const severity = deriveSeverityFromBreaches(params.thresholdBreaches, params.inputSeverity);
  const hasHardActionPolicyViolation =
    params.thresholdBreaches.includes("disallowed_tool_requested") ||
    params.thresholdBreaches.includes("disallowed_tool_returned") ||
    params.thresholdBreaches.includes("tool_arguments_invalid_json") ||
    params.thresholdBreaches.includes("disallowed_tool_argument_key") ||
    params.thresholdBreaches.includes("disallowed_tool_argument_value") ||
    params.thresholdBreaches.includes("tool_argument_oversize") ||
    params.thresholdBreaches.includes("tool_argument_missing_required") ||
    params.thresholdBreaches.includes("tool_argument_type_mismatch") ||
    params.thresholdBreaches.includes("tool_argument_out_of_range") ||
    params.thresholdBreaches.includes("tool_argument_enum_violation");
  const shouldBlock =
    hasHardActionPolicyViolation ||
    (
      params.policy.enforceBlocking &&
      (
        (params.policy.blockOnPii && params.thresholdBreaches.includes("pii_detected")) ||
        (params.policy.blockOnSafetyCritical &&
          (
            params.thresholdBreaches.includes("safety_flags_detected") ||
            params.thresholdBreaches.includes("toxicity_warning")
          )) ||
        (params.policy.blockOnRestrictedPrompt && params.thresholdBreaches.includes("restricted_prompt_detected"))
      )
    );
  const shouldEscalateIncident =
    params.thresholdBreaches.length > 0 && severity === "critical" && params.policy.autoEscalateCritical;
  const shouldNotify =
    params.thresholdBreaches.length > 0 && (severity === "critical" || params.policy.notifyOnWarning);
  const notificationRoles =
    severity === "critical"
      ? ["system_owner", "compliance_lead", "owner", "admin", "cro", "ciso"]
      : ["system_owner", "compliance_lead"];
  const decision =
    shouldBlock
      ? "block"
      : shouldEscalateIncident
        ? "escalate"
        : params.thresholdBreaches.length > 0
          ? "warn"
          : "allow";

  return {
    severity,
    shouldBlock,
    shouldEscalateIncident,
    shouldNotify,
    notificationRoles,
    incidentCategory: deriveIncidentCategoryFromBreaches(params.thresholdBreaches),
    decision,
  };
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
  const promptText = normalizeText(getStringValue(input.promptText) ?? "");
  const requestedToolNames = getStringArray(metadata.requestedToolNames);
  const returnedToolNames = getStringArray(metadata.returnedToolNames);
  const toolArgumentBreaches = getStringArray(metadata.toolArgumentBreaches);
  const allowedToolNames = new Set(getStringArray(metadata.allowedToolNames));
  const thresholdBreaches: string[] = [];
  const defaultRestrictedPromptPatterns = [
    "bypass safety",
    "ignore safety",
    "ignore previous instructions",
    "ignore all previous instructions",
    "override previous instructions",
    "disregard prior instructions",
    "developer message",
    "system prompt",
    "reveal system prompt",
    "show hidden prompt",
    "jailbreak",
    "do anything now",
    "dan mode",
    "bypass guardrails",
    "forget the rules",
    "disable safety",
    "social security number",
    "ssn",
    "api key",
    "secret key",
    "private key",
  ];
  const restrictedPromptCandidates = Array.from(
    new Set(
      [...policy.restrictedPromptPatterns, ...defaultRestrictedPromptPatterns]
        .filter((pattern): pattern is string => typeof pattern === "string" && pattern.trim().length > 0),
    ),
  );
  const restrictedPromptMatches = restrictedPromptCandidates.filter((pattern) => {
    const normalizedPattern = normalizeText(pattern);
    return normalizedPattern.length > 0 && promptText.includes(normalizedPattern);
  });

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
  if (allowedToolNames.size > 0 && requestedToolNames.some((tool) => !allowedToolNames.has(tool))) {
    thresholdBreaches.push("disallowed_tool_requested");
  }
  if (allowedToolNames.size > 0 && returnedToolNames.some((tool) => !allowedToolNames.has(tool))) {
    thresholdBreaches.push("disallowed_tool_returned");
  }
  thresholdBreaches.push(...toolArgumentBreaches);
  if (input.eventType === "override_spike") {
    thresholdBreaches.push("override_rate_spike");
  }
  if (input.eventType === "error_rate_anomaly") {
    thresholdBreaches.push("error_rate_anomaly");
  }

  const thresholdOutcome = buildThresholdOutcome({
    inputSeverity: input.severity,
    thresholdBreaches: Array.from(new Set(thresholdBreaches)),
    policy,
  });

  return {
    thresholdBreaches: Array.from(new Set(thresholdBreaches)),
    shouldEscalateIncident: thresholdOutcome.shouldEscalateIncident,
    shouldNotify: thresholdOutcome.shouldNotify,
    shouldBlock: thresholdOutcome.shouldBlock,
    incidentCategory: thresholdOutcome.incidentCategory,
    severity: thresholdOutcome.severity,
    decision: thresholdOutcome.decision,
    restrictedPromptMatches,
    notificationRoles: thresholdOutcome.notificationRoles,
    appliedReviewerExceptions: [],
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

  async createForOrg(
    organizationId: string,
    input: Omit<InsertAiTelemetryEvent, "organizationId">,
    options?: { collectionProfile?: TelemetryCollectionProfile },
  ): Promise<AiTelemetryEvent> {
    const metadata = getMetadataRecord(input.metadata);
    const policy = input.systemId
      ? await telemetryPolicyService.getEffectiveForSystem(organizationId, input.systemId)
      : await telemetryPolicyService.getEffectiveForOrg(organizationId);
    let evaluation = evaluateThresholds(input, policy);
    evaluation = await this.applyReviewerExceptions(organizationId, input, evaluation, policy);
    const collectionProfile = options?.collectionProfile ?? "full_evidence";
    const sanitizedInput = sanitizeTelemetryForStorage(input, collectionProfile);
    const enrichedMetadata = {
      ...getMetadataRecord(sanitizedInput.metadata),
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
      appliedReviewerExceptions: evaluation.appliedReviewerExceptions,
      suppressedThresholds:
        evaluation.appliedReviewerExceptions.length > 0
          ? Array.from(
              new Set(
                evaluation.appliedReviewerExceptions.flatMap((exception) => exception.suppressedThresholds),
              ),
            )
          : [],
      notificationRoles: evaluation.notificationRoles,
      policyDecision: evaluation.decision,
    };

    const [created] = await db
      .insert(aiTelemetryEvents)
      .values({
        ...sanitizedInput,
        organizationId,
        severity: evaluation.severity,
        safetySignals: sanitizedInput.safetySignals ?? getStringArray(metadata.safetySignals ?? metadata.safetyFlags),
        piiFlags: sanitizedInput.piiFlags ?? getStringArray(metadata.piiFlags),
        toxicityScore: sanitizedInput.toxicityScore ?? getNumberValue(metadata.toxicityScore),
        runtimeContext: sanitizeRuntimeContext(sanitizedInput.runtimeContext, collectionProfile),
        correlationId: sanitizedInput.correlationId ?? null,
        actionTaken: evaluation.decision,
        blocked: evaluation.shouldBlock,
        metadata: enrichedMetadata,
      })
      .returning();

    if (evaluation.shouldNotify) {
      await this.notifyOperatorsForThresholdBreach(organizationId, created, evaluation);
    }

    let finalEvent = created;

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
        finalEvent = updated;
      }
    }

    await this.maybeTriggerAutoReassessment(organizationId, finalEvent, evaluation);

    return finalEvent;
  }

  private async applyReviewerExceptions(
    organizationId: string,
    input: Omit<InsertAiTelemetryEvent, "organizationId">,
    evaluation: ThresholdEvaluation,
    policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
  ): Promise<ThresholdEvaluation> {
    const matches = await telemetryReviewerExceptionService.findApplicableForEvent(organizationId, {
      systemId: input.systemId ?? null,
      gateway: input.gateway ?? null,
      promptText: input.promptText ?? null,
    });

    if (matches.length === 0) {
      return evaluation;
    }

    const suppressedThresholds = new Set(
      matches.flatMap((exception) => telemetryReviewerExceptionService.getSuppressedThresholds(exception)),
    );
    const thresholdBreaches = evaluation.thresholdBreaches.filter((breach) => !suppressedThresholds.has(breach));
    const restrictedPromptMatches = suppressedThresholds.has("restricted_prompt_detected")
      ? []
      : evaluation.restrictedPromptMatches;
    const thresholdOutcome = buildThresholdOutcome({
      inputSeverity: input.severity,
      thresholdBreaches,
      policy,
    });

    return {
      thresholdBreaches,
      shouldEscalateIncident: thresholdOutcome.shouldEscalateIncident,
      shouldNotify: thresholdOutcome.shouldNotify,
      shouldBlock: thresholdOutcome.shouldBlock,
      incidentCategory: thresholdOutcome.incidentCategory,
      severity: thresholdOutcome.severity,
      decision: thresholdOutcome.decision,
      restrictedPromptMatches,
      notificationRoles: thresholdOutcome.notificationRoles,
      appliedReviewerExceptions: matches.map((exception) => ({
        id: exception.id,
        promptPattern: exception.promptPattern,
        suppressedThresholds: telemetryReviewerExceptionService.getSuppressedThresholds(exception),
      })),
    };
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
      await incidentService.updateForOrg(organizationId, duplicate.id, {
        severity: evaluation.severity === "critical" ? "critical" : "high",
        description: `${event.summary}\n\nThreshold breaches: ${evaluation.thresholdBreaches.join(", ")}`,
        playbook: {
          ...(duplicate.playbook ?? {}),
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
        escalatedTo: "System owner, compliance lead, and governance operations",
        dueAt: new Date((event.detectedAt ?? new Date()).getTime() + 4 * 60 * 60 * 1000),
      });
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

  private async maybeTriggerAutoReassessment(
    organizationId: string,
    event: AiTelemetryEvent,
    evaluation: ThresholdEvaluation,
  ) {
    if (!event.systemId) return;

    const system = await storage.getAiSystemById(organizationId, event.systemId);
    if (!system) return;
    const enrichedSystem = await this.maybeSyncSystemRegistryFromRuntimeObservation(
      organizationId,
      system,
      event,
    );

    if (evaluation.thresholdBreaches.length === 0 && evaluation.decision === "allow") return;

    const manifest = autoDiscoveryService.buildManifestFromSystemAndTelemetry(enrichedSystem, {
      provider: (event as { provider?: string | null }).provider,
      modelName: (event as { modelName?: string | null }).modelName,
      gateway: (event as { gateway?: string | null }).gateway,
      eventType: event.eventType,
      summary: event.summary,
      severity: event.severity,
      driftScore: event.driftScore,
      biasFlags: event.biasFlags,
      safetySignals: event.safetySignals,
      piiFlags: event.piiFlags,
      metadata: {
        ...(getMetadataRecord(event.metadata)),
        autoReassessmentTriggeredBy: "runtime_telemetry",
        thresholdBreaches: evaluation.thresholdBreaches,
        policyDecision: evaluation.decision,
      },
    });

    const answers = {
      ...autoDiscoveryService.deriveAnswers(manifest),
      telemetrySignals: manifest.telemetrySignals,
      autoReassessment: {
        source: "runtime_telemetry",
        telemetryEventId: event.id,
        thresholdBreaches: evaluation.thresholdBreaches,
        decision: evaluation.decision,
      },
    };
    const { riskLevel, score, explanation, suggestedControls } = autoDiscoveryService.computeRiskClassification(answers);
    const existingAssessments = await storage.getRiskAssessmentsBySystemForOrg(organizationId, event.systemId);
    const latest = existingAssessments[0];

    if (latest && latest.riskOutcome === riskLevel && latest.riskScore === score) {
      return;
    }

    const runtimeActor = {
      id: "runtime-telemetry-engine",
      username: "runtime_telemetry_engine",
      fullName: "Runtime Telemetry Engine",
      email: null,
      role: "system",
    };

    await riskAssessmentService.createAssessment({
      organizationId,
      actor: runtimeActor,
      input: {
        systemId: enrichedSystem.id,
        systemName: enrichedSystem.name,
        answers,
        riskOutcome: riskLevel,
        riskScore: score,
        riskExplanation: explanation,
        suggestedControls,
      },
    });

    await storage.updateAiSystemByOrg(organizationId, enrichedSystem.id, {
      ...autoDiscoveryService.buildAutoReassessedSystemInput(manifest, riskLevel),
      lastAssessment: new Date(),
    });

    await auditService.createLog({
      organizationId,
      actor: runtimeActor,
      input: {
        entityType: "ai_system",
        entityId: enrichedSystem.id,
        action: "runtime_telemetry_auto_reassess",
        performedBy: runtimeActor.fullName,
        details: `Runtime telemetry auto-reassessment set "${enrichedSystem.name}" to ${riskLevel} risk (${score}). Event ${event.id}.`,
      },
    });
  }

  private async maybeSyncSystemRegistryFromRuntimeObservation(
    organizationId: string,
    system: AiSystem,
    event: AiTelemetryEvent,
  ) {
    const runtimeContext = getMetadataRecord(event.runtimeContext);
    const environment = getStringValue(runtimeContext.environment);
    const provider = getStringValue((event as { provider?: string | null }).provider);
    const modelName = getStringValue((event as { modelName?: string | null }).modelName);
    const gateway = getStringValue((event as { gateway?: string | null }).gateway);

    const observedModel = [provider ? toTitleCase(provider) : null, modelName].filter(Boolean).join(" / ");
    const normalizedModelType = (system.modelType ?? "").trim().toLowerCase();
    const looksGenericModelType =
      !normalizedModelType ||
      ["unknown", "llm", "multimodal", "classification", "classification model", "ranking model"].includes(
        normalizedModelType,
      );

    const deploymentLabel =
      environment === "production"
        ? "Production runtime connected application"
        : environment
          ? `${toTitleCase(environment)} runtime connected application`
          : system.deploymentContext || "Runtime connected application";

    const updates: Partial<InsertAiSystem> = {};

    if ((!system.vendor || system.vendor === "Unknown") && provider) {
      updates.vendor = toTitleCase(provider);
    }

    if (observedModel && (looksGenericModelType || !normalizedModelType.includes((modelName ?? "").toLowerCase()))) {
      updates.modelType = observedModel;
    }

    if (!system.deploymentContext || /runtime connected application|sdk connected application/i.test(system.deploymentContext)) {
      updates.deploymentContext = gateway ? `${deploymentLabel} via ${gateway}` : deploymentLabel;
    }

    if (!system.purpose && event.summary) {
      updates.purpose = event.summary;
    }

    if (system.status === "draft") {
      updates.status = "under_review";
    }

    if (Object.keys(updates).length === 0) {
      return system;
    }

    const updated = await storage.updateAiSystemByOrg(organizationId, system.id, updates);
    return updated ?? system;
  }
}

export const telemetryService = new TelemetryService();
