import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, GitBranch, Radar, ShieldAlert, Brain, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/date-format";
import {
  formatLawPackLabel,
  formatLegalProfileLabel,
} from "@/lib/governance-display";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";
import { useToast } from "@/hooks/use-toast";
import type { AiSystem } from "@shared/schema";

type DecisionAudit = {
  id: string;
  title: string;
  systemId: string;
  workflowId: string | null;
  businessObjective: string | null;
  modelName: string | null;
  modelVersion: string | null;
  promptText: string | null;
  inputSources: string[];
  inputSnapshot: Record<string, unknown>;
  decisionConstraints: string[];
  confidenceScore: number | null;
  uncertaintyScore: number | null;
  explainabilityFactors: string[];
  documentationStatus: string;
  currentVersionNumber: number;
  lastVersionedAt: string | null;
  sealedRecordHash: string | null;
  decisionContext: string;
  aiOutput: string;
  humanOutput: string | null;
  overrideDiff: string | null;
  overrideRationale: string | null;
  outcomeSummary: string | null;
  createdBy: string;
  reviewedBy: string | null;
  archivedAt?: string | null;
  createdAt: string;
};

type DecisionAuditVersion = {
  id: string;
  versionNumber: number;
  snapshot: Record<string, unknown>;
  sealedRecordHash: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: string;
};

type DecisionSummary = {
  total: number;
  overrides: number;
  overrideRate: number;
  outcomesTracked: number;
  rationaleCaptureRate: number;
  documentationRate: number;
};

type TelemetrySummary = {
  total: number;
  critical: number;
  warnings: number;
  driftAlerts: number;
  biasAlerts: number;
  thresholdBreaches: number;
  escalatedIncidents: number;
  targetDetectionDays: number;
};

type ChainStatus = {
  ok: boolean;
  verified: boolean;
  total: number;
  latestHash?: string | null;
  brokenAt?: string;
};

const emptyForm = {
  title: "",
  systemId: "",
  workflowId: "",
  businessObjective: "",
  modelName: "",
  modelVersion: "",
  promptText: "",
  inputSources: "",
  inputSnapshot: "{\n  \n}",
  decisionConstraints: "",
  confidenceScore: "",
  uncertaintyScore: "",
  explainabilityFactors: "",
  documentationStatus: "sealed",
  decisionContext: "",
  aiOutput: "",
  humanOutput: "",
  overrideRationale: "",
  outcomeSummary: "",
  versionReason: "",
};

export default function DecisionTracePage() {
  const pageCopy = usePageCopy();
  const [form, setForm] = useState(emptyForm);
  const [editingTraceId, setEditingTraceId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const { toast } = useToast();

  const summaryQuery = useQuery<DecisionSummary>({
    queryKey: ["/api/decision-audits/summary"],
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
  const telemetryQuery = useQuery<TelemetrySummary>({
    queryKey: ["/api/telemetry/summary"],
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
  const chainQuery = useQuery<ChainStatus>({
    queryKey: ["/api/audit-logs/verify-chain"],
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });
  const listQuery = useQuery<DecisionAudit[]>({
    queryKey: ["/api/decision-audits"],
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
  const recentTraces = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const activeTraceId = editingTraceId ?? selectedTraceId ?? recentTraces[0]?.id ?? null;
  const systemsQuery = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
  const versionsQuery = useQuery<DecisionAuditVersion[]>({
    queryKey: ["/api/decision-audits", activeTraceId, "versions"],
    enabled: Boolean(activeTraceId),
    refetchInterval: activeTraceId ? 15_000 : false,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/decision-audits/${activeTraceId}/versions`);
      return response.json();
    },
  });
  const systemNameById = useMemo(
    () => new Map((systemsQuery.data ?? []).map((system) => [system.id, system.name])),
    [systemsQuery.data],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildDecisionTracePayload(form);
      const res = editingTraceId
        ? await apiRequest("PATCH", `/api/decision-audits/${editingTraceId}`, payload)
        : await apiRequest("POST", "/api/decision-audits", payload);
      return res.json();
    },
    onSuccess: async () => {
      setEditingTraceId(null);
      setForm(emptyForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits/summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/audit-logs/verify-chain"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits", editingTraceId, "versions"] }),
      ]);
      toast({ title: editingTraceId ? "Decision trace updated with version snapshot" : "Decision trace recorded" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save decision trace", description: error.message, variant: "destructive" });
    },
  });

  const editingTrace = useMemo(
    () => recentTraces.find((trace) => trace.id === editingTraceId) ?? null,
    [editingTraceId, recentTraces],
  );
  const selectedTrace =
    recentTraces.find((trace) => trace.id === selectedTraceId) ??
    recentTraces[0] ??
    null;
  const hasNoTraces = (summaryQuery.data?.total ?? 0) === 0;

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.decisionTrace.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.decisionTrace.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="w-fit">{pageCopy.decisionTrace.badges?.traces} {summaryQuery.data?.total ?? 0}</Badge>
          <Badge variant={hasNoTraces ? "outline" : chainQuery.data?.verified ? "default" : "destructive"} className="w-fit">
            {hasNoTraces ? "Chain pending" : chainQuery.data?.verified ? "Chain verified" : "Chain attention"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <MetricCard title="Traced decisions" value={summaryQuery.data?.total} icon={ShieldCheck} />
        <MetricCard title="Human override rate" value={`${summaryQuery.data?.overrideRate ?? 0}%`} icon={GitBranch} />
        <MetricCard title="Rationale capture" value={`${summaryQuery.data?.rationaleCaptureRate ?? 0}%`} icon={Brain} />
        <MetricCard title="Documentation rate" value={`${summaryQuery.data?.documentationRate ?? 0}%`} icon={Database} />
        <MetricCard title="Outcome windows tracked" value={summaryQuery.data?.outcomesTracked} icon={Radar} />
        <MetricCard
          title="Audit chain"
          value={
            hasNoTraces
              ? "Awaiting first trace"
              : chainQuery.data?.verified
                ? "Verified"
                : chainQuery.isLoading
                  ? "Checking"
                  : "Attention needed"
          }
          icon={ShieldAlert}
        />
      </div>

      {hasNoTraces ? (
        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            No traced decisions have been recorded yet. This is expected for a new organization. Record your first traced decision to start documentation, sealing, and outcome tracking.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {editingTrace ? `Edit trace v${editingTrace.currentVersionNumber}` : "Record new trace"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <details className="rounded-lg border bg-muted/20 p-3" open={Boolean(editingTrace) || hasNoTraces}>
            <summary className="cursor-pointer list-none text-sm font-medium">
              {editingTrace ? "Trace workspace" : "Open trace workspace"}
            </summary>
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Title">
                  <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="System ID">
                  <Select value={form.systemId} onValueChange={(value) => setForm((current) => ({ ...current, systemId: value }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a registered system" />
                    </SelectTrigger>
                    <SelectContent>
                      {(systemsQuery.data ?? []).map((system) => (
                        <SelectItem key={system.id} value={system.id}>
                          {system.name}
                        </SelectItem>
                      ))}
                      {form.systemId && !(systemsQuery.data ?? []).some((system) => system.id === form.systemId) ? (
                        <SelectItem value={form.systemId}>{form.systemId}</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Workflow ID">
                  <input value={form.workflowId} onChange={(event) => setForm((current) => ({ ...current, workflowId: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Business objective">
                  <input value={form.businessObjective} onChange={(event) => setForm((current) => ({ ...current, businessObjective: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Model name">
                  <input value={form.modelName} onChange={(event) => setForm((current) => ({ ...current, modelName: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Model version">
                  <input value={form.modelVersion} onChange={(event) => setForm((current) => ({ ...current, modelVersion: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Confidence score">
                  <input value={form.confidenceScore} onChange={(event) => setForm((current) => ({ ...current, confidenceScore: event.target.value }))} type="number" min="0" max="100" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Uncertainty score">
                  <input value={form.uncertaintyScore} onChange={(event) => setForm((current) => ({ ...current, uncertaintyScore: event.target.value }))} type="number" min="0" max="100" className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Prompt or query">
                  <textarea value={form.promptText} onChange={(event) => setForm((current) => ({ ...current, promptText: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Decision context">
                  <textarea value={form.decisionContext} onChange={(event) => setForm((current) => ({ ...current, decisionContext: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Input sources (comma separated)">
                  <textarea value={form.inputSources} onChange={(event) => setForm((current) => ({ ...current, inputSources: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="CRM export, pricing sheet v4, customer support transcript" />
                </Field>
                <Field label="Decision constraints (comma separated)">
                  <textarea value={form.decisionConstraints} onChange={(event) => setForm((current) => ({ ...current, decisionConstraints: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="No pricing below floor, EU-only processing, no medical claims" />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="Explainability factors (comma separated)">
                  <textarea value={form.explainabilityFactors} onChange={(event) => setForm((current) => ({ ...current, explainabilityFactors: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" placeholder="Margin, churn risk, recent escalation history" />
                </Field>
                <Field label="Input snapshot (JSON)">
                  <textarea value={form.inputSnapshot} onChange={(event) => setForm((current) => ({ ...current, inputSnapshot: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs" />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <Field label="AI output">
                  <textarea value={form.aiOutput} onChange={(event) => setForm((current) => ({ ...current, aiOutput: event.target.value }))} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Human-reviewed output">
                  <textarea value={form.humanOutput} onChange={(event) => setForm((current) => ({ ...current, humanOutput: event.target.value }))} className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                <Field label="Override rationale">
                  <textarea value={form.overrideRationale} onChange={(event) => setForm((current) => ({ ...current, overrideRationale: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" />
                </Field>
                <Field label="Documentation status">
                  <Select value={form.documentationStatus} onValueChange={(value) => setForm((current) => ({ ...current, documentationStatus: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="reviewed">Reviewed</SelectItem>
                      <SelectItem value="sealed">Sealed</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Outcome summary">
                <textarea value={form.outcomeSummary} onChange={(event) => setForm((current) => ({ ...current, outcomeSummary: event.target.value }))} className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" />
              </Field>

              {editingTrace ? (
                <Field label="Version reason">
                  <textarea
                    value={form.versionReason}
                    onChange={(event) => setForm((current) => ({ ...current, versionReason: event.target.value }))}
                    className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder="Why is this sealed trace being revised?"
                  />
                </Field>
              ) : null}

              <div className="flex justify-end gap-3">
                {editingTrace ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingTraceId(null);
                      setForm(emptyForm);
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !form.title || !form.systemId || !form.decisionContext || !form.aiOutput}>
                  {saveMutation.isPending ? "Saving..." : editingTrace ? "Save versioned edit" : "Record decision trace"}
                </Button>
              </div>
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-2">
          {listQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : recentTraces.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No traced decisions recorded yet.</div>
          ) : (
            <div className="rounded-lg border bg-muted/10 p-2 xl:max-h-[calc(100vh-24rem)] xl:overflow-y-auto">
              <div className="space-y-2">
                {recentTraces.slice(0, 20).map((trace) => (
                  <button
                    key={trace.id}
                    type="button"
                    onClick={() => setSelectedTraceId(trace.id)}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      selectedTrace?.id === trace.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{trace.title}</div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {formatDateTime(trace.createdAt)} • {trace.createdBy}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Badge variant="outline">v{trace.currentVersionNumber}</Badge>
                        <Badge variant="outline">{trace.documentationStatus}</Badge>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {trace.overrideDiff ? <Badge variant="secondary">Human override</Badge> : null}
                      {trace.outcomeSummary ? <Badge variant="outline">Outcome tracked</Badge> : null}
                      {trace.sealedRecordHash ? <Badge variant="outline">Sealed</Badge> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {selectedTrace ? (
          <div className="space-y-6 xl:max-h-[calc(100vh-24rem)] xl:overflow-y-auto xl:pr-1">
            <div className="rounded-lg border p-4">
              <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-lg font-semibold">{selectedTrace.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    System {systemNameById.get(selectedTrace.systemId) ?? selectedTrace.systemId} • Recorded by {selectedTrace.createdBy} • {formatDateTime(selectedTrace.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">v{selectedTrace.currentVersionNumber}</Badge>
                  <Badge variant={selectedTrace.overrideDiff ? "default" : "secondary"}>{selectedTrace.overrideDiff ? "Human override logged" : "No override"}</Badge>
                  <Badge variant="outline">{selectedTrace.documentationStatus}</Badge>
                  {selectedTrace.outcomeSummary ? <Badge variant="outline">Outcome tracked</Badge> : null}
                  {selectedTrace.sealedRecordHash ? <Badge variant="outline">Sealed</Badge> : null}
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={Boolean(selectedTrace.archivedAt)}
                  onClick={() => {
                    setSelectedTraceId(selectedTrace.id);
                    setEditingTraceId(selectedTrace.id);
                    setForm(formFromTrace(selectedTrace));
                  }}
                >
                  {selectedTrace.archivedAt ? "Archived" : "Edit trace"}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                <TraceMeta label="Model" value={selectedTrace.modelName || "Not recorded"} />
                <TraceMeta label="Model version" value={selectedTrace.modelVersion || "Not recorded"} />
                <TraceMeta label="Confidence" value={selectedTrace.confidenceScore !== null ? `${selectedTrace.confidenceScore}%` : "Not recorded"} />
                <TraceMeta label="Uncertainty" value={selectedTrace.uncertaintyScore !== null ? `${selectedTrace.uncertaintyScore}%` : "Not recorded"} />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-4 text-sm">
                <InfoBlock label="Context" value={selectedTrace.decisionContext} />
                <InfoBlock label="AI output" value={selectedTrace.aiOutput} />
                <InfoBlock label="Human diff / rationale" value={selectedTrace.overrideDiff || selectedTrace.overrideRationale || "No human override captured."} />
                <InfoBlock
                  label="Model evidence"
                  value={[
                    selectedTrace.inputSources?.length ? `Sources: ${formatTraceList(selectedTrace.inputSources)}` : null,
                    selectedTrace.decisionConstraints?.length ? `Constraints: ${formatTraceList(selectedTrace.decisionConstraints)}` : null,
                    selectedTrace.explainabilityFactors?.length ? `Factors: ${formatTraceList(selectedTrace.explainabilityFactors)}` : null,
                    selectedTrace.businessObjective ? `Objective: ${selectedTrace.businessObjective}` : null,
                  ]
                    .filter(Boolean)
                    .join("\n") || "No model evidence captured."}
                />
              </div>

              {(() => {
                const governance =
                  selectedTrace.inputSnapshot?.governance &&
                  typeof selectedTrace.inputSnapshot.governance === "object" &&
                  !Array.isArray(selectedTrace.inputSnapshot.governance)
                    ? (selectedTrace.inputSnapshot.governance as Record<string, unknown>)
                    : null;
                if (!governance) {
                  return null;
                }

                const legalProfileApplied =
                  typeof governance.legalProfileApplied === "string" ? governance.legalProfileApplied : null;
                const lawPackIdsApplied = Array.isArray(governance.lawPackIdsApplied)
                  ? governance.lawPackIdsApplied.filter((entry): entry is string => typeof entry === "string")
                  : [];
                const lawPackSources = Array.isArray(governance.lawPackSources)
                  ? governance.lawPackSources.filter((entry): entry is string => typeof entry === "string")
                  : [];
                return (
                  <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                    <div className="text-sm font-medium">Governance snapshot</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {legalProfileApplied ? (
                        <Badge variant="outline">{formatLegalProfileLabel(legalProfileApplied)}</Badge>
                      ) : null}
                      {lawPackIdsApplied.map((packId) => (
                        <Badge key={packId} variant="secondary">
                          {formatLawPackLabel(packId)}
                        </Badge>
                      ))}
                    </div>
                    {lawPackSources.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Sources: {lawPackSources.join(", ")}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Runtime context summary</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <MiniMetric label="Telemetry events (30d)" value={telemetryQuery.data?.total ?? 0} />
                  <MiniMetric label="Critical alerts" value={telemetryQuery.data?.critical ?? 0} />
                  <MiniMetric label="Drift alerts" value={telemetryQuery.data?.driftAlerts ?? 0} />
                  <MiniMetric label="Bias flags" value={telemetryQuery.data?.biasAlerts ?? 0} />
                  <MiniMetric label="Threshold breaches" value={telemetryQuery.data?.thresholdBreaches ?? 0} />
                  <MiniMetric label="Escalated runtime events" value={telemetryQuery.data?.escalatedIncidents ?? 0} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-semibold">Audit chain status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {chainQuery.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <div className="font-medium">Status</div>
                        <div className="text-muted-foreground">
                          {hasNoTraces
                            ? "Hash chain verification begins after your first traced decision is recorded."
                            : chainQuery.data?.verified
                              ? "Hash chain verified across current organization audit records."
                              : "Hash chain verification requires attention."}
                        </div>
                      </div>
                      <div className="rounded-md border bg-muted/30 p-3">
                        <div className="font-medium">Latest hash</div>
                        <div className="break-all font-mono text-xs text-muted-foreground">{chainQuery.data?.latestHash ?? "No chain yet"}</div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-semibold">Version history</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {versionsQuery.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (versionsQuery.data?.length ?? 0) === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-muted-foreground">
                    No prior versions captured for this trace.
                  </div>
                ) : (
                  versionsQuery.data!.map((version) => (
                    <div key={version.id} className="rounded-md border bg-muted/20 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">v{version.versionNumber}</div>
                        <div className="text-xs text-muted-foreground">{formatDateTime(version.createdAt)}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Captured by {version.createdBy}
                        {version.reason ? ` • ${version.reason}` : ""}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        Status {(version.snapshot.documentationStatus as string | undefined) ?? "unknown"} • Hash {version.sealedRecordHash ? version.sealedRecordHash.slice(0, 12) : "n/a"}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildPayload(form: typeof emptyForm) {
  let inputSnapshot: Record<string, unknown> = {};
  const trimmedSnapshot = form.inputSnapshot.trim();
  if (trimmedSnapshot) {
    try {
      const parsed = JSON.parse(trimmedSnapshot);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Input snapshot must be a JSON object");
      }
      inputSnapshot = parsed as Record<string, unknown>;
    } catch {
      throw new Error("Input snapshot must be valid JSON");
    }
  }

  return {
    title: form.title,
    systemId: form.systemId,
    workflowId: form.workflowId || null,
    businessObjective: form.businessObjective || null,
    modelName: form.modelName || null,
    modelVersion: form.modelVersion || null,
    promptText: form.promptText || null,
    inputSources: parseList(form.inputSources),
    inputSnapshot,
    decisionConstraints: parseList(form.decisionConstraints),
    confidenceScore: form.confidenceScore ? Number(form.confidenceScore) : null,
    uncertaintyScore: form.uncertaintyScore ? Number(form.uncertaintyScore) : null,
    explainabilityFactors: parseList(form.explainabilityFactors),
    documentationStatus: form.documentationStatus,
    decisionContext: form.decisionContext,
    aiOutput: form.aiOutput,
    humanOutput: form.humanOutput || null,
    overrideRationale: form.overrideRationale || null,
    outcomeSummary: form.outcomeSummary || null,
  };
}

function parseList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function MetricCard({ title, value, icon: Icon }: { title: string; value: string | number | undefined; icon: typeof ShieldCheck }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value ?? 0}</div>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function TraceMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function buildDecisionTracePayload(form: typeof emptyForm) {
  return {
    ...buildPayload(form),
    versionReason: form.versionReason.trim() || undefined,
  };
}

function formFromTrace(trace: DecisionAudit) {
  return {
    title: trace.title,
    systemId: trace.systemId,
    workflowId: trace.workflowId ?? "",
    businessObjective: trace.businessObjective ?? "",
    modelName: trace.modelName ?? "",
    modelVersion: trace.modelVersion ?? "",
    promptText: trace.promptText ?? "",
    inputSources: formatTraceList(trace.inputSources),
    inputSnapshot: "{\n  \n}",
    decisionConstraints: formatTraceList(trace.decisionConstraints),
    confidenceScore: trace.confidenceScore !== null ? String(trace.confidenceScore) : "",
    uncertaintyScore: trace.uncertaintyScore !== null ? String(trace.uncertaintyScore) : "",
    explainabilityFactors: formatTraceList(trace.explainabilityFactors),
    documentationStatus: trace.documentationStatus,
    decisionContext: trace.decisionContext,
    aiOutput: trace.aiOutput,
    humanOutput: trace.humanOutput ?? "",
    overrideRationale: trace.overrideRationale ?? "",
    outcomeSummary: trace.outcomeSummary ?? "",
    versionReason: "",
  };
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/30 p-3">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 line-clamp-6 whitespace-pre-wrap">{value}</div>
    </div>
  );
}

function formatTraceList(values: unknown[] | null | undefined) {
  return (values ?? [])
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }

      if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const preferred = [record.label, record.name, record.title, record.sourceType, record.id].find(
          (entry) => typeof entry === "string" && entry.trim().length > 0,
        );
        if (typeof preferred === "string") {
          return preferred;
        }

        const detailParts = [
          record.type,
          record.system,
          record.version,
          record.source,
          record.region,
          record.channel,
        ].filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
        if (detailParts.length > 0) {
          return detailParts.join(" • ");
        }

        const flattened = Object.entries(record)
          .filter(([, entry]) => ["string", "number", "boolean"].includes(typeof entry))
          .slice(0, 4)
          .map(([key, entry]) => `${key}: ${String(entry)}`);
        if (flattened.length > 0) {
          return flattened.join(" • ");
        }

        return "Structured source";
      }

      return String(value);
    })
    .filter((entry) => entry.trim().length > 0)
    .join(", ");
}
