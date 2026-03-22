export type TelemetryPolicyPatchDraft = {
  driftAlertThreshold?: number;
  driftCriticalThreshold?: number;
  biasFlagThreshold?: number;
  safetyFlagThreshold?: number;
  toxicityWarningThreshold?: number;
  toxicityCriticalThreshold?: number;
  piiFlagThreshold?: number;
  overrideRateWarningThreshold?: number;
  overrideRateCriticalThreshold?: number;
  errorRateWarningThreshold?: number;
  errorRateCriticalThreshold?: number;
  autoEscalateCritical?: boolean;
  notifyOnWarning?: boolean;
  enforceBlocking?: boolean;
  blockOnPii?: boolean;
  blockOnSafetyCritical?: boolean;
  blockOnRestrictedPrompt?: boolean;
  restrictedPromptPatterns?: string[];
  shadowModeEnabled?: boolean;
  shadowModeLabel?: string;
};

export type TelemetryPolicyRecommendation = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  summary: string;
  rationale: string[];
  suggestedPatch: TelemetryPolicyPatchDraft;
  recommendedPresetId?: string | null;
};

export type TelemetryPolicyRecommendationResponse = {
  generatedAt: string;
  scope: "organization" | "system";
  systemId: string | null;
  telemetryWindowDays: number;
  signalSummary: {
    openIncidents: number;
    breachedIncidents: number;
    criticalTelemetryEvents: number;
    warningTelemetryEvents: number;
    blockedEvents: number;
    piiEvents: number;
    safetyEvents: number;
    restrictedPromptEvents: number;
  };
  recommendations: TelemetryPolicyRecommendation[];
};

export type TelemetryPolicyAssistResponse = {
  summary: string;
  matchedIntents: string[];
  warnings: string[];
  recommendedPresetId: string | null;
  suggestedPatch: TelemetryPolicyPatchDraft;
};

export type TelemetryPolicyImpactDecisionSummary = {
  warnings: number;
  escalations: number;
  blocks: number;
  notifications: number;
};

export type TelemetryPolicyImpactHotspot = {
  label: string;
  count: number;
};

export type TelemetryPolicyImpactResponse = {
  generatedAt: string;
  scope: "organization" | "system";
  systemId: string | null;
  telemetryWindowDays: number;
  sampleSize: number;
  current: TelemetryPolicyImpactDecisionSummary;
  proposed: TelemetryPolicyImpactDecisionSummary;
  delta: TelemetryPolicyImpactDecisionSummary;
  impactedSystems: TelemetryPolicyImpactHotspot[];
  impactedPatterns: TelemetryPolicyImpactHotspot[];
  guidance: string[];
};
