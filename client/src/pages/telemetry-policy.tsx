import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type TelemetryPolicy = {
  id: string | null;
  organizationId: string;
  source: "organization" | "portfolio" | "default";
  inheritedFromPortfolioId: string | null;
  inheritedFromPortfolioName: string | null;
  hasExplicitOverride: boolean;
  driftAlertThreshold: number;
  driftCriticalThreshold: number;
  biasFlagThreshold: number;
  safetyFlagThreshold: number;
  overrideRateWarningThreshold: number;
  overrideRateCriticalThreshold: number;
  errorRateWarningThreshold: number;
  errorRateCriticalThreshold: number;
  autoEscalateCritical: boolean;
  notifyOnWarning: boolean;
};

export default function TelemetryPolicyPage() {
  const { toast } = useToast();
  const [draft, setDraft] = useState<TelemetryPolicy | null>(null);

  const policyQuery = useQuery<TelemetryPolicy>({
    queryKey: ["/api/organization/telemetry-policy"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/organization/telemetry-policy");
      const payload = await response.json();
      setDraft((current) => current ?? payload);
      return payload;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draft) {
        throw new Error("Telemetry policy is not loaded");
      }
      const response = await apiRequest("PATCH", "/api/organization/telemetry-policy", {
        driftAlertThreshold: draft.driftAlertThreshold,
        driftCriticalThreshold: draft.driftCriticalThreshold,
        biasFlagThreshold: draft.biasFlagThreshold,
        safetyFlagThreshold: draft.safetyFlagThreshold,
        overrideRateWarningThreshold: draft.overrideRateWarningThreshold,
        overrideRateCriticalThreshold: draft.overrideRateCriticalThreshold,
        errorRateWarningThreshold: draft.errorRateWarningThreshold,
        errorRateCriticalThreshold: draft.errorRateCriticalThreshold,
        autoEscalateCritical: draft.autoEscalateCritical,
        notifyOnWarning: draft.notifyOnWarning,
      });
      return response.json();
    },
    onSuccess: async (updated: TelemetryPolicy) => {
      setDraft(updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-policy"] });
      toast({ title: "Telemetry policy updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update telemetry policy", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/organization/telemetry-policy/reset");
      return response.json();
    },
    onSuccess: async (updated: TelemetryPolicy) => {
      setDraft(updated);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-policy"] });
      toast({ title: "Telemetry policy reset to inherited/default source" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reset telemetry policy", description: error.message, variant: "destructive" });
    },
  });

  if (policyQuery.isLoading || !draft) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Telemetry Policy</h1>
          <p className="text-sm text-muted-foreground">
            Configure drift, bias, override, and error thresholds that drive alerts and automatic incident escalation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit">
            Source: {draft.source}
          </Badge>
          {draft.inheritedFromPortfolioName ? (
            <Badge variant="outline" className="w-fit">
              Inherited from {draft.inheritedFromPortfolioName}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Threshold configuration</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <ThresholdField
              label="Drift warning threshold (%)"
              value={draft.driftAlertThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, driftAlertThreshold: value } : current)}
            />
            <ThresholdField
              label="Drift critical threshold (%)"
              value={draft.driftCriticalThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, driftCriticalThreshold: value } : current)}
            />
            <ThresholdField
              label="Bias flag threshold"
              value={draft.biasFlagThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, biasFlagThreshold: value } : current)}
            />
            <ThresholdField
              label="Safety flag threshold"
              value={draft.safetyFlagThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, safetyFlagThreshold: value } : current)}
            />
            <ThresholdField
              label="Override warning threshold (%)"
              value={draft.overrideRateWarningThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, overrideRateWarningThreshold: value } : current)}
            />
            <ThresholdField
              label="Override critical threshold (%)"
              value={draft.overrideRateCriticalThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, overrideRateCriticalThreshold: value } : current)}
            />
            <ThresholdField
              label="Error-rate warning threshold (%)"
              value={draft.errorRateWarningThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, errorRateWarningThreshold: value } : current)}
            />
            <ThresholdField
              label="Error-rate critical threshold (%)"
              value={draft.errorRateCriticalThreshold}
              onChange={(value) => setDraft((current) => current ? { ...current, errorRateCriticalThreshold: value } : current)}
            />
            <ToggleField
              label="Auto-escalate critical breaches"
              checked={draft.autoEscalateCritical}
              onChange={(checked) => setDraft((current) => current ? { ...current, autoEscalateCritical: checked } : current)}
            />
            <ToggleField
              label="Notify admins on warning breaches"
              checked={draft.notifyOnWarning}
              onChange={(checked) => setDraft((current) => current ? { ...current, notifyOnWarning: checked } : current)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Policy notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Warning thresholds notify operators. Critical thresholds can open incidents automatically when auto-escalation is enabled.
            </p>
            <p>
              Threshold evaluation currently applies to telemetry ingested through `/api/telemetry/events` and `/api/telemetry/ingest`.
            </p>
            <p>
              If no org override exists, this page shows the inherited portfolio defaults or platform defaults.
            </p>
            <Button className="w-full" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save telemetry policy"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending || !draft.hasExplicitOverride}
            >
              {resetMutation.isPending ? "Resetting..." : "Reset org override"}
            </Button>
          </CardContent>
        </Card>
      </div>
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
