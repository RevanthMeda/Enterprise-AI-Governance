import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";
import { useToast } from "@/hooks/use-toast";
import type {
  TelemetryPolicyAssistResponse,
  TelemetryPolicyImpactResponse,
  TelemetryPolicyPatchDraft,
  TelemetryPolicyRecommendationResponse,
} from "@shared/telemetry-policy-advisor";

type TelemetryPolicy = {
  id: string | null;
  organizationId: string;
  systemId: string | null;
  source: "system" | "organization" | "portfolio" | "default";
  inheritedFromPortfolioId: string | null;
  inheritedFromPortfolioName: string | null;
  hasExplicitOverride: boolean;
  driftAlertThreshold: number;
  driftCriticalThreshold: number;
  biasFlagThreshold: number;
  safetyFlagThreshold: number;
  toxicityWarningThreshold: number;
  toxicityCriticalThreshold: number;
  piiFlagThreshold: number;
  overrideRateWarningThreshold: number;
  overrideRateCriticalThreshold: number;
  errorRateWarningThreshold: number;
  errorRateCriticalThreshold: number;
  autoEscalateCritical: boolean;
  notifyOnWarning: boolean;
  enforceBlocking: boolean;
  blockOnPii: boolean;
  blockOnSafetyCritical: boolean;
  blockOnRestrictedPrompt: boolean;
  restrictedPromptPatterns: string[];
  shadowModeEnabled: boolean;
  shadowModeLabel: string;
};

type AiSystemOption = {
  id: string;
  name: string;
  riskLevel: string;
  status: string;
};

type ReviewerException = {
  id: string;
  systemId: string | null;
  gateway: string | null;
  promptPattern: string;
  suppressedThresholds: string[];
  reviewerNote: string;
  active: boolean;
  expiresAt: string | null;
  createdBy: string;
  updatedAt: string;
};

const ORG_SCOPE = "__org__";

const POLICY_PRESETS = [
  {
    id: "balanced",
    label: "Balanced baseline",
    description: "Good starting point for teams that want alerts and selective blocking without overwhelming reviewers.",
    draft: {
      driftAlertThreshold: 5,
      driftCriticalThreshold: 10,
      biasFlagThreshold: 2,
      safetyFlagThreshold: 1,
      toxicityWarningThreshold: 4,
      toxicityCriticalThreshold: 7,
      piiFlagThreshold: 1,
      overrideRateWarningThreshold: 15,
      overrideRateCriticalThreshold: 30,
      errorRateWarningThreshold: 5,
      errorRateCriticalThreshold: 10,
      autoEscalateCritical: true,
      notifyOnWarning: true,
      enforceBlocking: true,
      blockOnPii: true,
      blockOnSafetyCritical: true,
      blockOnRestrictedPrompt: true,
      restrictedPromptPatterns: ["dump all customers", "ignore safety", "internal override"],
      shadowModeEnabled: false,
      shadowModeLabel: "stricter-preview",
    },
  },
  {
    id: "customer_ops",
    label: "Customer operations",
    description: "Tighter defaults for customer-support or financial-servicing copilots where PII and risky wording matter immediately.",
    draft: {
      driftAlertThreshold: 4,
      driftCriticalThreshold: 7,
      biasFlagThreshold: 1,
      safetyFlagThreshold: 1,
      toxicityWarningThreshold: 3,
      toxicityCriticalThreshold: 5,
      piiFlagThreshold: 1,
      overrideRateWarningThreshold: 10,
      overrideRateCriticalThreshold: 20,
      errorRateWarningThreshold: 4,
      errorRateCriticalThreshold: 8,
      autoEscalateCritical: true,
      notifyOnWarning: true,
      enforceBlocking: true,
      blockOnPii: true,
      blockOnSafetyCritical: true,
      blockOnRestrictedPrompt: true,
      restrictedPromptPatterns: [
        "social security number",
        "full transaction history",
        "ignore ai control grid",
        "internal waiver script",
      ],
      shadowModeEnabled: true,
      shadowModeLabel: "customer-ops-preview",
    },
  },
  {
    id: "high_scrutiny",
    label: "High-scrutiny",
    description: "Best fit for high-risk or highly regulated systems that should convert more ambiguous turns into escalations or blocks.",
    draft: {
      driftAlertThreshold: 3,
      driftCriticalThreshold: 5,
      biasFlagThreshold: 1,
      safetyFlagThreshold: 1,
      toxicityWarningThreshold: 2,
      toxicityCriticalThreshold: 4,
      piiFlagThreshold: 1,
      overrideRateWarningThreshold: 5,
      overrideRateCriticalThreshold: 12,
      errorRateWarningThreshold: 3,
      errorRateCriticalThreshold: 6,
      autoEscalateCritical: true,
      notifyOnWarning: true,
      enforceBlocking: true,
      blockOnPii: true,
      blockOnSafetyCritical: true,
      blockOnRestrictedPrompt: true,
      restrictedPromptPatterns: [
        "bypass aml",
        "treat blocked as approved",
        "reveal internal prompts",
        "cross-customer data",
      ],
      shadowModeEnabled: true,
      shadowModeLabel: "high-risk-preview",
    },
  },
] as const;

const THRESHOLD_FIELD_LABELS: Array<{ key: keyof TelemetryPolicy; label: string }> = [
  { key: "driftAlertThreshold", label: "Drift warning" },
  { key: "driftCriticalThreshold", label: "Drift critical" },
  { key: "biasFlagThreshold", label: "Bias flags" },
  { key: "safetyFlagThreshold", label: "Safety flags" },
  { key: "toxicityWarningThreshold", label: "Toxicity warning" },
  { key: "toxicityCriticalThreshold", label: "Toxicity critical" },
  { key: "piiFlagThreshold", label: "PII flags" },
  { key: "overrideRateWarningThreshold", label: "Override warning" },
  { key: "overrideRateCriticalThreshold", label: "Override critical" },
  { key: "errorRateWarningThreshold", label: "Error warning" },
  { key: "errorRateCriticalThreshold", label: "Error critical" },
];

const BLOCKING_FIELD_LABELS: Array<{ key: keyof TelemetryPolicy; label: string }> = [
  { key: "autoEscalateCritical", label: "Auto-escalation" },
  { key: "notifyOnWarning", label: "Warning notifications" },
  { key: "enforceBlocking", label: "Runtime blocking" },
  { key: "blockOnPii", label: "PII blocking" },
  { key: "blockOnSafetyCritical", label: "Safety blocking" },
  { key: "blockOnRestrictedPrompt", label: "Restricted prompt blocking" },
];

function getDraftPreview(saved: TelemetryPolicy | undefined, draft: TelemetryPolicy | null) {
  if (!saved || !draft) {
    return { changedCount: 0, netScore: 0 };
  }

  let changedCount = 0;
  let netScore = 0;

  for (const field of THRESHOLD_FIELD_LABELS) {
    const previous = Number(saved[field.key]);
    const next = Number(draft[field.key]);
    if (previous === next) continue;
    changedCount += 1;
    netScore += next < previous ? 1 : -1;
  }

  for (const field of BLOCKING_FIELD_LABELS) {
    const previous = Boolean(saved[field.key]);
    const next = Boolean(draft[field.key]);
    if (previous === next) continue;
    changedCount += 1;
    netScore += next ? 1 : -1;
  }

  const previousPatterns = saved.restrictedPromptPatterns.length;
  const nextPatterns = draft.restrictedPromptPatterns.length;
  if (previousPatterns !== nextPatterns) {
    changedCount += 1;
    netScore += nextPatterns > previousPatterns ? 1 : -1;
  }

  return { changedCount, netScore };
}

export default function TelemetryPolicyPage() {
  const pageCopy = usePageCopy();
  const { toast } = useToast();
  const initialScopeValue = useMemo(() => {
    if (typeof window === "undefined") {
      return ORG_SCOPE;
    }

    const requestedSystemId = new URLSearchParams(window.location.search).get("systemId");
    return requestedSystemId || ORG_SCOPE;
  }, []);
  const [draft, setDraft] = useState<TelemetryPolicy | null>(null);
  const [scopeValue, setScopeValue] = useState<string>(initialScopeValue);
  const [policyIntent, setPolicyIntent] = useState("");
  const [exceptionDraft, setExceptionDraft] = useState({
    promptPattern: "",
    gateway: "",
    suppressedThresholds: "restricted_prompt_detected",
    reviewerNote: "",
    expiresAt: "",
  });

  const systemsQuery = useQuery<AiSystemOption[]>({
    queryKey: ["/api/ai-systems", "telemetry-policy-options"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/ai-systems");
      return response.json();
    },
  });

  const selectedSystemId = scopeValue === ORG_SCOPE ? null : scopeValue;
  const selectedSystem = useMemo(
    () => (systemsQuery.data ?? []).find((system) => system.id === selectedSystemId) ?? null,
    [systemsQuery.data, selectedSystemId],
  );

  const policyQuery = useQuery<TelemetryPolicy>({
    queryKey: selectedSystemId
      ? ["/api/ai-systems", selectedSystemId, "telemetry-policy"]
      : ["/api/organization/telemetry-policy"],
    queryFn: async () => {
      const endpoint = selectedSystemId
        ? `/api/ai-systems/${selectedSystemId}/telemetry-policy`
        : "/api/organization/telemetry-policy";
      const response = await apiRequest("GET", endpoint);
      return response.json();
    },
  });

  const recommendationsQuery = useQuery<TelemetryPolicyRecommendationResponse>({
    queryKey: ["/api/telemetry-policy/recommendations", selectedSystemId ?? ORG_SCOPE],
    queryFn: async () => {
      const endpoint = selectedSystemId
        ? `/api/telemetry-policy/recommendations?systemId=${encodeURIComponent(selectedSystemId)}`
        : "/api/telemetry-policy/recommendations";
      const response = await apiRequest("GET", endpoint);
      return response.json();
    },
  });

  const exceptionsQuery = useQuery<ReviewerException[]>({
    queryKey: ["/api/telemetry/reviewer-exceptions", selectedSystemId ?? ORG_SCOPE],
    queryFn: async () => {
      const endpoint = selectedSystemId
        ? `/api/telemetry/reviewer-exceptions?systemId=${encodeURIComponent(selectedSystemId)}`
        : "/api/telemetry/reviewer-exceptions";
      const response = await apiRequest("GET", endpoint);
      return response.json();
    },
  });

  useEffect(() => {
    setDraft(policyQuery.data ?? null);
  }, [policyQuery.data, selectedSystemId]);

  useEffect(() => {
    if (scopeValue === ORG_SCOPE) {
      return;
    }

    if (!systemsQuery.data?.some((system) => system.id === scopeValue)) {
      setScopeValue(ORG_SCOPE);
    }
  }, [scopeValue, systemsQuery.data]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    if (selectedSystemId) {
      url.searchParams.set("systemId", selectedSystemId);
    } else {
      url.searchParams.delete("systemId");
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }, [selectedSystemId]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) {
        throw new Error("Telemetry policy is not loaded");
      }

      const endpoint = selectedSystemId
        ? `/api/ai-systems/${selectedSystemId}/telemetry-policy`
        : "/api/organization/telemetry-policy";

      const response = await apiRequest("PATCH", endpoint, {
        driftAlertThreshold: draft.driftAlertThreshold,
        driftCriticalThreshold: draft.driftCriticalThreshold,
        biasFlagThreshold: draft.biasFlagThreshold,
        safetyFlagThreshold: draft.safetyFlagThreshold,
        toxicityWarningThreshold: draft.toxicityWarningThreshold,
        toxicityCriticalThreshold: draft.toxicityCriticalThreshold,
        piiFlagThreshold: draft.piiFlagThreshold,
        overrideRateWarningThreshold: draft.overrideRateWarningThreshold,
        overrideRateCriticalThreshold: draft.overrideRateCriticalThreshold,
        errorRateWarningThreshold: draft.errorRateWarningThreshold,
        errorRateCriticalThreshold: draft.errorRateCriticalThreshold,
        autoEscalateCritical: draft.autoEscalateCritical,
        notifyOnWarning: draft.notifyOnWarning,
        enforceBlocking: draft.enforceBlocking,
        blockOnPii: draft.blockOnPii,
        blockOnSafetyCritical: draft.blockOnSafetyCritical,
        blockOnRestrictedPrompt: draft.blockOnRestrictedPrompt,
        restrictedPromptPatterns: draft.restrictedPromptPatterns,
        shadowModeEnabled: draft.shadowModeEnabled,
        shadowModeLabel: draft.shadowModeLabel,
      });
      return response.json();
    },
    onSuccess: async (updated: TelemetryPolicy) => {
      setDraft(updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-policy"] });
      if (selectedSystemId) {
        await queryClient.invalidateQueries({ queryKey: ["/api/ai-systems", selectedSystemId, "telemetry-policy"] });
      }
      toast({ title: selectedSystemId ? "System telemetry policy updated" : "Telemetry policy updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update telemetry policy", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const endpoint = selectedSystemId
        ? `/api/ai-systems/${selectedSystemId}/telemetry-policy/reset`
        : "/api/organization/telemetry-policy/reset";
      const response = await apiRequest("POST", endpoint);
      return response.json();
    },
    onSuccess: async (updated: TelemetryPolicy) => {
      setDraft(updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-policy"] });
      if (selectedSystemId) {
        await queryClient.invalidateQueries({ queryKey: ["/api/ai-systems", selectedSystemId, "telemetry-policy"] });
      }
      toast({ title: selectedSystemId ? "System override reset" : "Telemetry policy reset to inherited/default source" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset telemetry policy", description: error.message, variant: "destructive" });
    },
  });

  const createExceptionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/telemetry/reviewer-exceptions", {
        systemId: selectedSystemId,
        gateway: exceptionDraft.gateway.trim() || null,
        promptPattern: exceptionDraft.promptPattern,
        suppressedThresholds: parseCsv(exceptionDraft.suppressedThresholds),
        reviewerNote: exceptionDraft.reviewerNote,
        expiresAt: exceptionDraft.expiresAt ? new Date(exceptionDraft.expiresAt).toISOString() : null,
      });
      return response.json();
    },
    onSuccess: async () => {
      setExceptionDraft({
        promptPattern: "",
        gateway: "",
        suppressedThresholds: "restricted_prompt_detected",
        reviewerNote: "",
        expiresAt: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/telemetry/reviewer-exceptions"] });
      toast({ title: "Reviewer exception created" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create reviewer exception", description: error.message, variant: "destructive" });
    },
  });

  const updateExceptionMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const response = await apiRequest("PATCH", `/api/telemetry/reviewer-exceptions/${id}`, payload);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/telemetry/reviewer-exceptions"] });
      toast({ title: "Reviewer exception updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update reviewer exception", description: error.message, variant: "destructive" });
    },
  });

  const assistMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/telemetry-policy/assist", {
        intent: policyIntent,
        systemId: selectedSystemId ?? null,
      });
      return (await response.json()) as TelemetryPolicyAssistResponse;
    },
    onError: (error: Error) => {
      toast({ title: "Failed to generate policy suggestion", description: error.message, variant: "destructive" });
    },
  });

  const impactMutation = useMutation({
    mutationFn: async () => {
      if (!draft) {
        throw new Error("Telemetry policy is not loaded");
      }

      const response = await apiRequest("POST", "/api/telemetry-policy/impact", {
        systemId: selectedSystemId ?? null,
        patch: {
          driftAlertThreshold: draft.driftAlertThreshold,
          driftCriticalThreshold: draft.driftCriticalThreshold,
          biasFlagThreshold: draft.biasFlagThreshold,
          safetyFlagThreshold: draft.safetyFlagThreshold,
          toxicityWarningThreshold: draft.toxicityWarningThreshold,
          toxicityCriticalThreshold: draft.toxicityCriticalThreshold,
          piiFlagThreshold: draft.piiFlagThreshold,
          overrideRateWarningThreshold: draft.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: draft.overrideRateCriticalThreshold,
          errorRateWarningThreshold: draft.errorRateWarningThreshold,
          errorRateCriticalThreshold: draft.errorRateCriticalThreshold,
          autoEscalateCritical: draft.autoEscalateCritical,
          notifyOnWarning: draft.notifyOnWarning,
          enforceBlocking: draft.enforceBlocking,
          blockOnPii: draft.blockOnPii,
          blockOnSafetyCritical: draft.blockOnSafetyCritical,
          blockOnRestrictedPrompt: draft.blockOnRestrictedPrompt,
          restrictedPromptPatterns: draft.restrictedPromptPatterns,
          shadowModeEnabled: draft.shadowModeEnabled,
          shadowModeLabel: draft.shadowModeLabel,
        },
      });
      return (await response.json()) as TelemetryPolicyImpactResponse;
    },
    onError: (error: Error) => {
      toast({ title: "Failed to simulate policy impact", description: error.message, variant: "destructive" });
    },
  });

  const recommendedPresetId = selectedSystem?.riskLevel === "high" || selectedSystem?.riskLevel === "unacceptable"
    ? "high_scrutiny"
    : selectedSystem?.riskLevel === "medium" || selectedSystem?.riskLevel === "limited"
      ? "customer_ops"
      : "balanced";

  const applyPreset = (presetId: string) => {
    const preset = POLICY_PRESETS.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }

    setDraft((current) => (current ? {
      ...current,
      ...preset.draft,
      restrictedPromptPatterns: [...preset.draft.restrictedPromptPatterns],
    } : current));
    toast({ title: `${preset.label} preset applied` });
  };

  const applyPolicyPatch = (patch: TelemetryPolicyPatchDraft) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        ...patch,
        restrictedPromptPatterns: patch.restrictedPromptPatterns
          ? [...patch.restrictedPromptPatterns]
          : current.restrictedPromptPatterns,
      };
    });
  };

  if (policyQuery.isLoading || systemsQuery.isLoading || exceptionsQuery.isLoading || !draft) {
    return (
      <div className="page-shell">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const pageTitle = selectedSystem ? `${selectedSystem.name} telemetry policy` : "Telemetry Policy";
  const draftPreview = getDraftPreview(policyQuery.data, draft);

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.telemetryPolicy.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.telemetryPolicy.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit">
            {pageCopy.telemetryPolicy.badges?.scope}: {selectedSystem ? "system" : "organization"}
          </Badge>
          <Badge variant="outline" className="w-fit">
            {pageCopy.telemetryPolicy.badges?.source}: {draft.source}
          </Badge>
          {draft.inheritedFromPortfolioName ? (
            <Badge variant="outline" className="w-fit">
              {pageCopy.telemetryPolicy.badges?.inheritedFrom} {draft.inheritedFromPortfolioName}
            </Badge>
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Scope and inheritance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,320px)_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Apply settings to</div>
            <Select value={scopeValue} onValueChange={setScopeValue}>
              <SelectTrigger>
                <SelectValue placeholder="Select policy scope" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ORG_SCOPE}>Organization default</SelectItem>
                {(systemsQuery.data ?? []).map((system) => (
                  <SelectItem key={system.id} value={system.id}>
                    {system.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{pageTitle}</div>
            <p className="mt-2">
              {selectedSystem
                ? `This override applies only to ${selectedSystem.name}. It takes precedence over the organization, portfolio, and platform defaults for telemetry events that include this system id.`
                : "This policy applies to all systems in the active organization unless a system-specific override is defined."}
            </p>
            {selectedSystem ? (
              <p className="mt-2">
                Risk level: <span className="font-medium text-foreground">{selectedSystem.riskLevel}</span> • Status: <span className="font-medium text-foreground">{selectedSystem.status}</span>
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Policy template library</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[1fr_280px]">
          <div className="grid gap-3 md:grid-cols-3">
            {POLICY_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  preset.id === recommendedPresetId ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">{preset.label}</div>
                  {preset.id === recommendedPresetId ? <Badge variant="secondary">Recommended</Badge> : null}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{preset.description}</p>
              </button>
            ))}
          </div>
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">How to use this page</div>
            <ol className="mt-2 list-decimal space-y-1 pl-4">
              <li>Pick a preset closest to the system you are governing.</li>
              <li>Adjust only the few thresholds your team actually understands today.</li>
              <li>Use reviewer exceptions sparingly and time-box them.</li>
              <li>Turn on shadow mode first if you want to test stricter rules without flipping live behavior.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Data-driven recommendations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recommendationsQuery.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-4">
                  <SignalSummaryCard label="Open incidents" value={String(recommendationsQuery.data?.signalSummary.openIncidents ?? 0)} />
                  <SignalSummaryCard label="Breached incidents" value={String(recommendationsQuery.data?.signalSummary.breachedIncidents ?? 0)} />
                  <SignalSummaryCard label="Blocked events" value={String(recommendationsQuery.data?.signalSummary.blockedEvents ?? 0)} />
                  <SignalSummaryCard label="Restricted prompts" value={String(recommendationsQuery.data?.signalSummary.restrictedPromptEvents ?? 0)} />
                </div>

                {(recommendationsQuery.data?.recommendations ?? []).length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No recommendation is being pushed right now from recent telemetry and incidents for this scope.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(recommendationsQuery.data?.recommendations ?? []).map((recommendation) => (
                      <div key={recommendation.id} className="rounded-md border p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{recommendation.title}</p>
                              <Badge variant={recommendation.priority === "high" ? "destructive" : recommendation.priority === "medium" ? "secondary" : "outline"}>
                                {recommendation.priority}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">{recommendation.summary}</p>
                          </div>
                          <Button type="button" size="sm" variant="outline" onClick={() => applyPolicyPatch(recommendation.suggestedPatch)}>
                            Apply to draft
                          </Button>
                        </div>
                        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                          {recommendation.rationale.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                        {recommendation.recommendedPresetId ? (
                          <div className="mt-3 text-xs text-muted-foreground">Closest preset: {recommendation.recommendedPresetId}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Plain-English policy helper</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Describe the behavior you want in operator language, and the helper will convert it into a draft policy patch.
            </p>
            <Textarea
              value={policyIntent}
              onChange={(event) => setPolicyIntent(event.target.value)}
              placeholder="Example: For this customer-support system, block PII and prompt-injection attempts, notify on warnings, and test stricter rules in shadow mode first."
              rows={7}
            />
            <Button onClick={() => assistMutation.mutate()} disabled={assistMutation.isPending || policyIntent.trim().length < 8} className="w-full">
              {assistMutation.isPending ? "Generating..." : "Generate policy suggestion"}
            </Button>

            {assistMutation.data ? (
              <div className="space-y-3 rounded-md border bg-muted/20 p-4">
                <div>
                  <div className="text-sm font-medium">Suggested change</div>
                  <p className="mt-1 text-sm text-muted-foreground">{assistMutation.data.summary}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {assistMutation.data.matchedIntents.map((intent) => (
                    <Badge key={intent} variant="outline">{intent}</Badge>
                  ))}
                </div>
                {assistMutation.data.recommendedPresetId ? (
                  <div className="text-xs text-muted-foreground">Closest preset: {assistMutation.data.recommendedPresetId}</div>
                ) : null}
                {assistMutation.data.warnings.length > 0 ? (
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {assistMutation.data.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : null}
                <Button type="button" variant="outline" className="w-full" onClick={() => applyPolicyPatch(assistMutation.data!.suggestedPatch)}>
                  Apply suggestion to draft
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Policy impact simulation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="max-w-3xl text-sm text-muted-foreground">
              Preview how the current draft would have changed recent telemetry outcomes before you save it. This is a sample-based simulation, not a guarantee.
            </p>
            <Button type="button" variant="outline" onClick={() => impactMutation.mutate()} disabled={impactMutation.isPending}>
              {impactMutation.isPending ? "Simulating..." : "Simulate impact"}
            </Button>
          </div>

          {impactMutation.data ? (
            <div className="space-y-4 rounded-md border bg-muted/20 p-4">
              <div className="grid gap-3 md:grid-cols-4">
                <ImpactDeltaCard label="Warnings" current={impactMutation.data.current.warnings} proposed={impactMutation.data.proposed.warnings} delta={impactMutation.data.delta.warnings} />
                <ImpactDeltaCard label="Escalations" current={impactMutation.data.current.escalations} proposed={impactMutation.data.proposed.escalations} delta={impactMutation.data.delta.escalations} />
                <ImpactDeltaCard label="Blocks" current={impactMutation.data.current.blocks} proposed={impactMutation.data.proposed.blocks} delta={impactMutation.data.delta.blocks} />
                <ImpactDeltaCard label="Notifications" current={impactMutation.data.current.notifications} proposed={impactMutation.data.proposed.notifications} delta={impactMutation.data.delta.notifications} />
              </div>

              <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Most impacted systems</div>
                  {impactMutation.data.impactedSystems.length === 0 ? (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">No system-level outcome shifts appeared in the current telemetry sample.</div>
                  ) : (
                    <div className="space-y-2">
                      {impactMutation.data.impactedSystems.map((item) => (
                        <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                          <span>{item.label}</span>
                          <Badge variant="outline">{item.count}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Repeat patterns affected</div>
                  {impactMutation.data.impactedPatterns.length === 0 ? (
                    <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">The draft does not materially change restricted-pattern handling in the current sample.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {impactMutation.data.impactedPatterns.map((item) => (
                        <Badge key={item.label} variant="secondary">{item.label} · {item.count}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-2">
                {impactMutation.data.guidance.map((item) => (
                  <div key={item} className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                    {item}
                  </div>
                ))}
              </div>
              <div className="text-xs text-muted-foreground">
                Sample size: {impactMutation.data.sampleSize} recent telemetry events across the last {impactMutation.data.telemetryWindowDays} days.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-sm font-semibold">Thresholds and blocking rules</CardTitle>
              {draftPreview.changedCount > 0 ? (
                <div
                  className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                  data-testid="telemetry-policy-diff-strip"
                >
                  <span>{draftPreview.changedCount} draft change{draftPreview.changedCount === 1 ? "" : "s"}</span>
                  <Badge variant="outline" className="border-amber-300 bg-background/60 text-[10px] text-amber-800 dark:text-amber-200">
                    {draftPreview.netScore > 0 ? "↓ Net tighter" : draftPreview.netScore < 0 ? "↑ Net looser" : "Net neutral"}
                  </Badge>
                </div>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ThresholdField label="Drift warning threshold (%)" value={draft.driftAlertThreshold} onChange={(value) => setDraft((current) => current ? { ...current, driftAlertThreshold: value } : current)} />
            <ThresholdField label="Drift critical threshold (%)" value={draft.driftCriticalThreshold} onChange={(value) => setDraft((current) => current ? { ...current, driftCriticalThreshold: value } : current)} />
            <ThresholdField label="Bias flag threshold" value={draft.biasFlagThreshold} onChange={(value) => setDraft((current) => current ? { ...current, biasFlagThreshold: value } : current)} />
            <ThresholdField label="Safety flag threshold" value={draft.safetyFlagThreshold} onChange={(value) => setDraft((current) => current ? { ...current, safetyFlagThreshold: value } : current)} />
            <ThresholdField label="Toxicity warning threshold" value={draft.toxicityWarningThreshold} onChange={(value) => setDraft((current) => current ? { ...current, toxicityWarningThreshold: value } : current)} />
            <ThresholdField label="Toxicity critical threshold" value={draft.toxicityCriticalThreshold} onChange={(value) => setDraft((current) => current ? { ...current, toxicityCriticalThreshold: value } : current)} />
            <ThresholdField label="PII flag threshold" value={draft.piiFlagThreshold} onChange={(value) => setDraft((current) => current ? { ...current, piiFlagThreshold: value } : current)} />
            <ThresholdField label="Override warning threshold (%)" value={draft.overrideRateWarningThreshold} onChange={(value) => setDraft((current) => current ? { ...current, overrideRateWarningThreshold: value } : current)} />
            <ThresholdField label="Override critical threshold (%)" value={draft.overrideRateCriticalThreshold} onChange={(value) => setDraft((current) => current ? { ...current, overrideRateCriticalThreshold: value } : current)} />
            <ThresholdField label="Error-rate warning threshold (%)" value={draft.errorRateWarningThreshold} onChange={(value) => setDraft((current) => current ? { ...current, errorRateWarningThreshold: value } : current)} />
            <ThresholdField label="Error-rate critical threshold (%)" value={draft.errorRateCriticalThreshold} onChange={(value) => setDraft((current) => current ? { ...current, errorRateCriticalThreshold: value } : current)} />
            <ToggleField label="Auto-escalate critical breaches" checked={draft.autoEscalateCritical} onChange={(checked) => setDraft((current) => current ? { ...current, autoEscalateCritical: checked } : current)} />
            <ToggleField label="Notify admins on warning breaches" checked={draft.notifyOnWarning} onChange={(checked) => setDraft((current) => current ? { ...current, notifyOnWarning: checked } : current)} />
            <ToggleField label="Enable runtime blocking" checked={draft.enforceBlocking} onChange={(checked) => setDraft((current) => current ? { ...current, enforceBlocking: checked } : current)} />
            <ToggleField label="Block on PII detection" checked={draft.blockOnPii} onChange={(checked) => setDraft((current) => current ? { ...current, blockOnPii: checked } : current)} />
            <ToggleField label="Block on safety-critical signals" checked={draft.blockOnSafetyCritical} onChange={(checked) => setDraft((current) => current ? { ...current, blockOnSafetyCritical: checked } : current)} />
            <ToggleField label="Block on restricted prompts" checked={draft.blockOnRestrictedPrompt} onChange={(checked) => setDraft((current) => current ? { ...current, blockOnRestrictedPrompt: checked } : current)} />
            <ToggleField label="Enable shadow policy preview" checked={draft.shadowModeEnabled} onChange={(checked) => setDraft((current) => current ? { ...current, shadowModeEnabled: checked } : current)} />
            <label className="space-y-1 text-sm">
              <span className="font-medium">Shadow policy label</span>
              <Input
                value={draft.shadowModeLabel}
                onChange={(event) => setDraft((current) => current ? { ...current, shadowModeLabel: event.target.value } : current)}
                placeholder="stricter-preview"
              />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium">Restricted prompt patterns</span>
              <Input
                value={draft.restrictedPromptPatterns.join(", ")}
                onChange={(event) =>
                  setDraft((current) => current ? { ...current, restrictedPromptPatterns: parseCsv(event.target.value) } : current)
                }
                placeholder="social security number, bypass safety, dump all customers"
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Enforcement summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Warning thresholds notify system owners and compliance leads. Critical thresholds can open incidents automatically with a four-hour containment target.
            </p>
            <p>
              Runtime evaluation applies to `/api/telemetry/events`, `/api/telemetry/ingest`, `/api/telemetry/sdk-ingest`, and `/api/telemetry/sdk-evaluate`.
            </p>
            <p>
              Scope precedence is `system -&gt; organization -&gt; portfolio -&gt; platform default`.
            </p>
            <p>
              Current blocking posture: {draft.enforceBlocking ? "runtime blocking enabled" : "monitor-only"} • PII {draft.blockOnPii ? "blocked" : "not blocked"} • Safety critical {draft.blockOnSafetyCritical ? "blocked" : "not blocked"} • Restricted prompts {draft.blockOnRestrictedPrompt ? "blocked" : "not blocked"}.
            </p>
            <p>
              Shadow mode: {draft.shadowModeEnabled ? `enabled as ${draft.shadowModeLabel || "stricter-preview"}` : "disabled"}.
            </p>
            <p>
              {selectedSystem
                ? "This view is editing only the selected system override. Resetting it falls back to the org or inherited defaults."
                : "This view is editing the organization baseline. System overrides, if present, still take precedence for those systems."}
            </p>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : selectedSystem ? "Save system telemetry policy" : "Save telemetry policy"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || !draft.hasExplicitOverride}
            >
              {resetMutation.isPending ? "Resetting..." : selectedSystem ? "Reset system override" : "Reset org override"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Tenant-scoped exceptions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
            These exceptions are tenant-scoped. They suppress only the threshold types you specify when a matching prompt pattern appears for this organization or the selected system. They do not weaken policy for every customer.
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Prompt pattern</span>
              <Input
                value={exceptionDraft.promptPattern}
                onChange={(event) => setExceptionDraft((current) => ({ ...current, promptPattern: event.target.value }))}
                placeholder="age-related maturity signals"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Gateway</span>
              <Input
                value={exceptionDraft.gateway}
                onChange={(event) => setExceptionDraft((current) => ({ ...current, gateway: event.target.value }))}
                placeholder="Optional gateway scope"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Suppressed thresholds</span>
              <Input
                value={exceptionDraft.suppressedThresholds}
                onChange={(event) => setExceptionDraft((current) => ({ ...current, suppressedThresholds: event.target.value }))}
                placeholder="restricted_prompt_detected"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Expires at</span>
              <Input
                type="datetime-local"
                value={exceptionDraft.expiresAt}
                onChange={(event) => setExceptionDraft((current) => ({ ...current, expiresAt: event.target.value }))}
              />
            </label>
            <label className="space-y-1 text-sm lg:col-span-2">
              <span className="font-medium">Reviewer note</span>
              <Input
                value={exceptionDraft.reviewerNote}
                onChange={(event) => setExceptionDraft((current) => ({ ...current, reviewerNote: event.target.value }))}
                placeholder="Approved for this tenant because this task is a legitimate underwriting workflow"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              Scope: {selectedSystem ? `${selectedSystem.name} only` : "Organization-wide baseline"}
            </div>
            <Button
              onClick={() => createExceptionMutation.mutate()}
              disabled={
                createExceptionMutation.isPending ||
                !exceptionDraft.promptPattern.trim() ||
                !exceptionDraft.reviewerNote.trim()
              }
            >
              {createExceptionMutation.isPending ? "Creating..." : "Create reviewer exception"}
            </Button>
          </div>

          <div className="space-y-3">
            {(exceptionsQuery.data ?? []).length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No reviewer exceptions exist for this scope.
              </div>
            ) : (
              (exceptionsQuery.data ?? []).map((exception) => (
                <div key={exception.id} className="rounded-md border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-medium">{exception.promptPattern}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Created by {exception.createdBy} • Updated {new Date(exception.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={exception.active ? "outline" : "secondary"}>
                        {exception.active ? "Active" : "Disabled"}
                      </Badge>
                      <Badge variant="outline">
                        {exception.systemId ? "System scoped" : "Organization scoped"}
                      </Badge>
                      {exception.gateway ? <Badge variant="outline">Gateway {exception.gateway}</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {exception.suppressedThresholds.map((threshold) => (
                      <Badge key={threshold} variant="secondary">{threshold}</Badge>
                    ))}
                    {exception.expiresAt ? (
                      <Badge variant="outline">Expires {new Date(exception.expiresAt).toLocaleString()}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{exception.reviewerNote}</p>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => updateExceptionMutation.mutate({ id: exception.id, payload: { active: !exception.active } })}
                      disabled={updateExceptionMutation.isPending}
                    >
                      {exception.active ? "Disable exception" : "Re-enable exception"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ThresholdField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input type="number" min={1} max={100} value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} />
    </label>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3 text-sm">
      <span className="font-medium">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border" />
    </label>
  );
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function SignalSummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function ImpactDeltaCard({
  label,
  current,
  proposed,
  delta,
}: {
  label: string;
  current: number;
  proposed: number;
  delta: number;
}) {
  const tone = delta > 0 ? "destructive" : delta < 0 ? "secondary" : "outline";
  const formattedDelta = delta > 0 ? `+${delta}` : String(delta);

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">{proposed}</div>
          <div className="text-xs text-muted-foreground">Current {current}</div>
        </div>
        <Badge variant={tone}>{formattedDelta}</Badge>
      </div>
    </div>
  );
}
