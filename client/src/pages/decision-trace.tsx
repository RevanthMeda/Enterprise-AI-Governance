import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck, GitBranch, Radar, ShieldAlert, Brain, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

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
  const [form, setForm] = useState(emptyForm);
  const [editingTraceId, setEditingTraceId] = useState<string | null>(null);
  const { toast } = useToast();

  const summaryQuery = useQuery<DecisionSummary>({ queryKey: ["/api/decision-audits/summary"] });
  const telemetryQuery = useQuery<TelemetrySummary>({ queryKey: ["/api/telemetry/summary"] });
  const chainQuery = useQuery<ChainStatus>({ queryKey: ["/api/audit-logs/verify-chain"] });
  const listQuery = useQuery<DecisionAudit[]>({ queryKey: ["/api/decision-audits"] });
  const versionsQuery = useQuery<DecisionAuditVersion[]>({
    queryKey: ["/api/decision-audits", editingTraceId, "versions"],
    enabled: Boolean(editingTraceId),
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/decision-audits/${editingTraceId}/versions`);
      return response.json();
    },
  });

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

  const recentTraces = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const editingTrace = useMemo(
    () => recentTraces.find((trace) => trace.id === editingTraceId) ?? null,
    [editingTraceId, recentTraces],
  );
  const hasNoTraces = (summaryQuery.data?.total ?? 0) === 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Decision Trace Center</h1>
          <p className="text-sm text-muted-foreground">
            Record context, model evidence, explainability, human override rationale, sealed audit state, and long-window outcomes.
          </p>
        </div>
        <Badge variant="outline" className="w-fit">AI Roll-Up diligence ready</Badge>
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

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">
              {editingTrace ? `Edit traced decision v${editingTrace.currentVersionNumber}` : "Record a traced decision"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title">
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
              </Field>
              <Field label="System ID">
                <input value={form.systemId} onChange={(event) => setForm((current) => ({ ...current, systemId: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
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
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Continuous monitoring summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MiniMetric label="Telemetry events (30d)" value={telemetryQuery.data?.total ?? 0} />
              <MiniMetric label="Critical alerts" value={telemetryQuery.data?.critical ?? 0} />
              <MiniMetric label="Drift alerts" value={telemetryQuery.data?.driftAlerts ?? 0} />
              <MiniMetric label="Bias flags" value={telemetryQuery.data?.biasAlerts ?? 0} />
              <MiniMetric label="Threshold breaches" value={telemetryQuery.data?.thresholdBreaches ?? 0} />
              <MiniMetric label="Escalated incidents" value={telemetryQuery.data?.escalatedIncidents ?? 0} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Immutable audit chain</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Version history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!editingTrace ? (
                <div className="rounded-md border border-dashed p-4 text-muted-foreground">
                  Select a decision trace to inspect its sealed versions.
                </div>
              ) : versionsQuery.isLoading ? (
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
                      <div className="text-xs text-muted-foreground">{new Date(version.createdAt).toLocaleString()}</div>
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent decision traces</CardTitle>
        </CardHeader>
        <CardContent>
          {listQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : recentTraces.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No traced decisions recorded yet.</div>
          ) : (
            <div className="space-y-3">
              {recentTraces.slice(0, 10).map((trace) => (
                <div key={trace.id} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold">{trace.title}</div>
                      <div className="text-xs text-muted-foreground">
                        System {trace.systemId} • Recorded by {trace.createdBy} • {new Date(trace.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">v{trace.currentVersionNumber}</Badge>
                      <Badge variant={trace.overrideDiff ? "default" : "secondary"}>{trace.overrideDiff ? "Human override logged" : "No override"}</Badge>
                      <Badge variant="outline">{trace.documentationStatus}</Badge>
                      {trace.outcomeSummary ? <Badge variant="outline">Outcome tracked</Badge> : null}
                      {trace.sealedRecordHash ? <Badge variant="outline">Sealed</Badge> : null}
                      {trace.lastVersionedAt ? <Badge variant="outline">Versioned edit</Badge> : null}
                      {trace.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={Boolean(trace.archivedAt)}
                      onClick={() => {
                        setEditingTraceId(trace.id);
                        setForm(formFromTrace(trace));
                      }}
                    >
                      {trace.archivedAt ? "Archived" : "Edit trace"}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-4 text-sm">
                    <InfoBlock label="Context" value={trace.decisionContext} />
                    <InfoBlock label="AI output" value={trace.aiOutput} />
                    <InfoBlock label="Human diff / rationale" value={trace.overrideDiff || trace.overrideRationale || "No human override captured."} />
                    <InfoBlock
                      label="Model evidence"
                      value={[
                        trace.modelName ? `Model: ${trace.modelName}` : null,
                        trace.modelVersion ? `Version: ${trace.modelVersion}` : null,
                        trace.confidenceScore !== null ? `Confidence: ${trace.confidenceScore}%` : null,
                        trace.uncertaintyScore !== null ? `Uncertainty: ${trace.uncertaintyScore}%` : null,
                        trace.inputSources?.length ? `Sources: ${trace.inputSources.join(", ")}` : null,
                        trace.decisionConstraints?.length ? `Constraints: ${trace.decisionConstraints.join(", ")}` : null,
                        trace.explainabilityFactors?.length ? `Factors: ${trace.explainabilityFactors.join(", ")}` : null,
                      ]
                        .filter(Boolean)
                        .join("\n") || "No model evidence captured."}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
    inputSources: trace.inputSources.join(", "),
    inputSnapshot: "{\n  \n}",
    decisionConstraints: trace.decisionConstraints.join(", "),
    confidenceScore: trace.confidenceScore !== null ? String(trace.confidenceScore) : "",
    uncertaintyScore: trace.uncertaintyScore !== null ? String(trace.uncertaintyScore) : "",
    explainabilityFactors: trace.explainabilityFactors.join(", "),
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
