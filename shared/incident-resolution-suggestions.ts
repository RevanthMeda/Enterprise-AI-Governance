import type { IncidentPrioritySnapshot } from "./incident-prioritization";

export const incidentResolutionRecommendationKinds = [
  "contain_and_escalate",
  "review_before_release",
  "resolve_with_follow_up",
  "continue_monitoring",
  "monitor_postmortem",
] as const;
export type IncidentResolutionRecommendationKind = (typeof incidentResolutionRecommendationKinds)[number];

export const incidentResolutionConfidenceLevels = ["high", "medium", "low"] as const;
export type IncidentResolutionConfidenceLevel = (typeof incidentResolutionConfidenceLevels)[number];

export type IncidentResolutionSuggestionInput = {
  incidentId: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  owner?: string | null;
  escalatedTo?: string | null;
  dueAt?: string | Date | null;
  detectedAt?: string | Date | null;
  playbook?: unknown;
  priority?: IncidentPrioritySnapshot | null;
};

export type IncidentResolutionSuggestionResponse = {
  generatedAt: string;
  incidentId: string;
  recommendation: IncidentResolutionRecommendationKind;
  confidence: IncidentResolutionConfidenceLevel;
  summary: string;
  rationale: string[];
  recommendedActions: string[];
  reviewerChecks: string[];
  suggestedStatus: "contained" | "resolved" | null;
  shouldEscalate: boolean;
  shouldAssignOwner: boolean;
  signals: {
    priorityLevel: IncidentPrioritySnapshot["level"] | null;
    priorityScore: number | null;
    reasonCodes: string[];
    policyCategories: string[];
    thresholdBreaches: string[];
    threatMatchTitles: string[];
  };
};

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function hasBooleanFlag(record: Record<string, unknown> | null, key: string) {
  return record?.[key] === true;
}

function isActiveIncident(status: string) {
  return status === "open" || status === "contained";
}

function buildSummary(
  recommendation: IncidentResolutionRecommendationKind,
  status: string,
  title: string,
) {
  switch (recommendation) {
    case "contain_and_escalate":
      return `${title} should be contained immediately and escalated through the assigned governance path.`;
    case "review_before_release":
      return `${title} needs reviewer-led release checks before any closure or customer-facing reuse.`;
    case "resolve_with_follow_up":
      return `${title} is ready for controlled resolution once the reviewer records follow-up notes and evidence.`;
    case "continue_monitoring":
      return `${title} can remain in monitored review while the current owner works the playbook.`;
    default:
      return status === "postmortem"
        ? `${title} is already in postmortem tracking.`
        : `${title} is no longer active and should stay under post-incident monitoring.`;
  }
}

export function buildIncidentResolutionSuggestion(
  input: IncidentResolutionSuggestionInput,
): IncidentResolutionSuggestionResponse {
  const playbook = getObjectRecord(input.playbook);
  const reviewRelease = getObjectRecord(playbook?.reviewRelease);
  const sourceVerifier = getObjectRecord(playbook?.sourceAttributionVerifier);
  const factVerifier = getObjectRecord(playbook?.factProvenanceVerifier);
  const actionVerifier = getObjectRecord(playbook?.actionConfirmationVerifier);
  const threatIntelligence = getObjectRecord(playbook?.threatIntelligence);
  const threatMatches = Array.isArray(threatIntelligence?.matches) ? threatIntelligence.matches : [];
  const threatMatchTitles = threatMatches.flatMap((entry) => {
    const record = getObjectRecord(entry);
    return typeof record?.title === "string" ? [record.title] : [];
  });
  const reasonCodes = getStringArray(playbook?.reasonCodes);
  const policyCategories = getStringArray(playbook?.policyCategories);
  const thresholdBreaches = getStringArray(playbook?.thresholdBreaches);
  const active = isActiveIncident(input.status);
  const needsAssignment = !(input.owner && input.owner.trim());
  const releaseHeld =
    hasBooleanFlag(reviewRelease, "required") &&
    typeof reviewRelease?.status === "string" &&
    reviewRelease.status !== "released";
  const verificationRequired =
    hasBooleanFlag(sourceVerifier, "requiresVerification") ||
    hasBooleanFlag(factVerifier, "requiresReview") ||
    hasBooleanFlag(actionVerifier, "requiresConfirmation");
  const criticalSignals =
    input.severity === "critical" ||
    input.priority?.level === "urgent" ||
    input.priority?.breached === true ||
    threatMatchTitles.length > 0 ||
    reasonCodes.some((code) => ["PHISHING", "AML_OVERRIDE", "REGULATOR_FABRICATION"].includes(code)) ||
    policyCategories.some((category) =>
      ["GOVERNANCE_TAMPERING", "CROSS_CUSTOMER_PII", "ILLEGAL_ACTIVITY", "PHISHING"].includes(category),
    );

  let recommendation: IncidentResolutionRecommendationKind = "continue_monitoring";
  let suggestedStatus: "contained" | "resolved" | null = null;
  const rationale: string[] = [];
  const recommendedActions: string[] = [];
  const reviewerChecks: string[] = [];

  if (!active) {
    recommendation = "monitor_postmortem";
    rationale.push("The incident is no longer in an active queue state.");
    reviewerChecks.push("Confirm the post-incident review and regulatory notification record are complete.");
  } else if (criticalSignals) {
    recommendation = "contain_and_escalate";
    suggestedStatus = input.status === "open" ? "contained" : null;
    rationale.push("Severity or policy signals indicate that immediate containment is safer than continued review in place.");
    if (input.priority?.breached) {
      rationale.push("The containment SLA is already breached.");
    }
    if (threatMatchTitles.length > 0) {
      rationale.push(`Threat-intelligence matches were detected: ${threatMatchTitles.slice(0, 2).join(", ")}.`);
    }
    if (releaseHeld) {
      rationale.push("Reviewer release is still required before the underlying runtime turn can be released.");
    }
    recommendedActions.push("Contain the incident now and preserve the captured prompt/output evidence.");
    recommendedActions.push("Escalate to the recorded business and governance owners with the captured policy signals.");
  } else if (releaseHeld || verificationRequired) {
    recommendation = "review_before_release";
    suggestedStatus = input.status === "open" ? "contained" : null;
    rationale.push("The incident includes release or verification gates that still need a named reviewer action.");
    if (verificationRequired) {
      rationale.push("Source, fact, or action-verification controls flagged the turn for additional review.");
    }
    recommendedActions.push("Keep the incident in reviewer-controlled handling until the verification checks are cleared.");
    recommendedActions.push("Record the reviewer note and any action receipt details before closure.");
  } else if (input.status === "contained" && !needsAssignment) {
    recommendation = "resolve_with_follow_up";
    suggestedStatus = "resolved";
    rationale.push("Containment is already in place and no additional release or verification gates are recorded.");
    recommendedActions.push("Resolve the incident and capture the root cause or review summary in the same session.");
  } else {
    recommendation = "continue_monitoring";
    rationale.push("The incident is active but does not currently show critical or gated-release signals.");
    recommendedActions.push("Keep the current reviewer loop active and update the queue state as more evidence arrives.");
  }

  if (needsAssignment) {
    recommendedActions.unshift("Assign a reviewer before the incident leaves the active queue.");
    reviewerChecks.push("Confirm the assigned reviewer owns the next action and containment deadline.");
  }
  if (releaseHeld) {
    reviewerChecks.push("Do not release the related runtime output until the reviewer-release workflow is completed.");
  }
  if (verificationRequired) {
    reviewerChecks.push("Check fact provenance, citation/source requirements, and claimed side effects before resolution.");
  }
  if (reasonCodes.length > 0) {
    reviewerChecks.push(`Confirm the recorded governance reason codes still match the final incident disposition: ${reasonCodes.slice(0, 3).join(", ")}.`);
  }
  if (thresholdBreaches.length > 0) {
    reviewerChecks.push(`Review threshold breaches: ${thresholdBreaches.slice(0, 3).join(", ")}.`);
  }

  const confidence: IncidentResolutionConfidenceLevel = criticalSignals
    ? "high"
    : releaseHeld || verificationRequired || input.priority?.level === "high"
      ? "medium"
      : "low";

  return {
    generatedAt: new Date().toISOString(),
    incidentId: input.incidentId,
    recommendation,
    confidence,
    summary: buildSummary(recommendation, input.status, input.title),
    rationale: Array.from(new Set(rationale)).slice(0, 5),
    recommendedActions: Array.from(new Set(recommendedActions)).slice(0, 6),
    reviewerChecks: Array.from(new Set(reviewerChecks)).slice(0, 6),
    suggestedStatus,
    shouldEscalate: recommendation === "contain_and_escalate" || releaseHeld,
    shouldAssignOwner: needsAssignment,
    signals: {
      priorityLevel: input.priority?.level ?? null,
      priorityScore: input.priority?.score ?? null,
      reasonCodes,
      policyCategories,
      thresholdBreaches,
      threatMatchTitles,
    },
  };
}
