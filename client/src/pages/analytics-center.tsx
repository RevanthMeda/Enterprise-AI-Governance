import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BarChart3, Download, FileDown, ShieldCheck, Siren, Workflow } from "lucide-react";
import {
  ResponsiveContainer,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  LineChart,
  Line,
  BarChart,
  Bar,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  exportAnalyticsReportPlanCsv,
  exportAnalyticsReportPlanPdf,
} from "@/lib/export-utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";
import type { AnalyticsOverviewResponse, AnalyticsReportPresetId } from "@shared/analytics-overview";
import {
  analyticsReportCadences,
  analyticsReportFormats,
  analyticsReportSectionIds,
  analyticsReportSectionLabels,
  buildAnalyticsReportPlanId,
  type AnalyticsReportBuilderConfig,
  type AnalyticsReportPlan,
} from "@shared/analytics-report-builder";

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: typeof BarChart3;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-2 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

const distributionColors = ["#2563eb", "#0f766e", "#d97706", "#9333ea", "#dc2626"];

export default function AnalyticsCenterPage() {
  const pageCopy = usePageCopy();
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [plansDraft, setPlansDraft] = useState<AnalyticsReportPlan[]>([]);
  const { data, isLoading, isError, refetch } = useQuery<AnalyticsOverviewResponse>({
    queryKey: ["/api/analytics/overview"],
  });
  const reportBuilderQuery = useQuery<AnalyticsReportBuilderConfig>({
    queryKey: ["/api/analytics/report-builder"],
  });

  useEffect(() => {
    if (!reportBuilderQuery.data) {
      return;
    }
    setPlansDraft(reportBuilderQuery.data.plans);
    setSelectedPlanId(reportBuilderQuery.data.defaultPlanId ?? reportBuilderQuery.data.plans[0]?.id ?? "");
  }, [reportBuilderQuery.data]);

  const selectedPlan = useMemo(
    () => plansDraft.find((plan) => plan.id === selectedPlanId) ?? plansDraft[0] ?? null,
    [plansDraft, selectedPlanId],
  );
  const selectedPreset = selectedPlan?.presetId ?? "executive_snapshot";
  const selectedPresetMeta = useMemo(
    () => data?.reportPresets.find((preset) => preset.id === selectedPreset) ?? null,
    [data?.reportPresets, selectedPreset],
  );

  const updateSelectedPlan = (updater: (plan: AnalyticsReportPlan) => AnalyticsReportPlan) => {
    setPlansDraft((current) => current.map((plan) => (plan.id === selectedPlanId ? updater(plan) : plan)));
  };

  const duplicateSelectedPlan = () => {
    const source = selectedPlan ?? plansDraft[0];
    const nextPlan: AnalyticsReportPlan = source
      ? {
          ...source,
          id: buildAnalyticsReportPlanId(`${source.id}-${Date.now().toString(36).slice(-4)}`),
          name: `${source.name} copy`,
          cadence: "manual",
          lastRunAt: null,
        }
      : {
          id: buildAnalyticsReportPlanId(`custom-${Date.now().toString(36).slice(-4)}`),
          name: "Custom report",
          description: "Custom cross-functional governance pack.",
          presetId: "executive_snapshot",
          format: "pdf",
          cadence: "manual",
          sections: ["summary", "highlights", "trends"],
          lastRunAt: null,
        };
    setPlansDraft((current) => [...current, nextPlan].slice(0, 12));
    setSelectedPlanId(nextPlan.id);
  };

  const saveBuilderMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/analytics/report-builder", {
        defaultPlanId: selectedPlan?.id ?? null,
        plans: plansDraft,
      });
      return (await response.json()) as AnalyticsReportBuilderConfig;
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(["/api/analytics/report-builder"], updated);
      setPlansDraft(updated.plans);
      setSelectedPlanId(updated.defaultPlanId ?? updated.plans[0]?.id ?? "");
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/report-builder"] });
    },
  });

  const markRunMutation = useMutation({
    mutationFn: async (planId: string) => {
      const response = await apiRequest("POST", `/api/analytics/report-builder/${planId}/run`, {});
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/analytics/report-builder"] });
    },
  });

  const handleExportPlan = async () => {
    if (!data || !selectedPlan) {
      return;
    }
    await markRunMutation.mutateAsync(selectedPlan.id);
    if (selectedPlan.format === "csv") {
      exportAnalyticsReportPlanCsv(data, selectedPlan);
      return;
    }
    await exportAnalyticsReportPlanPdf(data, selectedPlan);
  };

  if (isError || reportBuilderQuery.isError) {
    return (
      <div className="page-shell">
        <h1 className="text-2xl font-semibold tracking-tight">{pageCopy.analytics.title}</h1>
        <Alert variant="destructive">
          <AlertTitle>Analytics could not be loaded</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Reports and exports are unavailable until both live metrics and saved report plans load successfully.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void Promise.all([refetch(), reportBuilderQuery.refetch()])}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading || !data || reportBuilderQuery.isLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-[360px] rounded-xl" />
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell" data-testid="page-analytics-center">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{pageCopy.analytics.title}</h1>
            <Badge variant="outline">{pageCopy.analytics.badges?.generatedLive}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {pageCopy.analytics.description}
          </p>
        </div>
        <Card className="min-w-[320px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Saved report plan</CardTitle>
            <CardDescription>Choose a saved plan, then export the current live metrics.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {plansDraft.map((plan) => (
                <Button
                  key={plan.id}
                  type="button"
                  size="sm"
                  variant={selectedPlan?.id === plan.id ? "default" : "outline"}
                  onClick={() => setSelectedPlanId(plan.id)}
                >
                  {plan.name}
                </Button>
              ))}
            </div>
            {selectedPlan ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{selectedPlan.description || selectedPresetMeta?.description}</p>
                <p>
                  {selectedPlan.cadence} cadence • {selectedPlan.format.toUpperCase()} • {selectedPlan.sections.length} section
                  {selectedPlan.sections.length === 1 ? "" : "s"}
                </p>
                <p>
                  Last run: {selectedPlan.lastRunAt ? new Date(selectedPlan.lastRunAt).toLocaleString() : "Not exported yet"}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => void handleExportPlan()} disabled={!selectedPlan || markRunMutation.isPending}>
                <Download className="mr-2 h-4 w-4" />
                {selectedPlan?.format === "csv" ? "Export CSV" : "Export PDF"}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={duplicateSelectedPlan}>
                <FileDown className="mr-2 h-4 w-4" />
                Duplicate plan
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Open incidents"
          value={data.summary.openIncidents}
          description={`${data.summary.breachedIncidents} beyond containment target`}
          icon={Siren}
        />
        <MetricCard
          label="Control coverage"
          value={`${data.summary.controlCoverageRate}%`}
          description={`${data.summary.evidenceCoverageRate}% of systems have evidence on file`}
          icon={ShieldCheck}
        />
        <MetricCard
          label="Workflow queue"
          value={data.summary.pendingWorkflows}
          description={`${data.summary.approvalsClosed30d} approvals closed in the last 30 days`}
          icon={Workflow}
        />
        <MetricCard
          label="Trace coverage"
          value={`${data.summary.decisionTraceCoverageRate}%`}
          description={`${data.summary.highRiskSystems} systems are high risk or unacceptable`}
          icon={BarChart3}
        />
      </div>

      {selectedPlan ? (
        <Card>
          <CardHeader>
            <CardTitle>Report builder</CardTitle>
            <CardDescription>Edit the saved plan, persist it for the organization, and then export against live analytics data.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="space-y-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Plan name</span>
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedPlan.name}
                  onChange={(event) => updateSelectedPlan((plan) => ({ ...plan, name: event.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Description</span>
                <textarea
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={selectedPlan.description}
                  onChange={(event) => updateSelectedPlan((plan) => ({ ...plan, description: event.target.value }))}
                />
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Preset</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedPlan.presetId}
                    onChange={(event) =>
                      updateSelectedPlan((plan) => ({
                        ...plan,
                        presetId: event.target.value as AnalyticsReportPresetId,
                      }))
                    }
                  >
                    {data.reportPresets.map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Format</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedPlan.format}
                    onChange={(event) =>
                      updateSelectedPlan((plan) => ({
                        ...plan,
                        format: event.target.value as (typeof analyticsReportFormats)[number],
                      }))
                    }
                  >
                    {analyticsReportFormats.map((format) => (
                      <option key={format} value={format}>
                        {format.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm">
                  <span className="font-medium">Cadence</span>
                  <select
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={selectedPlan.cadence}
                    onChange={(event) =>
                      updateSelectedPlan((plan) => ({
                        ...plan,
                        cadence: event.target.value as (typeof analyticsReportCadences)[number],
                      }))
                    }
                  >
                    {analyticsReportCadences.map((cadence) => (
                      <option key={cadence} value={cadence}>
                        {cadence}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">Included sections</p>
                  <p className="text-xs text-muted-foreground">
                    The export will only include the selected sections in the chosen format.
                  </p>
                </div>
                <Badge variant="outline">{selectedPlan.sections.length} selected</Badge>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {analyticsReportSectionIds.map((sectionId) => (
                  <label key={sectionId} className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                    <input
                      type="checkbox"
                      checked={selectedPlan.sections.includes(sectionId)}
                      onChange={() =>
                        updateSelectedPlan((plan) => {
                          const next = plan.sections.includes(sectionId)
                            ? plan.sections.filter((entry) => entry !== sectionId)
                            : [...plan.sections, sectionId];
                          return { ...plan, sections: next.length > 0 ? next : plan.sections };
                        })
                      }
                    />
                    <span>{analyticsReportSectionLabels[sectionId]}</span>
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => saveBuilderMutation.mutate()} disabled={saveBuilderMutation.isPending}>
                  {saveBuilderMutation.isPending ? "Saving..." : "Save report plans"}
                </Button>
                <Button variant="outline" onClick={() => void handleExportPlan()} disabled={markRunMutation.isPending}>
                  {markRunMutation.isPending ? "Exporting..." : "Run selected plan"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
        <Card>
          <CardHeader>
            <CardTitle>Governance activity trend</CardTitle>
            <CardDescription>Weekly operational movement across incidents, approvals, and evidence uploads.</CardDescription>
          </CardHeader>
          <CardContent className="h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.trends}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis dataKey="period" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="incidentsCreated" stroke="#dc2626" strokeWidth={2} name="Incidents created" />
                <Line type="monotone" dataKey="incidentsResolved" stroke="#16a34a" strokeWidth={2} name="Incidents resolved" />
                <Line type="monotone" dataKey="approvalsSubmitted" stroke="#2563eb" strokeWidth={2} name="Approvals submitted" />
                <Line type="monotone" dataKey="approvalsClosed" stroke="#7c3aed" strokeWidth={2} name="Approvals closed" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operator highlights</CardTitle>
            <CardDescription>Use these talking points when briefing reviewers or leadership.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.highlights.map((highlight) => (
              <div key={highlight} className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                {highlight}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Incident severity mix</CardTitle>
            <CardDescription>Current distribution of incident severity across this tenant.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distributions.incidentSeverities}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#dc2626" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Workflow status mix</CardTitle>
            <CardDescription>Reviewer throughput and approval posture across the current queue.</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.distributions.workflowStatuses}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Risk mix</CardTitle>
            <CardDescription>Inventory distribution by system risk level.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.distributions.riskLevels.map((slice, index) => (
              <div key={slice.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{slice.label}</span>
                  <span className="font-medium">{slice.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, data.summary.totalSystems > 0 ? (slice.value / data.summary.totalSystems) * 100 : 0)}%`,
                      backgroundColor: distributionColors[index % distributionColors.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Control implementation mix</CardTitle>
            <CardDescription>Control status balance across verification and implementation work.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.distributions.controlStatuses.map((slice, index) => (
              <div key={slice.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{slice.label}</span>
                  <span className="font-medium">{slice.value}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, data.distributions.controlStatuses.reduce((sum, item) => sum + item.value, 0) > 0 ? (slice.value / data.distributions.controlStatuses.reduce((sum, item) => sum + item.value, 0)) * 100 : 0)}%`,
                      backgroundColor: distributionColors[index % distributionColors.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
