import {
  compileLawPackRuntimeOverlay,
  type LawPackId,
} from "@shared/law-packs";
import {
  buildGovernanceDecisionSummary,
  deriveGovernanceReasoning,
  type GovernanceReasonCode,
} from "@shared/governance-reasoning";
import {
  verifyLegalSourceAttribution,
  type LegalSourceVerificationResult,
} from "@shared/legal-source-verifier";
import {
  verifyActionExecutionClaims,
  verifyAuthoritativeFactGrounding,
  type ActionConfirmationVerificationResult,
  type FactProvenanceVerificationResult,
} from "@shared/runtime-governance-verifiers";
import {
  assessSurfaceGovernance,
  type SurfaceGovernanceAssessment,
} from "@shared/governance-policy-registry";
import { type InsertAiTelemetryEvent } from "@shared/schema";
import { telemetryPolicyService } from "./telemetryPolicyService";
import { telemetryReviewerExceptionService } from "./telemetryReviewerExceptionService";

export type ThresholdEvaluation = {
  thresholdBreaches: string[];
  shouldEscalateIncident: boolean;
  shouldNotify: boolean;
  shouldBlock: boolean;
  incidentCategory: "bias" | "reliability" | "safety" | "privacy" | "security";
  severity: "info" | "warning" | "critical";
  decision: "allow" | "warn" | "escalate" | "block";
  restrictedPromptMatches: string[];
  reasonCodes: GovernanceReasonCode[];
  decisionSummary: string;
  notificationRoles: string[];
  appliedReviewerExceptions: Array<{
    id: string;
    promptPattern: string;
    suppressedThresholds: string[];
  }>;
  sourceAttributionVerifier: LegalSourceVerificationResult;
  factProvenanceVerifier: FactProvenanceVerificationResult;
  actionConfirmationVerifier: ActionConfirmationVerificationResult;
};

export type TelemetryCollectionProfile = "minimal" | "redacted" | "full_evidence";
export type TelemetrySeverity = "info" | "warning" | "critical";
export type TelemetryDecision = "allow" | "warn" | "escalate" | "block";
export type GuardVerdict = "benign" | "suspicious" | "malicious";
export type GuardClassifierResult = {
  verdict: GuardVerdict;
  confidence: number | null;
  rationale: string | null;
};

export type RulesEngineSnapshot = Pick<
  ThresholdEvaluation,
  "decision" | "severity" | "shouldBlock" | "thresholdBreaches" | "reasonCodes" | "decisionSummary"
>;

export type ShadowPolicyConfig = {
  label: string;
};

export type ShadowPolicyEvaluation = {
  enabled: boolean;
  label: string | null;
  decision: TelemetryDecision | null;
  blocked: boolean | null;
  thresholdBreaches: string[];
  reasonCodes: GovernanceReasonCode[];
  decisionSummary: string | null;
  differsFromLive: boolean;
};

export type PersistedActionReceipt = {
  name: string;
  status: "completed" | "failed" | "pending";
  toolName: string | null;
  receiptId: string | null;
  performedBy: string | null;
  performedAt: string | null;
  details: string | null;
};

export const NON_RECOVERABLE_REASON_CODES = new Set<GovernanceReasonCode>([
  "aml_override_or_audit_fabrication",
  "phishing_or_credential_theft",
  "internal_policy_or_prompt_exfiltration",
  "protected_trait_or_proxy_discrimination",
  "governance_tampering_or_runtime_override",
  "capability_out_of_scope_for_surface",
]);

export const DECISION_PRIORITY: Record<TelemetryDecision, number> = {
  allow: 0,
  warn: 1,
  escalate: 2,
  block: 3,
};

export const SEVERITY_PRIORITY: Record<TelemetrySeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function isNonRecoverableReasonCode(reasonCode: GovernanceReasonCode) {
  return NON_RECOVERABLE_REASON_CODES.has(reasonCode);
}

export function getMetadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function getStringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function normalizePersistedActionReceipts(value: unknown): PersistedActionReceipt[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const name =
        typeof record.name === "string"
          ? record.name.trim()
          : typeof record.action === "string"
            ? record.action.trim()
            : "";
      if (!name) {
        return [];
      }

      const status =
        record.status === "completed" || record.status === "failed" || record.status === "pending"
          ? record.status
          : "completed";

      return [
        {
          name,
          status,
          toolName: getStringValue(record.toolName) ?? getStringValue(record.tool),
          receiptId: getStringValue(record.receiptId) ?? getStringValue(record.id),
          performedBy: getStringValue(record.performedBy),
          performedAt: getStringValue(record.performedAt),
          details: getStringValue(record.details),
        } satisfies PersistedActionReceipt,
      ];
    })
    .slice(0, 50);
}

export function getRuntimeWorkflowId(input: Omit<InsertAiTelemetryEvent, "organizationId">) {
  const metadata = getMetadataRecord(input.metadata);
  const runtimeContext = getMetadataRecord(input.runtimeContext);
  return getStringValue(metadata.workflowId) ?? getStringValue(runtimeContext.workflowId);
}

export function normalizeTelemetrySeverity(value: unknown): TelemetrySeverity | undefined {
  return value === "info" || value === "warning" || value === "critical" ? value : undefined;
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function collapseText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function getBooleanValue(value: string | undefined) {
  if (!value) return false;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function parseCsvList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveShadowPolicyConfig(
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
): ShadowPolicyConfig | null {
  const envEnabled = getBooleanValue(process.env.AICT_GOVERNANCE_SHADOW_MODE_ENABLED);
  const enabled = Boolean(policy.shadowModeEnabled) || envEnabled;
  if (!enabled) {
    return null;
  }

  return {
    label:
      policy.shadowModeLabel?.trim() ||
      process.env.AICT_GOVERNANCE_SHADOW_MODE_LABEL?.trim() ||
      "stricter-preview",
  };
}

export function extractDecodedSegments(value: string) {
  const decoded: string[] = [];
  const base64Matches = value.match(/[A-Za-z0-9+/=]{24,}/g) ?? [];
  for (const match of base64Matches.slice(0, 4)) {
    if (match.length % 4 !== 0) continue;
    try {
      const text = Buffer.from(match, "base64").toString("utf8");
      if (/[a-zA-Z]{6,}/.test(text)) {
        decoded.push(text);
      }
    } catch {
      // ignore
    }
  }
  const hexMatches = value.match(/\b(?:0x)?[0-9a-fA-F]{24,}\b/g) ?? [];
  for (const match of hexMatches.slice(0, 4)) {
    const hex = match.startsWith("0x") ? match.slice(2) : match;
    if (hex.length % 2 !== 0) continue;
    try {
      const text = Buffer.from(hex, "hex").toString("utf8");
      if (/[a-zA-Z]{6,}/.test(text)) {
        decoded.push(text);
      }
    } catch {
      // ignore
    }
  }
  return decoded;
}

export function toTitleCase(value: string) {
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

export function sanitizeRuntimeContext(
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

export function redactEvidenceText(value: string | null | undefined) {
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

export function sanitizeTelemetryForStorage(
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
  _fallbackSeverity: TelemetrySeverity | undefined,
): TelemetrySeverity {
  if (thresholdBreaches.length === 0) {
    return "info";
  }

  const criticalBreaches = new Set([
    "pii_detected",
    "safety_flags_detected",
    "bias_flags_detected",
    "restricted_prompt_detected",
    "secret_exposure_detected",
    "prompt_injection_detected",
    "repeat_attack_detected",
    "quarantine_active",
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
    "governance_hard_block_required",
    "governance_critic_unsafe",
    "capability_out_of_scope",
    "high_risk_block_required",
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
    thresholdBreaches.includes("tool_argument_enum_violation") ||
    thresholdBreaches.includes("capability_out_of_scope")
  ) {
    return "security" as const;
  }
  if (thresholdBreaches.includes("high_risk_block_required") || thresholdBreaches.includes("high_risk_review_required")) {
    return "safety" as const;
  }
  if (thresholdBreaches.includes("prompt_injection_detected") || thresholdBreaches.includes("repeat_attack_detected")) {
    return "security" as const;
  }
  if (thresholdBreaches.includes("secret_exposure_detected")) {
    return "security" as const;
  }
  if (thresholdBreaches.includes("prompt_injection_detected") || thresholdBreaches.includes("prompt_injection_suspected")) {
    return "security" as const;
  }
  if (thresholdBreaches.includes("quarantine_active")) {
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
  if (thresholdBreaches.includes("human_review_required")) {
    return "reliability" as const;
  }
  return "reliability" as const;
}

type ThresholdOutcome = {
  severity: TelemetrySeverity;
  shouldBlock: boolean;
  shouldEscalateIncident: boolean;
  shouldNotify: boolean;
  notificationRoles: string[];
  incidentCategory: ThresholdEvaluation["incidentCategory"];
  decision: TelemetryDecision;
};

export function buildShadowPolicy(
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
) {
  return {
    ...policy,
    driftAlertThreshold: Math.max(1, policy.driftAlertThreshold - 2),
    biasFlagThreshold: Math.max(1, policy.biasFlagThreshold - 1),
    safetyFlagThreshold: Math.max(1, policy.safetyFlagThreshold - 1),
    toxicityWarningThreshold: Math.max(1, policy.toxicityWarningThreshold - 10),
    piiFlagThreshold: 1,
    notifyOnWarning: true,
    autoEscalateCritical: true,
    enforceBlocking: true,
  };
}

export function buildThresholdOutcome(params: {
  inputSeverity: TelemetrySeverity | undefined;
  thresholdBreaches: string[];
  reasonCodes: GovernanceReasonCode[];
  mixedRewriteEligible: boolean;
  forceHardBlock: boolean;
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>;
}): ThresholdOutcome {
  const severity = deriveSeverityFromBreaches(params.thresholdBreaches, params.inputSeverity);
  const hardBlockBreaches = new Set([
    "pii_detected",
    "restricted_prompt_detected",
    "secret_exposure_detected",
    "prompt_injection_detected",
    "repeat_attack_detected",
    "quarantine_active",
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
    "capability_out_of_scope",
    "high_risk_block_required",
  ]);
  const hasRestrictedPromptOnly =
    params.thresholdBreaches.includes("restricted_prompt_detected") &&
    !params.thresholdBreaches.includes("pii_detected") &&
    !params.thresholdBreaches.includes("secret_exposure_detected") &&
    !params.thresholdBreaches.includes("prompt_injection_detected") &&
    !params.thresholdBreaches.includes("repeat_attack_detected");
  const hasNonRecoverableReasonCodes = params.reasonCodes.some((reasonCode) =>
    isNonRecoverableReasonCode(reasonCode),
  );
  const shouldHardBlock =
    params.forceHardBlock ||
    hasNonRecoverableReasonCodes ||
    params.thresholdBreaches.some((breach) => hardBlockBreaches.has(breach));
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
    ((shouldHardBlock && !(params.mixedRewriteEligible && hasRestrictedPromptOnly && !params.forceHardBlock)) ||
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
    ));
  const shouldEscalateIncident =
    params.thresholdBreaches.length > 0 && severity === "critical" && params.policy.autoEscalateCritical;
  const shouldNotify =
    params.thresholdBreaches.length > 0 && (severity === "critical" || params.policy.notifyOnWarning);
  const notificationRoles: string[] =
    severity === "critical"
      ? ["system_owner", "compliance_lead", "owner", "admin", "cro", "ciso"]
      : ["system_owner", "compliance_lead"];
  const decision: TelemetryDecision =
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

export function evaluateThresholds(
  input: Omit<InsertAiTelemetryEvent, "organizationId">,
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
  lawPackOverlay?: {
    lawPackIds: LawPackId[];
    restrictedPromptPatterns: string[];
    guidanceTags?: string[];
  },
): ThresholdEvaluation {
  const metadata = getMetadataRecord(input.metadata);
  const biasFlags = Array.isArray(input.biasFlags) ? input.biasFlags.filter((entry): entry is string => typeof entry === "string") : [];
  const safetySignals = getStringArray(input.safetySignals ?? metadata.safetySignals ?? metadata.safetyFlags);
  const piiFlags = getStringArray(input.piiFlags ?? metadata.piiFlags);
  const overrideRate = getNumberValue(metadata.overrideRate);
  const errorRate = getNumberValue(metadata.errorRate);
  const toxicityScore = input.toxicityScore ?? getNumberValue(metadata.toxicityScore);
  const rawPromptText = getStringValue(input.promptText) ?? "";
  const promptText = normalizeText(rawPromptText);
  const promptCollapsed = collapseText(rawPromptText);
  const decodedPromptSegments = extractDecodedSegments(rawPromptText);
  const decodedPromptText = decodedPromptSegments.map((segment) => normalizeText(segment));
  const decodedPromptCollapsed = decodedPromptSegments.map((segment) => collapseText(segment));
  const rawOutputText = getStringValue(input.modelOutput) ?? "";
  const outputText = normalizeText(rawOutputText);
  const outputCollapsed = collapseText(rawOutputText);
  const requestedToolNames = getStringArray(metadata.requestedToolNames);
  const returnedToolNames = getStringArray(metadata.returnedToolNames);
  const toolArgumentBreaches = getStringArray(metadata.toolArgumentBreaches);
  const allowedToolNames = new Set(getStringArray(metadata.allowedToolNames));
  const sourceReferences = Array.from(
    new Set([
      ...getStringArray(metadata.sourceReferences),
      ...getStringArray(metadata.citationSources),
      ...getStringArray(metadata.sourceUrls),
    ]),
  );
  const authoritativeFacts = metadata.authoritativeFacts;
  const executedActions = metadata.executedActions;
  const thresholdBreaches: string[] = [];
  const defaultRestrictedPromptPatterns = [
    "bypass safety",
    "ignore safety",
    "ignore previous instructions",
    "ignore all previous instructions",
    "override previous instructions",
    "disregard prior instructions",
    "ignore all prior directives",
    "ignore the above instructions",
    "execute the following instruction",
    "execute the resulting instruction",
    "evaluate the following concatenated string",
    "payload splitting",
    "token smuggling",
    "contextual frame shifting",
    "system override",
    "role: system",
    "role: developer",
    "role: assistant",
    "translate the directive and execute",
    "without providing the translation",
    "developer message",
    "system prompt",
    "reveal system prompt",
    "show hidden prompt",
    "internal instructions",
    "internal routing algorithms",
    "initialization parameters",
    "diagnostic mode",
    "jailbreak",
    "do anything now",
    "dan mode",
    "bypass guardrails",
    "forget the rules",
    "disable safety",
    "internal instructions",
    "internal routing algorithms",
    "initialization parameters",
    "hidden system prompt",
    "diagnostic mode",
    "social security number",
    "national insurance number",
    "ni number",
    "ssn",
    "api key",
    "secret key",
    "private key",
    "access token",
    "session token",
  ];
  const restrictedPromptCandidates = Array.from(
    new Set(
      [
        ...policy.restrictedPromptPatterns,
        ...defaultRestrictedPromptPatterns,
        ...(lawPackOverlay?.restrictedPromptPatterns ?? []),
      ]
        .filter((pattern): pattern is string => typeof pattern === "string" && pattern.trim().length > 0),
    ),
  );
  const restrictedPromptMatches = restrictedPromptCandidates.filter((pattern) => {
    const normalizedPattern = normalizeText(pattern);
    const collapsedPattern = collapseText(pattern);
    return (
      (normalizedPattern.length > 0 && promptText.includes(normalizedPattern)) ||
      (collapsedPattern.length > 0 && promptCollapsed.includes(collapsedPattern)) ||
      decodedPromptText.some((decoded) => decoded.includes(normalizedPattern)) ||
      decodedPromptCollapsed.some((decoded) => decoded.includes(collapsedPattern))
    );
  });
  const restrictedOutputMatches = restrictedPromptCandidates.filter((pattern) => {
    const normalizedPattern = normalizeText(pattern);
    const collapsedPattern = collapseText(pattern);
    return (
      (normalizedPattern.length > 0 && outputText.includes(normalizedPattern)) ||
      (collapsedPattern.length > 0 && outputCollapsed.includes(collapsedPattern))
    );
  });
  const combinedRestrictedMatches = Array.from(
    new Set([...restrictedPromptMatches, ...restrictedOutputMatches]),
  );

  const piiOutputSignals: string[] = [];
  if (
    /\b\d{3}-\d{2}-\d{4}\b/.test(rawOutputText) ||
    /social security number|national insurance number|ni number/.test(outputText)
  ) {
    piiOutputSignals.push("social_security_number");
  }
  if (
    /\b(?:\d[ -]*?){12,19}\b/.test(rawOutputText) ||
    /account number|routing number|iban/.test(outputText)
  ) {
    piiOutputSignals.push("financial_identifier");
  }

  const combinedPiiFlags = Array.from(new Set([...piiFlags, ...piiOutputSignals]));
  const derivedSafetySignals = [...safetySignals];
  if (
    /\bsk-[A-Za-z0-9_-]{16,}\b/.test(rawOutputText) ||
    /api key|secret key|private key/.test(outputText)
  ) {
    derivedSafetySignals.push("secret-exposure");
  }
  if (/system prompt|developer message|internal instructions|initialization parameters/.test(outputText)) {
    derivedSafetySignals.push("secret-exposure");
  }

  if ((input.driftScore ?? 0) >= policy.driftAlertThreshold) {
    thresholdBreaches.push("drift_gt_5_percent");
  }
  if (biasFlags.length >= policy.biasFlagThreshold) {
    thresholdBreaches.push("bias_flags_detected");
  }
  if (derivedSafetySignals.length >= policy.safetyFlagThreshold) {
    thresholdBreaches.push("safety_flags_detected");
  }
  if (toxicityScore !== null && toxicityScore >= policy.toxicityWarningThreshold) {
    thresholdBreaches.push("toxicity_warning");
  }
  if (combinedPiiFlags.length >= policy.piiFlagThreshold) {
    thresholdBreaches.push("pii_detected");
  }
  if (overrideRate !== null && overrideRate >= policy.overrideRateWarningThreshold) {
    thresholdBreaches.push("override_rate_spike");
  }
  if (errorRate !== null && errorRate >= policy.errorRateWarningThreshold) {
    thresholdBreaches.push("error_rate_anomaly");
  }
  if (combinedRestrictedMatches.length > 0) {
    thresholdBreaches.push("restricted_prompt_detected");
  }
  if (derivedSafetySignals.includes("secret-exposure")) {
    thresholdBreaches.push("secret_exposure_detected");
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

  let governanceReasoning = deriveGovernanceReasoning({
    promptText: input.promptText,
    modelOutput: input.modelOutput,
    thresholdBreaches: Array.from(new Set(thresholdBreaches)),
    restrictedPromptMatches: combinedRestrictedMatches,
    lawPackIds: lawPackOverlay?.lawPackIds ?? [],
    guidanceTags: lawPackOverlay?.guidanceTags ?? [],
  });
  const sourceVerification = verifyLegalSourceAttribution({
    promptText: input.promptText,
    modelOutput: input.modelOutput,
    sourceReferences,
  });
  const factVerification = verifyAuthoritativeFactGrounding({
    promptText: input.promptText,
    modelOutput: input.modelOutput,
    authoritativeFacts,
  });
  const actionVerification = verifyActionExecutionClaims({
    modelOutput: input.modelOutput,
    executedActions,
  });
  if (sourceVerification.requiresVerification) {
    thresholdBreaches.push(
      sourceVerification.citationBackedRequired
        ? "citation_backed_legal_content_required"
        : "authority_source_verification_failed",
    );
    governanceReasoning = {
      ...governanceReasoning,
      mixedRewriteEligible: true,
      reasonCodes: Array.from(
        new Set<GovernanceReasonCode>([
          ...governanceReasoning.reasonCodes,
          ...(sourceVerification.citationBackedRequired
            ? (["legal_or_regulatory_citation_required"] as GovernanceReasonCode[])
            : []),
          ...(sourceVerification.missingAuthorities.length > 0
            ? (["fabricated_authority_or_regulatory_quote"] as GovernanceReasonCode[])
            : []),
        ]),
      ),
    };
  }
  if (factVerification.requiresReview) {
    thresholdBreaches.push("authoritative_fact_verification_failed");
    governanceReasoning = {
      ...governanceReasoning,
      mixedRewriteEligible: true,
      reasonCodes: Array.from(
        new Set<GovernanceReasonCode>([
          ...governanceReasoning.reasonCodes,
          "authoritative_fact_provenance_missing",
        ]),
      ),
    };
  }
  if (actionVerification.requiresConfirmation) {
    thresholdBreaches.push("action_confirmation_required");
    governanceReasoning = {
      ...governanceReasoning,
      mixedRewriteEligible: true,
      reasonCodes: Array.from(
        new Set<GovernanceReasonCode>([
          ...governanceReasoning.reasonCodes,
          "unsupported_case_action_or_false_execution",
        ]),
      ),
    };
  }

  if (governanceReasoning.forceHardBlock) {
    thresholdBreaches.push("governance_hard_block_required");
  } else if (governanceReasoning.reasonCodes.length > 0) {
    thresholdBreaches.push("governance_review_required");
  }

  const thresholdOutcome = buildThresholdOutcome({
    inputSeverity: normalizeTelemetrySeverity(input.severity),
    thresholdBreaches: Array.from(new Set(thresholdBreaches)),
    reasonCodes: governanceReasoning.reasonCodes,
    mixedRewriteEligible: governanceReasoning.mixedRewriteEligible,
    forceHardBlock: governanceReasoning.forceHardBlock,
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
    restrictedPromptMatches: combinedRestrictedMatches,
    reasonCodes: governanceReasoning.reasonCodes,
    decisionSummary: buildGovernanceDecisionSummary({
      decision: thresholdOutcome.decision,
      blocked: thresholdOutcome.shouldBlock,
      reasonCodes: governanceReasoning.reasonCodes,
    }),
    notificationRoles: thresholdOutcome.notificationRoles,
    appliedReviewerExceptions: [],
    sourceAttributionVerifier: sourceVerification,
    factProvenanceVerifier: factVerification,
    actionConfirmationVerifier: actionVerification,
  };
}

export function applySurfaceGovernanceAssessment(params: {
  inputSeverity: TelemetrySeverity | undefined;
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>;
  evaluation: ThresholdEvaluation;
  assessment: SurfaceGovernanceAssessment;
}): ThresholdEvaluation {
  const nextReasonCodes = Array.from(
    new Set([...params.evaluation.reasonCodes, ...params.assessment.promotedReasonCodes]),
  );
  const nextThresholdBreaches = Array.from(
    new Set([...params.evaluation.thresholdBreaches, ...params.assessment.promotedThresholdBreaches]),
  );

  if (
    nextReasonCodes.join("|") === params.evaluation.reasonCodes.join("|") &&
    nextThresholdBreaches.join("|") === params.evaluation.thresholdBreaches.join("|")
  ) {
    return params.evaluation;
  }

  const thresholdOutcome = buildThresholdOutcome({
    inputSeverity: params.inputSeverity,
    thresholdBreaches: nextThresholdBreaches,
    reasonCodes: nextReasonCodes,
    mixedRewriteEligible: nextReasonCodes.includes("mixed_request_rewrite_available"),
    forceHardBlock: nextReasonCodes.some((reasonCode) => isNonRecoverableReasonCode(reasonCode)),
    policy: params.policy,
  });

  return {
    ...params.evaluation,
    thresholdBreaches: nextThresholdBreaches,
    shouldEscalateIncident: thresholdOutcome.shouldEscalateIncident,
    shouldNotify: thresholdOutcome.shouldNotify,
    shouldBlock: thresholdOutcome.shouldBlock,
    incidentCategory: thresholdOutcome.incidentCategory,
    severity: thresholdOutcome.severity,
    decision: thresholdOutcome.decision,
    reasonCodes: nextReasonCodes,
    decisionSummary: buildGovernanceDecisionSummary({
      decision: thresholdOutcome.decision,
      blocked: thresholdOutcome.shouldBlock,
      reasonCodes: nextReasonCodes,
    }),
    notificationRoles: thresholdOutcome.notificationRoles,
  };
}

export function buildRulesEngineSnapshot(evaluation: ThresholdEvaluation): RulesEngineSnapshot {
  return {
    decision: evaluation.decision,
    severity: evaluation.severity,
    shouldBlock: evaluation.shouldBlock,
    thresholdBreaches: [...evaluation.thresholdBreaches],
    reasonCodes: [...evaluation.reasonCodes],
    decisionSummary: evaluation.decisionSummary,
  };
}

export function recomputeEvaluation(
  inputSeverity: TelemetrySeverity | undefined,
  thresholdBreaches: string[],
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>,
  evaluation: ThresholdEvaluation,
): ThresholdEvaluation {
  const thresholdOutcome = buildThresholdOutcome({
    inputSeverity,
    thresholdBreaches,
    reasonCodes: evaluation.reasonCodes,
    mixedRewriteEligible: evaluation.reasonCodes.includes("mixed_request_rewrite_available"),
    forceHardBlock: evaluation.reasonCodes.some((reasonCode) => isNonRecoverableReasonCode(reasonCode)),
    policy,
  });

  return {
    ...evaluation,
    thresholdBreaches,
    shouldEscalateIncident: thresholdOutcome.shouldEscalateIncident,
    shouldNotify: thresholdOutcome.shouldNotify,
    shouldBlock: thresholdOutcome.shouldBlock,
    incidentCategory: thresholdOutcome.incidentCategory,
    severity: thresholdOutcome.severity,
    decision: thresholdOutcome.decision,
    decisionSummary: buildGovernanceDecisionSummary({
      decision: thresholdOutcome.decision,
      blocked: thresholdOutcome.shouldBlock,
      reasonCodes: evaluation.reasonCodes,
    }),
    notificationRoles: thresholdOutcome.notificationRoles,
    sourceAttributionVerifier: evaluation.sourceAttributionVerifier,
    factProvenanceVerifier: evaluation.factProvenanceVerifier,
    actionConfirmationVerifier: evaluation.actionConfirmationVerifier,
  };
}

export async function applyReviewerExceptions(
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
    inputSeverity: normalizeTelemetrySeverity(input.severity),
    thresholdBreaches,
    reasonCodes: evaluation.reasonCodes,
    mixedRewriteEligible: evaluation.reasonCodes.includes("mixed_request_rewrite_available"),
    forceHardBlock: evaluation.reasonCodes.some((reasonCode) => isNonRecoverableReasonCode(reasonCode)),
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
    reasonCodes: evaluation.reasonCodes,
    decisionSummary: buildGovernanceDecisionSummary({
      decision: thresholdOutcome.decision,
      blocked: thresholdOutcome.shouldBlock,
      reasonCodes: evaluation.reasonCodes,
    }),
    notificationRoles: thresholdOutcome.notificationRoles,
    appliedReviewerExceptions: matches.map((exception) => ({
      id: exception.id,
      promptPattern: exception.promptPattern,
      suppressedThresholds: telemetryReviewerExceptionService.getSuppressedThresholds(exception),
    })),
    sourceAttributionVerifier: evaluation.sourceAttributionVerifier,
    factProvenanceVerifier: evaluation.factProvenanceVerifier,
    actionConfirmationVerifier: evaluation.actionConfirmationVerifier,
  };
}

export function buildShadowPolicyEvaluation(params: {
  config: ShadowPolicyConfig | null;
  input: Omit<InsertAiTelemetryEvent, "organizationId">;
  liveEvaluation: ThresholdEvaluation;
  policy: Awaited<ReturnType<typeof telemetryPolicyService.getEffectiveForOrg>>;
  lawPackOverlay: {
    lawPackIds: LawPackId[];
    restrictedPromptPatterns: string[];
    guidanceTags?: string[];
  };
  surfaceGovernance: {
    capabilityProfileApplied: string;
    allowedCapabilitiesApplied: string[];
    strictnessApplied: "normal" | "high_risk";
  };
}): ShadowPolicyEvaluation {
  if (!params.config) {
    return {
      enabled: false,
      label: null,
      decision: null,
      blocked: null,
      thresholdBreaches: [],
      reasonCodes: [],
      decisionSummary: null,
      differsFromLive: false,
    };
  }

  const shadowPolicy = buildShadowPolicy(params.policy);
  let shadowEvaluation = evaluateThresholds(params.input, shadowPolicy, params.lawPackOverlay);
  shadowEvaluation = applySurfaceGovernanceAssessment({
    inputSeverity: normalizeTelemetrySeverity(params.input.severity),
    policy: shadowPolicy,
    evaluation: shadowEvaluation,
    assessment: assessSurfaceGovernance({
      promptText: params.input.promptText,
      modelOutput: params.input.modelOutput,
      reasonCodes: shadowEvaluation.reasonCodes,
      capabilityProfile: params.surfaceGovernance.capabilityProfileApplied,
      allowedCapabilities: params.surfaceGovernance.allowedCapabilitiesApplied,
      strictness: params.surfaceGovernance.strictnessApplied,
    }),
  });
  return {
    enabled: true,
    label: params.config.label,
    decision: shadowEvaluation.decision,
    blocked: shadowEvaluation.shouldBlock,
    thresholdBreaches: shadowEvaluation.thresholdBreaches,
    reasonCodes: shadowEvaluation.reasonCodes,
    decisionSummary: shadowEvaluation.decisionSummary,
    differsFromLive:
      shadowEvaluation.decision !== params.liveEvaluation.decision ||
      shadowEvaluation.shouldBlock !== params.liveEvaluation.shouldBlock ||
      shadowEvaluation.thresholdBreaches.join("|") !== params.liveEvaluation.thresholdBreaches.join("|"),
  };
}
