import type {
  TelemetryPolicyAssistResponse,
  TelemetryPolicyImpactResponse,
  TelemetryPolicyPatchDraft,
  TelemetryPolicyRecommendation,
  TelemetryPolicyRecommendationResponse,
} from "@shared/telemetry-policy-advisor";
import { storage } from "../storage";
import { incidentService } from "./incidentService";
import { telemetryPolicyService, type EffectiveTelemetryPolicy } from "./telemetryPolicyService";
import { telemetryService } from "./telemetryService";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function extractThresholdBreaches(metadata: unknown) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
  const values = record?.thresholdBreaches;
  return Array.isArray(values) ? values.filter((entry): entry is string => typeof entry === "string") : [];
}

function extractReasonCodes(metadata: unknown) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : null;
  const values = record?.reasonCodes;
  return Array.isArray(values) ? values.filter((entry): entry is string => typeof entry === "string") : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getCandidatePolicy(
  base: EffectiveTelemetryPolicy,
  patch: TelemetryPolicyPatchDraft,
): EffectiveTelemetryPolicy {
  return {
    ...base,
    ...patch,
    restrictedPromptPatterns: patch.restrictedPromptPatterns
      ? [...patch.restrictedPromptPatterns]
      : [...base.restrictedPromptPatterns],
  };
}

function getRestrictedPromptMatches(event: {
  promptText: string | null;
  modelOutput: string | null;
  summary: string;
  metadata: unknown;
}, policy: EffectiveTelemetryPolicy) {
  const haystack = [event.promptText, event.modelOutput, event.summary].filter(Boolean).join(" ").toLowerCase();
  const thresholdBreaches = extractThresholdBreaches(event.metadata);
  const reasonCodes = extractReasonCodes(event.metadata);
  const matches = policy.restrictedPromptPatterns.filter((pattern) => haystack.includes(pattern.toLowerCase()));
  if (thresholdBreaches.includes("restricted_prompt_detected")) {
    matches.push("restricted_prompt_detected");
  }
  if (reasonCodes.includes("governance_tampering_or_runtime_override")) {
    matches.push("governance_tampering");
  }
  return unique(matches);
}

function classifyEventUnderPolicy(
  event: {
    driftScore: number | null;
    toxicityScore: number | null;
    piiFlags: unknown;
    safetySignals: unknown;
    promptText: string | null;
    modelOutput: string | null;
    summary: string;
    metadata: unknown;
  },
  policy: EffectiveTelemetryPolicy,
) {
  const metadata = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)
    ? (event.metadata as Record<string, unknown>)
    : {};
  const piiCount = Array.isArray(event.piiFlags) ? event.piiFlags.length : 0;
  const safetyCount = Array.isArray(event.safetySignals) ? event.safetySignals.length : 0;
  const driftScore = event.driftScore ?? 0;
  const toxicityScore = event.toxicityScore ?? 0;
  const overrideRate = getNumberValue(metadata.overrideRate) ?? 0;
  const errorRate = getNumberValue(metadata.errorRate) ?? 0;
  const restrictedPromptMatches = getRestrictedPromptMatches(event, policy);

  const warningTriggers = [
    driftScore >= policy.driftAlertThreshold,
    toxicityScore >= policy.toxicityWarningThreshold,
    overrideRate >= policy.overrideRateWarningThreshold,
    errorRate >= policy.errorRateWarningThreshold,
    piiCount >= policy.piiFlagThreshold,
    safetyCount >= policy.safetyFlagThreshold,
    restrictedPromptMatches.length > 0,
  ];
  const criticalTriggers = [
    driftScore >= policy.driftCriticalThreshold,
    toxicityScore >= policy.toxicityCriticalThreshold,
    overrideRate >= policy.overrideRateCriticalThreshold,
    errorRate >= policy.errorRateCriticalThreshold,
    safetyCount >= policy.safetyFlagThreshold,
    restrictedPromptMatches.length > 0,
  ];

  const shouldBlock = policy.enforceBlocking && (
    (policy.blockOnPii && piiCount >= policy.piiFlagThreshold) ||
    (policy.blockOnSafetyCritical && safetyCount >= policy.safetyFlagThreshold) ||
    (policy.blockOnRestrictedPrompt && restrictedPromptMatches.length > 0) ||
    toxicityScore >= policy.toxicityCriticalThreshold ||
    driftScore >= policy.driftCriticalThreshold ||
    overrideRate >= policy.overrideRateCriticalThreshold ||
    errorRate >= policy.errorRateCriticalThreshold
  );

  const shouldEscalate = !shouldBlock && (
    criticalTriggers.some(Boolean) ||
    (policy.autoEscalateCritical && warningTriggers.some(Boolean))
  );

  const shouldWarn = !shouldBlock && !shouldEscalate && warningTriggers.some(Boolean);

  return {
    warnings: shouldWarn ? 1 : 0,
    escalations: shouldEscalate ? 1 : 0,
    blocks: shouldBlock ? 1 : 0,
    notifications: shouldBlock || shouldEscalate || (policy.notifyOnWarning && shouldWarn) ? 1 : 0,
    restrictedPromptMatches,
  };
}

function sumDecisionSummary(items: Array<{ warnings: number; escalations: number; blocks: number; notifications: number }>) {
  return items.reduce(
    (acc, item) => ({
      warnings: acc.warnings + item.warnings,
      escalations: acc.escalations + item.escalations,
      blocks: acc.blocks + item.blocks,
      notifications: acc.notifications + item.notifications,
    }),
    { warnings: 0, escalations: 0, blocks: 0, notifications: 0 },
  );
}

function mergePatch(base: TelemetryPolicyPatchDraft, next: TelemetryPolicyPatchDraft): TelemetryPolicyPatchDraft {
  return {
    ...base,
    ...next,
    ...(next.restrictedPromptPatterns ? { restrictedPromptPatterns: next.restrictedPromptPatterns } : {}),
  };
}

function summarizePatch(patch: TelemetryPolicyPatchDraft) {
  const parts: string[] = [];
  if (patch.enforceBlocking !== undefined) parts.push(patch.enforceBlocking ? "turn on runtime blocking" : "switch to monitor-only mode");
  if (patch.blockOnPii !== undefined) parts.push(patch.blockOnPii ? "block on PII detection" : "stop blocking on PII");
  if (patch.blockOnSafetyCritical !== undefined) parts.push(patch.blockOnSafetyCritical ? "block on safety-critical signals" : "stop blocking on safety-critical signals");
  if (patch.notifyOnWarning !== undefined) parts.push(patch.notifyOnWarning ? "notify on warnings" : "only notify on critical");
  if (patch.autoEscalateCritical !== undefined) parts.push(patch.autoEscalateCritical ? "auto-escalate critical breaches" : "disable auto-escalation for critical breaches");
  if (patch.shadowModeEnabled !== undefined) parts.push(patch.shadowModeEnabled ? `enable shadow mode${patch.shadowModeLabel ? ` as ${patch.shadowModeLabel}` : ""}` : "disable shadow mode");
  if (patch.restrictedPromptPatterns && patch.restrictedPromptPatterns.length > 0) parts.push(`add ${patch.restrictedPromptPatterns.length} restricted prompt patterns`);
  if (patch.toxicityWarningThreshold !== undefined || patch.toxicityCriticalThreshold !== undefined) parts.push("tighten toxicity thresholds");
  if (patch.driftAlertThreshold !== undefined || patch.driftCriticalThreshold !== undefined) parts.push("tighten drift thresholds");
  if (patch.overrideRateWarningThreshold !== undefined || patch.overrideRateCriticalThreshold !== undefined) parts.push("tighten override-rate thresholds");
  return parts.length > 0 ? parts.join(", ") : "apply a targeted telemetry policy update";
}

export function deriveTelemetryPolicyAssistFromIntent(params: {
  policy: EffectiveTelemetryPolicyLike;
  riskLevel?: string | null;
  purpose?: string | null;
  intent: string;
  resolvePresetId: (input: { riskLevel?: string | null; purpose?: string | null; intent?: string | null }) => string;
}): TelemetryPolicyAssistResponse {
  const text = params.intent.trim().toLowerCase();
  const policy = params.policy;

  let suggestedPatch: TelemetryPolicyPatchDraft = {};
  const matchedIntents: string[] = [];
  const warnings: string[] = [];

  const recommendedPresetId = params.resolvePresetId({
    riskLevel: params.riskLevel,
    purpose: params.purpose ?? null,
    intent: params.intent,
  });

  const monitorOnlyRequested = /(monitor only|don't block|do not block|warn only)/.test(text);

  if (monitorOnlyRequested) {
    matchedIntents.push("monitor_only");
    suggestedPatch = mergePatch(suggestedPatch, { enforceBlocking: false });
    warnings.push("Monitor-only mode weakens live runtime protection and is usually a poor fit for high-risk systems.");
  }

  if (!monitorOnlyRequested && /(block|strict|tighten|high[- ]risk|regulated|customer-facing|customer facing)/.test(text)) {
    matchedIntents.push("stricter_runtime");
    suggestedPatch = mergePatch(suggestedPatch, {
      enforceBlocking: true,
      autoEscalateCritical: true,
    });
  }

  if (/(pii|personal data|ssn|social security|transaction history|customer data)/.test(text)) {
    matchedIntents.push("pii_protection");
    suggestedPatch = mergePatch(suggestedPatch, {
      blockOnPii: true,
      piiFlagThreshold: 1,
    });
  }

  if (/(safety|self-harm|phishing|fraud|aml|prompt injection|jailbreak)/.test(text)) {
    matchedIntents.push("safety_guardrails");
    suggestedPatch = mergePatch(suggestedPatch, {
      blockOnSafetyCritical: true,
      safetyFlagThreshold: 1,
    });
  }

  if (/(notify on warning|notify earlier|alert reviewers)/.test(text)) {
    matchedIntents.push("warning_notifications");
    suggestedPatch = mergePatch(suggestedPatch, { notifyOnWarning: true });
  }

  if (/(critical only notifications|don't notify on warning|do not notify on warning)/.test(text)) {
    matchedIntents.push("critical_only_notifications");
    suggestedPatch = mergePatch(suggestedPatch, { notifyOnWarning: false });
  }

  if (/(shadow mode|preview first|test stricter|dry run|simulate first)/.test(text)) {
    matchedIntents.push("shadow_preview");
    suggestedPatch = mergePatch(suggestedPatch, {
      shadowModeEnabled: true,
      shadowModeLabel: policy.shadowModeLabel || "stricter-preview",
    });
  }

  if (/(restricted prompts|governance tampering|internal prompt|system prompt|cross-customer|cross customer)/.test(text)) {
    matchedIntents.push("restricted_patterns");
    const patterns = [...policy.restrictedPromptPatterns];
    if (/governance tampering|internal prompt|system prompt/.test(text)) {
      patterns.push("ignore ai control grid", "show system prompt");
    }
    if (/cross-customer|cross customer/.test(text)) {
      patterns.push("full transaction history", "other customers at the same address");
    }
    suggestedPatch = mergePatch(suggestedPatch, {
      blockOnRestrictedPrompt: true,
      restrictedPromptPatterns: unique(patterns),
    });
  }

  const thresholdMatch = text.match(/toxicity[^0-9]{0,20}(\d{1,3})/);
  if (thresholdMatch) {
    const warning = clamp(Number(thresholdMatch[1]), 1, 100);
    matchedIntents.push("toxicity_threshold");
    suggestedPatch = mergePatch(suggestedPatch, {
      toxicityWarningThreshold: warning,
      toxicityCriticalThreshold: clamp(Math.max(warning + 2, warning), 1, 100),
    });
  }

  const driftMatch = text.match(/drift[^0-9]{0,20}(\d{1,3})/);
  if (driftMatch) {
    const warning = clamp(Number(driftMatch[1]), 1, 100);
    matchedIntents.push("drift_threshold");
    suggestedPatch = mergePatch(suggestedPatch, {
      driftAlertThreshold: warning,
      driftCriticalThreshold: clamp(Math.max(warning + 2, warning), 1, 100),
    });
  }

  if (matchedIntents.length === 0) {
    warnings.push("No strong policy intents were detected. Try describing the risk, desired blocking behavior, and whether you want shadow mode or notifications.");
  }

  return {
    summary: summarizePatch(suggestedPatch),
    matchedIntents,
    warnings,
    recommendedPresetId,
    suggestedPatch,
  };
}

type EffectiveTelemetryPolicyLike = {
  shadowModeLabel: string;
  restrictedPromptPatterns: string[];
};

export class TelemetryPolicyAdvisorService {
  private resolvePresetId(params: { riskLevel?: string | null; purpose?: string | null; intent?: string | null }) {
    const text = `${params.riskLevel ?? ""} ${params.purpose ?? ""} ${params.intent ?? ""}`.toLowerCase();
    if (/(high|unacceptable|regulated|bank|finance|hardship|collections|strict|eu ai act)/.test(text)) {
      return "high_scrutiny";
    }
    if (/(support|customer|servicing|operations|review)/.test(text)) {
      return "customer_ops";
    }
    return "balanced";
  }

  async getRecommendations(params: {
    organizationId: string;
    systemId?: string | null;
  }): Promise<TelemetryPolicyRecommendationResponse> {
    const [policy, incidents, telemetryEvents, system] = await Promise.all([
      params.systemId
        ? telemetryPolicyService.getEffectiveForSystem(params.organizationId, params.systemId)
        : telemetryPolicyService.getEffectiveForOrg(params.organizationId),
      incidentService.listForOrg(params.organizationId, { status: "all" }),
      telemetryService.listForOrg(params.organizationId, 200),
      params.systemId ? storage.getAiSystemById(params.organizationId, params.systemId) : Promise.resolve(undefined),
    ]);

    const filteredIncidents = params.systemId ? incidents.filter((incident) => incident.systemId === params.systemId) : incidents;
    const filteredEvents = params.systemId ? telemetryEvents.filter((event) => event.systemId === params.systemId) : telemetryEvents;

    const signalSummary = {
      openIncidents: filteredIncidents.filter((incident) => incident.status === "open" || incident.status === "contained").length,
      breachedIncidents: filteredIncidents.filter(
        (incident) =>
          (incident.status === "open" || incident.status === "contained") &&
          incident.dueAt &&
          new Date(incident.dueAt).getTime() < Date.now(),
      ).length,
      criticalTelemetryEvents: filteredEvents.filter((event) => event.severity === "critical").length,
      warningTelemetryEvents: filteredEvents.filter((event) => event.severity === "warning").length,
      blockedEvents: filteredEvents.filter((event) => event.blocked).length,
      piiEvents: filteredEvents.filter((event) => Array.isArray(event.piiFlags) && event.piiFlags.length > 0).length,
      safetyEvents: filteredEvents.filter((event) => Array.isArray(event.safetySignals) && event.safetySignals.length > 0).length,
      restrictedPromptEvents: filteredEvents.filter((event) => {
        const thresholdBreaches = extractThresholdBreaches(event.metadata);
        return thresholdBreaches.includes("restricted_prompt_detected") || extractReasonCodes(event.metadata).includes("governance_tampering");
      }).length,
    };

    const recommendations: TelemetryPolicyRecommendation[] = [];

    if ((system?.riskLevel === "high" || system?.riskLevel === "unacceptable") && !policy.enforceBlocking) {
      recommendations.push({
        id: "high-risk-blocking",
        priority: "high",
        title: "Enable live blocking for this high-risk system",
        summary: "This system is marked high-risk but telemetry is still monitor-only.",
        rationale: [
          `Risk level is ${system.riskLevel}.`,
          "High-risk systems should not rely on alerts alone when unsafe traffic is already observable.",
        ],
        suggestedPatch: {
          enforceBlocking: true,
          autoEscalateCritical: true,
          shadowModeEnabled: true,
          shadowModeLabel: policy.shadowModeLabel || "high-risk-preview",
        },
        recommendedPresetId: "high_scrutiny",
      });
    }

    if (signalSummary.breachedIncidents > 0 && (!policy.autoEscalateCritical || !policy.notifyOnWarning)) {
      recommendations.push({
        id: "incident-escalation-tighten",
        priority: "high",
        title: "Tighten escalation for breached incident posture",
        summary: "Open incidents are breaching containment targets, so operators need faster routing.",
        rationale: [
          `${signalSummary.breachedIncidents} incidents are beyond containment target.`,
          "Warnings should notify the queue earlier, and critical events should always auto-escalate.",
        ],
        suggestedPatch: {
          autoEscalateCritical: true,
          notifyOnWarning: true,
          errorRateWarningThreshold: clamp(Math.min(policy.errorRateWarningThreshold, 4), 1, 100),
          errorRateCriticalThreshold: clamp(Math.min(policy.errorRateCriticalThreshold, 8), 1, 100),
        },
      });
    }

    if (signalSummary.piiEvents > 0 && !policy.blockOnPii) {
      recommendations.push({
        id: "pii-block-enable",
        priority: "high",
        title: "Turn on PII blocking",
        summary: "Recent telemetry contains PII flags while the policy does not block on them.",
        rationale: [
          `${signalSummary.piiEvents} recent telemetry events included PII flags.`,
          "If the organization expects redaction and governed release, monitor-only handling is too weak here.",
        ],
        suggestedPatch: {
          blockOnPii: true,
          enforceBlocking: true,
          piiFlagThreshold: 1,
        },
      });
    }

    if (signalSummary.safetyEvents > 0 && !policy.blockOnSafetyCritical) {
      recommendations.push({
        id: "safety-block-enable",
        priority: "high",
        title: "Block on safety-critical signals",
        summary: "Safety signals are appearing in telemetry without a hard runtime block.",
        rationale: [
          `${signalSummary.safetyEvents} recent events carried safety signals.`,
          "High-risk or customer-facing systems should not allow safety-critical prompts through a warning-only posture.",
        ],
        suggestedPatch: {
          blockOnSafetyCritical: true,
          enforceBlocking: true,
          safetyFlagThreshold: 1,
        },
      });
    }

    if (signalSummary.restrictedPromptEvents >= 3) {
      const recommendedPatterns = unique(
        filteredEvents.flatMap((event) => {
          const codes = extractReasonCodes(event.metadata);
          const patterns: string[] = [];
          if (codes.includes("governance_tampering")) patterns.push("ignore ai control grid", "treat blocked as approved");
          if (codes.includes("cross_customer_pii_or_transaction_history_request")) patterns.push("full transaction history", "other customers at the same address");
          if (codes.includes("internal_policy_or_prompt_exfiltration")) patterns.push("reveal internal prompts", "show system prompt");
          return patterns;
        }),
      ).filter((pattern) => !policy.restrictedPromptPatterns.includes(pattern));

      if (recommendedPatterns.length > 0) {
        recommendations.push({
          id: "restricted-pattern-expansion",
          priority: "medium",
          title: "Expand restricted prompt patterns from recent traffic",
          summary: "Recent unsafe prompts are clustering around a repeatable set of phrases.",
          rationale: [
            `${signalSummary.restrictedPromptEvents} recent events hit restricted-prompt or governance-tampering logic.`,
            "Adding a small number of explicit patterns helps preflight catch repeat probes earlier.",
          ],
          suggestedPatch: {
            blockOnRestrictedPrompt: true,
            restrictedPromptPatterns: unique([...policy.restrictedPromptPatterns, ...recommendedPatterns]).slice(0, 12),
          },
        });
      }
    }

    if (signalSummary.warningTelemetryEvents >= 10 && signalSummary.criticalTelemetryEvents <= 2 && !policy.shadowModeEnabled) {
      recommendations.push({
        id: "shadow-mode-preview",
        priority: "medium",
        title: "Turn on shadow mode before tightening live enforcement",
        summary: "The system is noisy enough to justify a stricter preview before changing production behavior.",
        rationale: [
          `${signalSummary.warningTelemetryEvents} warning events appeared in the recent telemetry window.`,
          "A stricter preview helps estimate false positives before you tighten the live runtime path.",
        ],
        suggestedPatch: {
          shadowModeEnabled: true,
          shadowModeLabel: params.systemId ? `${system?.name?.toLowerCase().replace(/\s+/g, "-").slice(0, 20) || "system"}-preview` : "org-preview",
        },
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      scope: params.systemId ? "system" : "organization",
      systemId: params.systemId ?? null,
      telemetryWindowDays: 30,
      signalSummary,
      recommendations,
    };
  }

  async assist(params: {
    organizationId: string;
    systemId?: string | null;
    intent: string;
  }): Promise<TelemetryPolicyAssistResponse> {
    const policy = params.systemId
      ? await telemetryPolicyService.getEffectiveForSystem(params.organizationId, params.systemId)
      : await telemetryPolicyService.getEffectiveForOrg(params.organizationId);
    const system = params.systemId ? await storage.getAiSystemById(params.organizationId, params.systemId) : undefined;
    return deriveTelemetryPolicyAssistFromIntent({
      policy,
      riskLevel: system?.riskLevel,
      purpose: system?.purpose ?? system?.description ?? null,
      intent: params.intent,
      resolvePresetId: (input) => this.resolvePresetId(input),
    });
  }

  async getImpactAnalysis(params: {
    organizationId: string;
    systemId?: string | null;
    patch: TelemetryPolicyPatchDraft;
  }): Promise<TelemetryPolicyImpactResponse> {
    const [basePolicy, events, systems] = await Promise.all([
      params.systemId
        ? telemetryPolicyService.getEffectiveForSystem(params.organizationId, params.systemId)
        : telemetryPolicyService.getEffectiveForOrg(params.organizationId),
      telemetryService.listForOrg(params.organizationId, 200),
      storage.getAiSystemsByOrg(params.organizationId),
    ]);

    const candidatePolicy = getCandidatePolicy(basePolicy, params.patch);
    const scopedEvents = params.systemId ? events.filter((event) => event.systemId === params.systemId) : events;
    const systemNameById = new Map(systems.map((system) => [system.id, system.name]));

    const currentOutcomes = scopedEvents.map((event) => classifyEventUnderPolicy(event, basePolicy));
    const proposedOutcomes = scopedEvents.map((event) => classifyEventUnderPolicy(event, candidatePolicy));

    const impactedSystemCounter = new Map<string, number>();
    const impactedPatternCounter = new Map<string, number>();

    scopedEvents.forEach((event, index) => {
      const current = currentOutcomes[index];
      const proposed = proposedOutcomes[index];
      if (
        current.warnings !== proposed.warnings ||
        current.escalations !== proposed.escalations ||
        current.blocks !== proposed.blocks ||
        current.notifications !== proposed.notifications
      ) {
        const systemLabel = event.systemId ? systemNameById.get(event.systemId) ?? "Unknown system" : "Unlinked events";
        impactedSystemCounter.set(systemLabel, (impactedSystemCounter.get(systemLabel) ?? 0) + 1);
        proposed.restrictedPromptMatches.forEach((match) => {
          impactedPatternCounter.set(match, (impactedPatternCounter.get(match) ?? 0) + 1);
        });
      }
    });

    const current = sumDecisionSummary(currentOutcomes);
    const proposed = sumDecisionSummary(proposedOutcomes);
    const delta = {
      warnings: proposed.warnings - current.warnings,
      escalations: proposed.escalations - current.escalations,
      blocks: proposed.blocks - current.blocks,
      notifications: proposed.notifications - current.notifications,
    };

    const guidance: string[] = [];
    if (delta.blocks > 0) {
      guidance.push(`${delta.blocks} more recent turns would have been blocked under the draft policy.`);
    }
    if (delta.notifications > 0) {
      guidance.push(`${delta.notifications} more reviewer notifications would have been generated.`);
    }
    if (delta.warnings < 0 && delta.blocks === 0 && delta.escalations === 0) {
      guidance.push("The draft mainly reduces warning noise without materially tightening hard enforcement.");
    }
    if (candidatePolicy.shadowModeEnabled) {
      guidance.push(`Shadow mode is enabled as ${candidatePolicy.shadowModeLabel || "preview"}, so you can compare the draft without immediately changing live behavior.`);
    }
    if (guidance.length === 0) {
      guidance.push("The draft has little observable impact on the recent telemetry sample for this scope.");
    }

    return {
      generatedAt: new Date().toISOString(),
      scope: params.systemId ? "system" : "organization",
      systemId: params.systemId ?? null,
      telemetryWindowDays: 30,
      sampleSize: scopedEvents.length,
      current,
      proposed,
      delta,
      impactedSystems: Array.from(impactedSystemCounter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([label, count]) => ({ label, count })),
      impactedPatterns: Array.from(impactedPatternCounter.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([label, count]) => ({ label, count })),
      guidance,
    };
  }
}

export const telemetryPolicyAdvisorService = new TelemetryPolicyAdvisorService();
