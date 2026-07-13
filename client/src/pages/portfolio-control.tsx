import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Building2, BriefcaseBusiness, ShieldAlert, Signal, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

type PortfolioControlResponse = {
  portfolios: Array<{
    id: string;
    slug: string;
    name: string;
    sponsorName: string | null;
    investmentThesis: string | null;
    role: string;
    createdAt: string;
  }>;
  selectedPortfolio: {
    id: string;
    slug: string;
    name: string;
    sponsorName: string | null;
    investmentThesis: string | null;
    role: string;
    createdAt: string;
  } | null;
  portfolioPolicy: {
    id: string;
    portfolioId: string;
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
  } | null;
  organizations: Array<{
    linkId: string;
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    operatingStatus: string;
    documentationRate: number | null;
    containmentHours: number | null;
    openIncidents: number;
    telemetryAlerts: number;
    telemetryPolicySource: "organization" | "portfolio" | "default";
    telemetryPolicyInheritedFrom: string | null;
    tierBreakdown: {
      tier1: number;
      tier2: number;
      tier3: number;
    };
  }>;
  summary: {
    organizations: number;
    tracedWorkflows: number;
    openIncidents: number;
    telemetryAlerts: number;
    tier3Exposure: number;
    averageDocumentationRate: number;
    averageContainmentHours: number | null;
    telemetryPolicySources: {
      organization: number;
      portfolio: number;
      default: number;
    };
  } | null;
};

export default function PortfolioControlPage() {
  const pageCopy = usePageCopy();
  const { toast } = useToast();
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [draftPolicy, setDraftPolicy] = useState<PortfolioControlResponse["portfolioPolicy"]>(null);
  const currentPortfolioIdFromUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    return new URLSearchParams(window.location.search).get("portfolioId") ?? undefined;
  }, [location]);
  const [activePortfolioId, setActivePortfolioId] = useState<string | undefined>(currentPortfolioIdFromUrl);

  useEffect(() => {
    setActivePortfolioId(currentPortfolioIdFromUrl);
  }, [currentPortfolioIdFromUrl]);

  const controlPlaneQuery = useQuery<PortfolioControlResponse>({
    queryKey: ["/api/portfolio-control", activePortfolioId ?? null],
    queryFn: async ({ signal }) => {
      const url = activePortfolioId
        ? `/api/portfolio-control?portfolioId=${encodeURIComponent(activePortfolioId)}`
        : "/api/portfolio-control";
      const response = await apiRequest("GET", url, undefined, { signal });
      return response.json();
    },
  });

  const data = controlPlaneQuery.data;
  const selectedPortfolio = data?.selectedPortfolio ?? null;
  const currentOrganizationRole = user?.organizations.find(
    (organization) => organization.id === user.currentOrganizationId,
  )?.role;
  const canProvisionPortfolio = currentOrganizationRole === "owner" || currentOrganizationRole === "admin";
  const canManageSelectedPortfolio = selectedPortfolio?.role === "portfolio_admin" && canProvisionPortfolio;
  const organizations = useMemo(() => data?.organizations ?? [], [data?.organizations]);

  useEffect(() => {
    setDraftPolicy(data?.portfolioPolicy ?? null);
  }, [data?.portfolioPolicy?.id, activePortfolioId, data?.portfolioPolicy]);

  const savePolicyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPortfolio || !draftPolicy) {
        throw new Error("Portfolio policy is not loaded");
      }
      if (selectedPortfolio.role !== "portfolio_admin") {
        throw new Error("Portfolio admin access required");
      }
      const response = await apiRequest(
        "PATCH",
        `/api/portfolio-control/telemetry-policy?portfolioId=${encodeURIComponent(selectedPortfolio.id)}`,
        {
          driftAlertThreshold: draftPolicy.driftAlertThreshold,
          driftCriticalThreshold: draftPolicy.driftCriticalThreshold,
          biasFlagThreshold: draftPolicy.biasFlagThreshold,
          safetyFlagThreshold: draftPolicy.safetyFlagThreshold,
          toxicityWarningThreshold: draftPolicy.toxicityWarningThreshold,
          toxicityCriticalThreshold: draftPolicy.toxicityCriticalThreshold,
          piiFlagThreshold: draftPolicy.piiFlagThreshold,
          overrideRateWarningThreshold: draftPolicy.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: draftPolicy.overrideRateCriticalThreshold,
          errorRateWarningThreshold: draftPolicy.errorRateWarningThreshold,
          errorRateCriticalThreshold: draftPolicy.errorRateCriticalThreshold,
          autoEscalateCritical: draftPolicy.autoEscalateCritical,
          notifyOnWarning: draftPolicy.notifyOnWarning,
          enforceBlocking: draftPolicy.enforceBlocking,
          blockOnPii: draftPolicy.blockOnPii,
          blockOnSafetyCritical: draftPolicy.blockOnSafetyCritical,
          blockOnRestrictedPrompt: draftPolicy.blockOnRestrictedPrompt,
          restrictedPromptPatterns: draftPolicy.restrictedPromptPatterns,
        },
      );
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/portfolio-control", activePortfolioId ?? null] });
      toast({ title: "Portfolio telemetry policy updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update portfolio telemetry policy", description: error.message, variant: "destructive" });
    },
  });

  const provisionPortfolioMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/portfolio-control/provision", {});
      return response.json() as Promise<{ portfolioId: string }>;
    },
    onSuccess: async ({ portfolioId }) => {
      setActivePortfolioId(portfolioId);
      setLocation(`/portfolio-control?portfolioId=${encodeURIComponent(portfolioId)}`);
      await queryClient.invalidateQueries({ queryKey: ["/api/portfolio-control"] });
      toast({ title: "Portfolio provisioned" });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to provision portfolio",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.portfolioControl.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.portfolioControl.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit">{pageCopy.portfolioControl.badges?.governance}</Badge>
          <Badge variant="outline" className="w-fit">{pageCopy.portfolioControl.badges?.organizations} {data?.summary?.organizations ?? 0}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Portfolio scope</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[minmax(0,260px)_1fr]">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Portfolio selection</div>
            <Select
              value={activePortfolioId ?? selectedPortfolio?.id ?? ""}
              onValueChange={(value) => {
                setActivePortfolioId(value);
                const query = new URLSearchParams();
                query.set("portfolioId", value);
                setLocation(`/portfolio-control?${query.toString()}`);
              }}
              disabled={controlPlaneQuery.isLoading || (data?.portfolios.length ?? 0) === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a portfolio" />
              </SelectTrigger>
              <SelectContent>
                {(data?.portfolios ?? []).map((portfolio) => (
                  <SelectItem key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-md border bg-muted/20 p-4">
            {controlPlaneQuery.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : controlPlaneQuery.isError ? (
              <div className="space-y-2">
                <div className="text-base font-semibold text-destructive">Failed to load portfolio data</div>
                <div className="text-sm text-muted-foreground">
                  {controlPlaneQuery.error instanceof Error
                    ? controlPlaneQuery.error.message
                    : "The selected portfolio could not be loaded."}
                </div>
              </div>
            ) : selectedPortfolio ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-base font-semibold">{selectedPortfolio.name}</div>
                  <Badge variant="outline">{selectedPortfolio.role}</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Sponsor: {selectedPortfolio.sponsorName ?? "Not set"}
                </div>
                <div className="text-sm text-muted-foreground">
                  Thesis: {selectedPortfolio.investmentThesis ?? "No thesis recorded."}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  No portfolio membership is assigned. Portfolio access is created explicitly so viewing this page never grants administrative rights.
                </div>
                {canProvisionPortfolio ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => provisionPortfolioMutation.mutate()}
                    disabled={provisionPortfolioMutation.isPending}
                  >
                    {provisionPortfolioMutation.isPending ? "Provisioning…" : "Provision portfolio"}
                  </Button>
                ) : (
                  <div className="text-xs text-muted-foreground">
                    Ask an organization owner or administrator to provision the portfolio.
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {(data?.portfolios.length ?? 0) > 1 ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.portfolios ?? []).map((portfolio) => {
            const isActive = portfolio.id === (activePortfolioId ?? selectedPortfolio?.id);

            return (
              <button
                key={portfolio.id}
                type="button"
                onClick={() => {
                  setActivePortfolioId(portfolio.id);
                  const query = new URLSearchParams();
                  query.set("portfolioId", portfolio.id);
                  setLocation(`/portfolio-control?${query.toString()}`);
                }}
                className={`rounded-lg border p-4 text-left transition-colors ${
                  isActive ? "border-primary bg-primary/5" : "bg-card hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">{portfolio.name}</div>
                  <Badge variant={isActive ? "default" : "outline"}>{portfolio.role}</Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {portfolio.sponsorName ?? "No sponsor"} • {portfolio.slug}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {portfolio.investmentThesis ?? "No investment thesis recorded."}
                </div>
              </button>
            );
          })}
        </div>
      ) : null}

      {controlPlaneQuery.isError ? null : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard label="Organizations" value={data?.summary?.organizations ?? 0} icon={Building2} />
          <SummaryCard label="Average documentation" value={`${data?.summary?.averageDocumentationRate ?? 0}%`} icon={BriefcaseBusiness} />
          <SummaryCard label="Open incidents" value={data?.summary?.openIncidents ?? 0} icon={ShieldAlert} />
          <SummaryCard label="Telemetry alerts" value={data?.summary?.telemetryAlerts ?? 0} icon={Signal} />
          <SummaryCard label="Tier 3 exposure" value={data?.summary?.tier3Exposure ?? 0} icon={Layers} />
          <SummaryCard
            label="Avg containment"
            value={data?.summary?.averageContainmentHours !== null && data?.summary?.averageContainmentHours !== undefined ? `${data.summary.averageContainmentHours}h` : "N/A"}
            icon={ShieldAlert}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Portfolio telemetry defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedPortfolio && !canManageSelectedPortfolio ? (
            <div className="rounded-md border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              This portfolio is read-only for your current membership. Only `portfolio_admin` can change portfolio defaults.
            </div>
          ) : null}
          <fieldset disabled={!canManageSelectedPortfolio} className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="grid gap-4 md:grid-cols-2">
              <ThresholdField
                label="Drift warning threshold (%)"
                value={draftPolicy?.driftAlertThreshold ?? 5}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, driftAlertThreshold: value } : current)}
              />
              <ThresholdField
                label="Drift critical threshold (%)"
                value={draftPolicy?.driftCriticalThreshold ?? 10}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, driftCriticalThreshold: value } : current)}
              />
              <ThresholdField
                label="Bias flag threshold"
                value={draftPolicy?.biasFlagThreshold ?? 1}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, biasFlagThreshold: value } : current)}
              />
              <ThresholdField
                label="Safety flag threshold"
                value={draftPolicy?.safetyFlagThreshold ?? 1}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, safetyFlagThreshold: value } : current)}
              />
              <ThresholdField
                label="Toxicity warning threshold"
                value={draftPolicy?.toxicityWarningThreshold ?? 60}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, toxicityWarningThreshold: value } : current)}
              />
              <ThresholdField
                label="Toxicity critical threshold"
                value={draftPolicy?.toxicityCriticalThreshold ?? 80}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, toxicityCriticalThreshold: value } : current)}
              />
              <ThresholdField
                label="PII flag threshold"
                value={draftPolicy?.piiFlagThreshold ?? 1}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, piiFlagThreshold: value } : current)}
              />
              <ThresholdField
                label="Override warning threshold (%)"
                value={draftPolicy?.overrideRateWarningThreshold ?? 40}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, overrideRateWarningThreshold: value } : current)}
              />
              <ThresholdField
                label="Override critical threshold (%)"
                value={draftPolicy?.overrideRateCriticalThreshold ?? 60}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, overrideRateCriticalThreshold: value } : current)}
              />
              <ThresholdField
                label="Error-rate warning threshold (%)"
                value={draftPolicy?.errorRateWarningThreshold ?? 5}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, errorRateWarningThreshold: value } : current)}
              />
              <ThresholdField
                label="Error-rate critical threshold (%)"
                value={draftPolicy?.errorRateCriticalThreshold ?? 10}
                onChange={(value) => setDraftPolicy((current) => current ? { ...current, errorRateCriticalThreshold: value } : current)}
              />
              <ToggleField
                label="Auto-escalate critical"
                checked={draftPolicy?.autoEscalateCritical ?? true}
                onChange={(checked) => setDraftPolicy((current) => current ? { ...current, autoEscalateCritical: checked } : current)}
              />
              <ToggleField
                label="Notify on warnings"
                checked={draftPolicy?.notifyOnWarning ?? true}
                onChange={(checked) => setDraftPolicy((current) => current ? { ...current, notifyOnWarning: checked } : current)}
              />
              <ToggleField
                label="Enable runtime blocking"
                checked={draftPolicy?.enforceBlocking ?? false}
                onChange={(checked) => setDraftPolicy((current) => current ? { ...current, enforceBlocking: checked } : current)}
              />
              <ToggleField
                label="Block on PII"
                checked={draftPolicy?.blockOnPii ?? true}
                onChange={(checked) => setDraftPolicy((current) => current ? { ...current, blockOnPii: checked } : current)}
              />
              <ToggleField
                label="Block on safety-critical signals"
                checked={draftPolicy?.blockOnSafetyCritical ?? true}
                onChange={(checked) => setDraftPolicy((current) => current ? { ...current, blockOnSafetyCritical: checked } : current)}
              />
              <ToggleField
                label="Block on restricted prompts"
                checked={draftPolicy?.blockOnRestrictedPrompt ?? true}
                onChange={(checked) => setDraftPolicy((current) => current ? { ...current, blockOnRestrictedPrompt: checked } : current)}
              />
              <label className="space-y-1 text-sm md:col-span-2">
                <span className="font-medium">Restricted prompt patterns</span>
                <Input
                  value={draftPolicy?.restrictedPromptPatterns.join(", ") ?? ""}
                  onChange={(event) =>
                    setDraftPolicy((current) => current ? { ...current, restrictedPromptPatterns: parseCsv(event.target.value) } : current)
                  }
                  placeholder="social security number, bypass policy, dump all customers"
                />
              </label>
            </div>
            <div className="space-y-3 rounded-md border bg-muted/20 p-4 text-sm text-muted-foreground">
              <p>Portfolio defaults apply to all linked operating companies unless that company has an explicit telemetry override.</p>
              <p>These defaults now control both passive evidence capture and active runtime allow-or-block decisions for inherited organizations.</p>
              <p>Organization overrides: {data?.summary?.telemetryPolicySources.organization ?? 0}</p>
              <p>Inherited from portfolio: {data?.summary?.telemetryPolicySources.portfolio ?? 0}</p>
              <p>Falling back to platform defaults: {data?.summary?.telemetryPolicySources.default ?? 0}</p>
              <Button
                className="w-full"
                onClick={() => savePolicyMutation.mutate()}
                disabled={savePolicyMutation.isPending || !draftPolicy || !canManageSelectedPortfolio}
              >
                {savePolicyMutation.isPending ? "Saving..." : "Save portfolio defaults"}
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Operating company register</CardTitle>
        </CardHeader>
        <CardContent>
          {controlPlaneQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
              No organizations are attached to the selected portfolio.
            </div>
          ) : (
            <div className="space-y-3">
              {organizations.map((organization) => (
                <div key={organization.linkId} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-semibold">{organization.organizationName}</div>
                      <div className="text-xs text-muted-foreground">
                        {organization.organizationSlug} • {organization.operatingStatus}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">Docs {organization.documentationRate ?? 0}%</Badge>
                      <Badge variant="outline">Incidents {organization.openIncidents}</Badge>
                      <Badge variant="outline">Alerts {organization.telemetryAlerts}</Badge>
                      <Badge variant={organization.telemetryPolicySource === "organization" ? "secondary" : "outline"}>
                        Policy {organization.telemetryPolicySource}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <DetailTile label="Documentation rate" value={`${organization.documentationRate ?? 0}%`} />
                    <DetailTile label="Containment time" value={organization.containmentHours !== null ? `${organization.containmentHours}h` : "N/A"} />
                    <DetailTile label="Tier 2 decisions" value={organization.tierBreakdown.tier2} />
                    <DetailTile label="Tier 3 decisions" value={organization.tierBreakdown.tier3} />
                  </div>
                  {organization.telemetryPolicyInheritedFrom ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Inheriting telemetry thresholds from {organization.telemetryPolicyInheritedFrom}.
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Building2;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{label}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function DetailTile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
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
    <label className="flex items-center justify-between gap-3 rounded-md border bg-background p-3 text-sm">
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
