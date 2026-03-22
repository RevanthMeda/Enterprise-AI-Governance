import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, Siren, Clock3, Brain } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCapabilityLabel,
  formatCapabilityProfileLabel,
  formatGovernanceCriticVerdict,
  formatGovernanceReasonCode,
  formatGovernancePolicyCategoryLabel,
  formatLawPackLabel,
  formatLegalProfileLabel,
  formatStrictnessLabel,
} from "@/lib/governance-display";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/date-format";
import type { AiSystem } from "@shared/schema";

type IncidentPlaybook = {
  targetContainmentHours?: number;
  steps?: string[];
  decision?: string;
  decisionSummary?: string;
  thresholdBreaches?: string[];
  restrictedPromptMatches?: string[];
  reasonCodes?: string[];
  legalProfileApplied?: string;
  lawPackIdsApplied?: string[];
  capabilityProfileApplied?: string;
  allowedCapabilitiesApplied?: string[];
  strictnessApplied?: string;
  policyCategories?: string[];
  requestedCapabilities?: string[];
  outOfScopeCapabilities?: string[];
  telemetryEventId?: string;
  correlationId?: string | null;
  rulesEngine?: Record<string, unknown>;
  governanceCritic?: Record<string, unknown>;
  sourceAttributionVerifier?: Record<string, unknown>;
  factProvenanceVerifier?: Record<string, unknown>;
  actionConfirmationVerifier?: Record<string, unknown>;
  reviewRelease?: Record<string, unknown>;
  shadowPolicy?: Record<string, unknown>;
};

type Incident = {
  id: string;
  systemId?: string | null;
  title: string;
  category: string;
  severity: string;
  status: string;
  description: string;
  rootCause: string | null;
  postIncidentReview: Record<string, unknown>;
  affectedDecisionTraceIds: string[];
  regulatoryNotifications: Array<{
    authority: string;
    status: string;
    notes?: string | null;
    completedAt?: string | null;
  }>;
  owner: string | null;
  escalatedTo: string | null;
  dueAt: string | null;
  detectedAt: string;
  updatedAt?: string | null;
  resolvedAt: string | null;
  postmortemCompletedAt: string | null;
  playbook: IncidentPlaybook;
};

type IncidentSummary = {
  total: number;
  open: number;
  highSeverity: number;
  breached: number;
  postmortemPending: number;
};

const initialForm = {
  title: "",
  category: "bias",
  severity: "high",
  systemId: "",
  description: "",
  owner: "",
  escalatedTo: "",
};

export default function IncidentsPage() {
  const [form, setForm] = useState(initialForm);
  const [queueScope, setQueueScope] = useState<"active" | "all" | "resolved">("active");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Record<string, { rootCause: string; reviewSummary: string; affectedDecisionTraceIds: string; regulatoryNotifications: string }>>({});
  const [releaseDrafts, setReleaseDrafts] = useState<Record<string, { reviewerNote: string; actionName: string; toolName: string; receiptId: string; details: string }>>({});
  const summaryQuery = useQuery<IncidentSummary>({
    queryKey: ["/api/incidents/summary"],
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
  const listQuery = useQuery<Incident[]>({
    queryKey: ["/api/incidents"],
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
  const systemsQuery = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/incidents", {
        title: form.title,
        category: form.category,
        severity: form.severity,
        systemId: form.systemId || null,
        description: form.description,
        owner: form.owner || null,
        escalatedTo: form.escalatedTo || null,
      });
      return res.json();
    },
    onSuccess: async () => {
      setForm(initialForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/incidents/summary"] }),
      ]);
    },
  });

  const updateIncidentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await apiRequest("PATCH", `/api/incidents/${id}`, payload);
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/incidents/summary"] }),
      ]);
    },
  });

  const reviewerReleaseMutation = useMutation({
    mutationFn: async ({ telemetryEventId, payload }: { telemetryEventId: string; payload: Record<string, unknown> }) => {
      const res = await apiRequest("POST", `/api/telemetry/events/${telemetryEventId}/reviewer-release`, payload);
      return res.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/incidents"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/incidents/summary"] }),
      ]);
    },
  });

  const incidents = [...(listQuery.data ?? [])].sort((a, b) => {
    const statusOrder: Record<string, number> = { open: 0, contained: 1, resolved: 2, postmortem: 3 };
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const statusDelta = (statusOrder[a.status] ?? 99) - (statusOrder[b.status] ?? 99);
    if (statusDelta !== 0) return statusDelta;
    const severityDelta = (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99);
    if (severityDelta !== 0) return severityDelta;
    return new Date(b.updatedAt ?? b.detectedAt).getTime() - new Date(a.updatedAt ?? a.detectedAt).getTime();
  });

  const filteredIncidents = incidents.filter((incident) => {
    if (queueScope === "active") return incident.status === "open" || incident.status === "contained";
    if (queueScope === "resolved") return incident.status === "resolved" || incident.status === "postmortem";
    return true;
  });

  const selectedIncident =
    filteredIncidents.find((incident) => incident.id === selectedIncidentId) ??
    incidents.find((incident) => incident.id === selectedIncidentId) ??
    filteredIncidents[0] ??
    incidents[0] ??
    null;
  const systemNameById = new Map((systemsQuery.data ?? []).map((system) => [system.id, system.name]));
  const getSystemLabel = (systemId?: string | null) => {
    if (!systemId) {
      return "Not linked";
    }

    return systemNameById.get(systemId) ?? systemId;
  };

  const selectedIncidentEvidence = getIncidentGovernanceEvidence(selectedIncident?.playbook);
  const selectedReleaseDraft = selectedIncident ? releaseDrafts[selectedIncident.id] ?? {
    reviewerNote: "",
    actionName: "",
    toolName: "",
    receiptId: "",
    details: "",
  } : null;

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">AI Incident Response</h1>
          <p className="text-sm text-muted-foreground">
            Triage privacy, security, safety, bias, and reliability events with clear containment targets and ownership.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Open {summaryQuery.data?.open ?? 0}</Badge>
          <Badge variant="outline">High severity {summaryQuery.data?.highSeverity ?? 0}</Badge>
          <Badge variant={summaryQuery.data && summaryQuery.data.breached > 0 ? "destructive" : "outline"}>
            SLA breached {summaryQuery.data?.breached ?? 0}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Total incidents" value={summaryQuery.data?.total ?? 0} icon={AlertTriangle} />
        <Metric title="Open" value={summaryQuery.data?.open ?? 0} icon={Siren} />
        <Metric title="High severity" value={summaryQuery.data?.highSeverity ?? 0} icon={ShieldAlert} />
        <Metric title="SLA breached" value={summaryQuery.data?.breached ?? 0} icon={Clock3} />
        <Metric title="Postmortems pending" value={summaryQuery.data?.postmortemPending ?? 0} icon={Clock3} />
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Incident intake</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Open a manual case when an event did not originate from runtime telemetry or needs separate tracking.
            </p>
            <details className="rounded-lg border bg-muted/20 p-3">
              <summary className="cursor-pointer list-none text-sm font-medium">
                Open incident record
              </summary>
              <div className="mt-4 space-y-3">
                <Field label="Title">
                  <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
                </Field>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Category">
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}>
                      <option value="bias">Bias</option>
                      <option value="security">Security</option>
                      <option value="privacy">Privacy</option>
                      <option value="reliability">Reliability</option>
                      <option value="compliance">Compliance</option>
                      <option value="safety">Safety</option>
                    </select>
                  </Field>
                  <Field label="Severity">
                    <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.severity} onChange={(event) => setForm((current) => ({ ...current, severity: event.target.value }))}>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </Field>
                  <Field label="System ID">
                    <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.systemId} onChange={(event) => setForm((current) => ({ ...current, systemId: event.target.value }))} />
                  </Field>
                  <Field label="Owner">
                    <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.owner} onChange={(event) => setForm((current) => ({ ...current, owner: event.target.value }))} />
                  </Field>
                </div>
                <Field label="Escalated to">
                  <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.escalatedTo} onChange={(event) => setForm((current) => ({ ...current, escalatedTo: event.target.value }))} />
                </Field>
                <Field label="Description">
                  <textarea className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
                </Field>
                <div className="flex justify-end">
                  <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.title || !form.description}>
                    {createMutation.isPending ? "Creating..." : "Open incident"}
                  </Button>
                </div>
              </div>
            </details>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle className="text-sm font-semibold">Active incident queue</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button variant={queueScope === "active" ? "default" : "outline"} size="sm" onClick={() => setQueueScope("active")}>
                  Active
                </Button>
                <Button variant={queueScope === "all" ? "default" : "outline"} size="sm" onClick={() => setQueueScope("all")}>
                  All
                </Button>
                <Button variant={queueScope === "resolved" ? "default" : "outline"} size="sm" onClick={() => setQueueScope("resolved")}>
                  Resolved
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-hidden">
            {listQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : incidents.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No incidents recorded.</div>
            ) : (
              <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="space-y-2 rounded-lg border bg-muted/10 p-2 xl:max-h-[calc(100vh-21rem)] xl:overflow-y-auto">
                  {filteredIncidents.length === 0 ? (
                    <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                      No incidents match this queue view.
                    </div>
                  ) : (
                    filteredIncidents.map((incident) => (
                      <button
                        key={incident.id}
                        type="button"
                        onClick={() => setSelectedIncidentId(incident.id)}
                        className={`w-full rounded-lg border p-3 text-left transition-colors ${
                          selectedIncident?.id === incident.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">{incident.title}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {incident.category} • detected {formatDateTime(incident.detectedAt)}
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Badge variant={incident.severity === "critical" ? "destructive" : "default"}>{incident.severity}</Badge>
                            <Badge variant="outline">{incident.status}</Badge>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{incident.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {incident.systemId ? <Badge variant="outline">{getSystemLabel(incident.systemId)}</Badge> : null}
                          {incident.playbook?.decision ? <Badge variant="secondary">{incident.playbook.decision}</Badge> : null}
                          {incident.dueAt ? <Badge variant="outline">Contain by {formatDateTime(incident.dueAt)}</Badge> : null}
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {selectedIncident ? (
                  <div className="rounded-lg border p-4 xl:max-h-[calc(100vh-21rem)] xl:overflow-y-auto">
                    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-lg font-semibold">{selectedIncident.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedIncident.category} • detected {formatDateTime(selectedIncident.detectedAt)}
                          {selectedIncident.updatedAt && selectedIncident.updatedAt !== selectedIncident.detectedAt
                            ? ` • latest activity ${formatDateTime(selectedIncident.updatedAt)}`
                            : ""}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={selectedIncident.severity === "critical" ? "destructive" : "default"}>{selectedIncident.severity}</Badge>
                        <Badge variant="outline">{selectedIncident.status}</Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <MetaBlock label="System" value={getSystemLabel(selectedIncident.systemId)} mono={!systemNameById.has(selectedIncident.systemId ?? "")} />
                      <MetaBlock label="Owner" value={selectedIncident.owner ?? "Unassigned"} />
                      <MetaBlock label="Escalated to" value={selectedIncident.escalatedTo ?? "Not set"} />
                      <MetaBlock label="Containment target" value={selectedIncident.dueAt ? formatDateTime(selectedIncident.dueAt) : "Not set"} />
                    </div>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                      <div className="space-y-4">
                        <SectionBlock title="Incident summary">
                          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{selectedIncident.description}</p>
                        </SectionBlock>

                        {selectedIncidentEvidence ? (
                          <SectionBlock title="Governance evidence">
                            <div className="space-y-4">
                              {selectedIncidentEvidence.decisionSummary ? (
                                <p className="text-sm text-muted-foreground">{selectedIncidentEvidence.decisionSummary}</p>
                              ) : null}

                              <div className="grid gap-3 md:grid-cols-2">
                                <MetaBlock label="Policy decision" value={selectedIncidentEvidence.decision ?? "Not recorded"} />
                                <MetaBlock
                                  label="Legal profile"
                                  value={formatLegalProfileLabel(selectedIncidentEvidence.legalProfileApplied)}
                                />
                                <MetaBlock
                                  label="Capability profile"
                                  value={formatCapabilityProfileLabel(selectedIncidentEvidence.capabilityProfileApplied)}
                                />
                                <MetaBlock
                                  label="Strictness"
                                  value={formatStrictnessLabel(selectedIncidentEvidence.strictnessApplied)}
                                />
                                <MetaBlock
                                  label="Telemetry event"
                                  value={selectedIncidentEvidence.telemetryEventId ?? "Not recorded"}
                                  mono
                                />
                                <MetaBlock
                                  label="Correlation ID"
                                  value={selectedIncidentEvidence.correlationId ?? "Not recorded"}
                                  mono
                                />
                              </div>

                              {selectedIncidentEvidence.rulesEngine || selectedIncidentEvidence.governanceCritic ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="rounded-lg border bg-background p-3">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Rules engine</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {typeof selectedIncidentEvidence.rulesEngine?.decision === "string" ? (
                                        <Badge variant="outline">{selectedIncidentEvidence.rulesEngine.decision}</Badge>
                                      ) : null}
                                      {typeof selectedIncidentEvidence.rulesEngine?.blocked === "boolean" ? (
                                        <Badge variant={selectedIncidentEvidence.rulesEngine.blocked ? "destructive" : "secondary"}>
                                          {selectedIncidentEvidence.rulesEngine.blocked ? "blocked" : "release path"}
                                        </Badge>
                                      ) : null}
                                    </div>
                                    {typeof selectedIncidentEvidence.rulesEngine?.decisionSummary === "string" ? (
                                      <p className="mt-3 text-sm text-muted-foreground">{selectedIncidentEvidence.rulesEngine.decisionSummary}</p>
                                    ) : (
                                      <p className="mt-3 text-sm text-muted-foreground">No separate rules-engine snapshot recorded.</p>
                                    )}
                                  </div>
                                  <div className="rounded-lg border bg-background p-3">
                                    <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                      <Brain className="h-3.5 w-3.5" />
                                      AI governance critic
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.governanceCritic?.enabled ? (
                                        <Badge variant="outline">
                                          {formatGovernanceCriticVerdict(
                                            typeof selectedIncidentEvidence.governanceCritic.verdict === "string"
                                              ? selectedIncidentEvidence.governanceCritic.verdict
                                              : null,
                                          )}
                                        </Badge>
                                      ) : (
                                        <Badge variant="secondary">Not run</Badge>
                                      )}
                                      {typeof selectedIncidentEvidence.governanceCritic?.recommendedDecision === "string" ? (
                                        <Badge variant="outline">{selectedIncidentEvidence.governanceCritic.recommendedDecision}</Badge>
                                      ) : null}
                                      {selectedIncidentEvidence.governanceCritic?.appliedDecisionChange ? (
                                        <Badge variant="secondary">Decision changed</Badge>
                                      ) : null}
                                    </div>
                                    <p className="mt-3 text-sm text-muted-foreground">
                                      {typeof selectedIncidentEvidence.governanceCritic?.rationale === "string"
                                        ? selectedIncidentEvidence.governanceCritic.rationale
                                        : "No critic rationale recorded for this incident."}
                                    </p>
                                  </div>
                                </div>
                              ) : null}

                              {selectedIncidentEvidence.sourceAttributionVerifier ||
                              selectedIncidentEvidence.factProvenanceVerifier ||
                              selectedIncidentEvidence.actionConfirmationVerifier ||
                              selectedIncidentEvidence.shadowPolicy ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div className="rounded-lg border bg-background p-3">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Source and fact verification</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.sourceAttributionVerifier?.requiresVerification ? (
                                        <Badge variant="destructive">
                                          {selectedIncidentEvidence.sourceAttributionVerifier.citationBackedRequired
                                            ? "citation-backed mode required"
                                            : "authority verification required"}
                                        </Badge>
                                      ) : null}
                                      {selectedIncidentEvidence.factProvenanceVerifier?.requiresReview ? (
                                        <Badge variant="destructive">fact review required</Badge>
                                      ) : null}
                                      {Array.isArray(selectedIncidentEvidence.factProvenanceVerifier?.missingFactKeys)
                                        ? selectedIncidentEvidence.factProvenanceVerifier.missingFactKeys.map((factKey: unknown) => (
                                            typeof factKey === "string" ? (
                                              <Badge key={factKey} variant="outline">{factKey}</Badge>
                                            ) : null
                                          ))
                                        : null}
                                    </div>
                                    <p className="mt-3 text-sm text-muted-foreground">
                                      {selectedIncidentEvidence.sourceAttributionVerifier?.requiresVerification
                                        ? "Authority-backed wording needs approved supporting sources."
                                        : selectedIncidentEvidence.factProvenanceVerifier?.requiresReview
                                          ? "The turn asserted case facts that were not present in the authoritative fact record."
                                          : "No additional source or fact-verification concerns were captured."}
                                    </p>
                                  </div>
                                  <div className="rounded-lg border bg-background p-3">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Action and shadow review</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.actionConfirmationVerifier?.requiresConfirmation ? (
                                        <Badge variant="destructive">action confirmation required</Badge>
                                      ) : null}
                                      {selectedIncidentEvidence.shadowPolicy?.enabled ? (
                                        <Badge variant={selectedIncidentEvidence.shadowPolicy.differsFromLive ? "destructive" : "secondary"}>
                                          {typeof selectedIncidentEvidence.shadowPolicy.label === "string"
                                            ? selectedIncidentEvidence.shadowPolicy.label
                                            : "shadow policy"}
                                        </Badge>
                                      ) : null}
                                      {typeof selectedIncidentEvidence.shadowPolicy?.decision === "string" ? (
                                        <Badge variant="outline">{selectedIncidentEvidence.shadowPolicy.decision}</Badge>
                                      ) : null}
                                    </div>
                                    <p className="mt-3 text-sm text-muted-foreground">
                                      {selectedIncidentEvidence.actionConfirmationVerifier?.requiresConfirmation
                                        ? "The output claimed side effects that were not backed by confirmed tool execution."
                                        : typeof selectedIncidentEvidence.shadowPolicy?.decisionSummary === "string"
                                          ? selectedIncidentEvidence.shadowPolicy.decisionSummary
                                          : "No additional action-confirmation or shadow-policy concerns were captured."}
                                    </p>
                                  </div>
                                </div>
                              ) : null}

                              {selectedIncidentEvidence.reasonCodes.length > 0 ? (
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Reason codes</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {selectedIncidentEvidence.reasonCodes.map((reasonCode) => (
                                      <Badge key={reasonCode} variant="secondary">
                                        {formatGovernanceReasonCode(reasonCode)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {selectedIncidentEvidence.lawPackIdsApplied.length > 0 ? (
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Law packs</p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {selectedIncidentEvidence.lawPackIdsApplied.map((packId) => (
                                      <Badge key={packId} variant="outline">
                                        {formatLawPackLabel(packId)}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {selectedIncidentEvidence.policyCategories.length > 0 ||
                              selectedIncidentEvidence.requestedCapabilities.length > 0 ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Policy categories</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.policyCategories.length > 0 ? selectedIncidentEvidence.policyCategories.map((category) => (
                                        <Badge key={category} variant="outline">
                                          {formatGovernancePolicyCategoryLabel(category)}
                                        </Badge>
                                      )) : (
                                        <span className="text-sm text-muted-foreground">None recorded</span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Capabilities</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.requestedCapabilities.map((capability) => (
                                        <Badge key={capability} variant="secondary">
                                          {formatCapabilityLabel(capability)}
                                        </Badge>
                                      ))}
                                      {selectedIncidentEvidence.outOfScopeCapabilities.map((capability) => (
                                        <Badge key={capability} variant="destructive">
                                          {formatCapabilityLabel(capability)}
                                        </Badge>
                                      ))}
                                      {selectedIncidentEvidence.requestedCapabilities.length === 0 &&
                                      selectedIncidentEvidence.outOfScopeCapabilities.length === 0 ? (
                                        <span className="text-sm text-muted-foreground">None recorded</span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {Array.isArray(selectedIncidentEvidence.governanceCritic?.reasonCodes) ||
                              Array.isArray(selectedIncidentEvidence.governanceCritic?.fabricationFlags) ||
                              Array.isArray(selectedIncidentEvidence.governanceCritic?.groundingConcerns) ? (
                                <div className="grid gap-3 md:grid-cols-3">
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Critic reason codes</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {Array.isArray(selectedIncidentEvidence.governanceCritic?.reasonCodes) &&
                                      selectedIncidentEvidence.governanceCritic.reasonCodes.length > 0 ? (
                                        selectedIncidentEvidence.governanceCritic.reasonCodes.map((reasonCode: unknown) => (
                                          typeof reasonCode === "string" ? (
                                            <Badge key={reasonCode} variant="secondary">
                                              {formatGovernanceReasonCode(reasonCode)}
                                            </Badge>
                                          ) : null
                                        ))
                                      ) : (
                                        <span className="text-sm text-muted-foreground">None</span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Fabrication flags</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {Array.isArray(selectedIncidentEvidence.governanceCritic?.fabricationFlags) &&
                                      selectedIncidentEvidence.governanceCritic.fabricationFlags.length > 0 ? (
                                        selectedIncidentEvidence.governanceCritic.fabricationFlags.map((flag: unknown) => (
                                          typeof flag === "string" ? (
                                            <Badge key={flag} variant="destructive">
                                              {flag.replace(/_/g, " ")}
                                            </Badge>
                                          ) : null
                                        ))
                                      ) : (
                                        <span className="text-sm text-muted-foreground">None</span>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Grounding concerns</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {Array.isArray(selectedIncidentEvidence.governanceCritic?.groundingConcerns) &&
                                      selectedIncidentEvidence.governanceCritic.groundingConcerns.length > 0 ? (
                                        selectedIncidentEvidence.governanceCritic.groundingConcerns.map((concern: unknown) => (
                                          typeof concern === "string" ? (
                                            <Badge key={concern} variant="outline">
                                              {concern.replace(/_/g, " ")}
                                            </Badge>
                                          ) : null
                                        ))
                                      ) : (
                                        <span className="text-sm text-muted-foreground">None</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : null}

                              {selectedIncidentEvidence.thresholdBreaches.length > 0 || selectedIncidentEvidence.restrictedPromptMatches.length > 0 ? (
                                <div className="grid gap-3 md:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Threshold breaches</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.thresholdBreaches.map((threshold) => (
                                        <Badge key={threshold} variant="outline">{threshold.replace(/_/g, " ")}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Restricted matches</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {selectedIncidentEvidence.restrictedPromptMatches.length > 0 ? selectedIncidentEvidence.restrictedPromptMatches.map((match) => (
                                        <Badge key={match} variant="destructive">{match}</Badge>
                                      )) : (
                                        <span className="text-sm text-muted-foreground">None recorded</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </SectionBlock>
                        ) : null}

                        <SectionBlock title="Playbook">
                          {(selectedIncident.playbook?.steps ?? []).length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                              {(selectedIncident.playbook?.steps ?? []).map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-muted-foreground">No playbook steps recorded.</p>
                          )}
                        </SectionBlock>

                        {selectedIncident.rootCause ? (
                          <SectionBlock title="Root cause">
                            <p className="whitespace-pre-wrap text-sm">{selectedIncident.rootCause}</p>
                          </SectionBlock>
                        ) : null}

                        {selectedIncident.postIncidentReview && Object.keys(selectedIncident.postIncidentReview).length > 0 ? (
                          <SectionBlock title="Post-incident review">
                            <p className="whitespace-pre-wrap text-sm">
                              {String(selectedIncident.postIncidentReview.summary ?? "Review recorded")}
                            </p>
                          </SectionBlock>
                        ) : null}
                      </div>

                      <div className="space-y-4">
                        <SectionBlock title="Actions">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              onClick={() => updateIncidentMutation.mutate({ id: selectedIncident.id, payload: { status: "contained" } })}
                              disabled={selectedIncident.status !== "open" || updateIncidentMutation.isPending}
                            >
                              Contain
                            </Button>
                            <Button
                              onClick={() => updateIncidentMutation.mutate({ id: selectedIncident.id, payload: { status: "resolved" } })}
                              disabled={selectedIncident.status === "resolved" || selectedIncident.status === "postmortem" || updateIncidentMutation.isPending}
                            >
                              Resolve
                            </Button>
                          </div>
                          {selectedIncidentEvidence?.telemetryEventId && selectedIncidentEvidence.decision === "escalate" ? (
                            <div className="mt-4 space-y-3 rounded-lg border bg-background p-3">
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Reviewer release</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  Release an escalated runtime turn only after adding a reviewer note. Optional action receipt details can be captured with the same review.
                                </p>
                              </div>
                              <Field label="Reviewer note">
                                <textarea
                                  className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                                  value={selectedReleaseDraft?.reviewerNote ?? ""}
                                  onChange={(event) =>
                                    setReleaseDrafts((current) => ({
                                      ...current,
                                      [selectedIncident.id]: {
                                        reviewerNote: event.target.value,
                                        actionName: current[selectedIncident.id]?.actionName ?? "",
                                        toolName: current[selectedIncident.id]?.toolName ?? "",
                                        receiptId: current[selectedIncident.id]?.receiptId ?? "",
                                        details: current[selectedIncident.id]?.details ?? "",
                                      },
                                    }))
                                  }
                                />
                              </Field>
                              <div className="grid gap-3 md:grid-cols-2">
                                <Field label="Action receipt name">
                                  <input
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={selectedReleaseDraft?.actionName ?? ""}
                                    onChange={(event) =>
                                      setReleaseDrafts((current) => ({
                                        ...current,
                                        [selectedIncident.id]: {
                                          reviewerNote: current[selectedIncident.id]?.reviewerNote ?? "",
                                          actionName: event.target.value,
                                          toolName: current[selectedIncident.id]?.toolName ?? "",
                                          receiptId: current[selectedIncident.id]?.receiptId ?? "",
                                          details: current[selectedIncident.id]?.details ?? "",
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label="Tool / integration">
                                  <input
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={selectedReleaseDraft?.toolName ?? ""}
                                    onChange={(event) =>
                                      setReleaseDrafts((current) => ({
                                        ...current,
                                        [selectedIncident.id]: {
                                          reviewerNote: current[selectedIncident.id]?.reviewerNote ?? "",
                                          actionName: current[selectedIncident.id]?.actionName ?? "",
                                          toolName: event.target.value,
                                          receiptId: current[selectedIncident.id]?.receiptId ?? "",
                                          details: current[selectedIncident.id]?.details ?? "",
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label="Receipt ID">
                                  <input
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={selectedReleaseDraft?.receiptId ?? ""}
                                    onChange={(event) =>
                                      setReleaseDrafts((current) => ({
                                        ...current,
                                        [selectedIncident.id]: {
                                          reviewerNote: current[selectedIncident.id]?.reviewerNote ?? "",
                                          actionName: current[selectedIncident.id]?.actionName ?? "",
                                          toolName: current[selectedIncident.id]?.toolName ?? "",
                                          receiptId: event.target.value,
                                          details: current[selectedIncident.id]?.details ?? "",
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label="Receipt details">
                                  <input
                                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                    value={selectedReleaseDraft?.details ?? ""}
                                    onChange={(event) =>
                                      setReleaseDrafts((current) => ({
                                        ...current,
                                        [selectedIncident.id]: {
                                          reviewerNote: current[selectedIncident.id]?.reviewerNote ?? "",
                                          actionName: current[selectedIncident.id]?.actionName ?? "",
                                          toolName: current[selectedIncident.id]?.toolName ?? "",
                                          receiptId: current[selectedIncident.id]?.receiptId ?? "",
                                          details: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="secondary"
                                  onClick={() =>
                                    reviewerReleaseMutation.mutate({
                                      telemetryEventId: selectedIncidentEvidence.telemetryEventId!,
                                      payload: {
                                        reviewerNote: selectedReleaseDraft?.reviewerNote ?? "",
                                        receipts:
                                          selectedReleaseDraft?.actionName?.trim()
                                            ? [
                                                {
                                                  name: selectedReleaseDraft.actionName,
                                                  toolName: selectedReleaseDraft.toolName || null,
                                                  receiptId: selectedReleaseDraft.receiptId || null,
                                                  details: selectedReleaseDraft.details || null,
                                                },
                                              ]
                                            : [],
                                      },
                                    })
                                  }
                                  disabled={
                                    reviewerReleaseMutation.isPending ||
                                    !(selectedReleaseDraft?.reviewerNote ?? "").trim() ||
                                    selectedIncidentEvidence.reviewRelease?.status === "released"
                                  }
                                >
                                  {reviewerReleaseMutation.isPending ? "Releasing..." : "Acknowledge & release"}
                                </Button>
                                {selectedIncidentEvidence.reviewRelease?.status === "released" ? (
                                  <Badge variant="outline">
                                    Released by {typeof selectedIncidentEvidence.reviewRelease.releasedBy === "string"
                                      ? selectedIncidentEvidence.reviewRelease.releasedBy
                                      : "reviewer"}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </SectionBlock>
                      </div>
                    </div>

                    <details className="mt-4 rounded-lg border bg-muted/10 p-4">
                      <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Postmortem workspace
                      </summary>
                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        <Field label="Root cause">
                          <textarea
                            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={reviews[selectedIncident.id]?.rootCause ?? selectedIncident.rootCause ?? ""}
                            onChange={(event) =>
                              setReviews((current) => ({
                                ...current,
                                [selectedIncident.id]: {
                                  rootCause: event.target.value,
                                  reviewSummary: current[selectedIncident.id]?.reviewSummary ?? String(selectedIncident.postIncidentReview?.summary ?? ""),
                                  affectedDecisionTraceIds: current[selectedIncident.id]?.affectedDecisionTraceIds ?? (selectedIncident.affectedDecisionTraceIds ?? []).join(", "),
                                  regulatoryNotifications: current[selectedIncident.id]?.regulatoryNotifications ?? (selectedIncident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n"),
                                },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Post-incident review summary">
                          <textarea
                            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={reviews[selectedIncident.id]?.reviewSummary ?? String(selectedIncident.postIncidentReview?.summary ?? "")}
                            onChange={(event) =>
                              setReviews((current) => ({
                                ...current,
                                [selectedIncident.id]: {
                                  rootCause: current[selectedIncident.id]?.rootCause ?? selectedIncident.rootCause ?? "",
                                  reviewSummary: event.target.value,
                                  affectedDecisionTraceIds: current[selectedIncident.id]?.affectedDecisionTraceIds ?? (selectedIncident.affectedDecisionTraceIds ?? []).join(", "),
                                  regulatoryNotifications: current[selectedIncident.id]?.regulatoryNotifications ?? (selectedIncident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n"),
                                },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Affected decision trace IDs (comma separated)">
                          <input
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={reviews[selectedIncident.id]?.affectedDecisionTraceIds ?? (selectedIncident.affectedDecisionTraceIds ?? []).join(", ")}
                            onChange={(event) =>
                              setReviews((current) => ({
                                ...current,
                                [selectedIncident.id]: {
                                  rootCause: current[selectedIncident.id]?.rootCause ?? selectedIncident.rootCause ?? "",
                                  reviewSummary: current[selectedIncident.id]?.reviewSummary ?? String(selectedIncident.postIncidentReview?.summary ?? ""),
                                  affectedDecisionTraceIds: event.target.value,
                                  regulatoryNotifications: current[selectedIncident.id]?.regulatoryNotifications ?? (selectedIncident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n"),
                                },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Regulatory notifications (one authority per line)">
                          <textarea
                            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={reviews[selectedIncident.id]?.regulatoryNotifications ?? (selectedIncident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n")}
                            onChange={(event) =>
                              setReviews((current) => ({
                                ...current,
                                [selectedIncident.id]: {
                                  rootCause: current[selectedIncident.id]?.rootCause ?? selectedIncident.rootCause ?? "",
                                  reviewSummary: current[selectedIncident.id]?.reviewSummary ?? String(selectedIncident.postIncidentReview?.summary ?? ""),
                                  affectedDecisionTraceIds: current[selectedIncident.id]?.affectedDecisionTraceIds ?? (selectedIncident.affectedDecisionTraceIds ?? []).join(", "),
                                  regulatoryNotifications: event.target.value,
                                },
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          onClick={() =>
                            updateIncidentMutation.mutate({
                              id: selectedIncident.id,
                              payload: {
                                status: "postmortem",
                                rootCause: reviews[selectedIncident.id]?.rootCause ?? selectedIncident.rootCause ?? null,
                                postIncidentReview: {
                                  summary: reviews[selectedIncident.id]?.reviewSummary ?? String(selectedIncident.postIncidentReview?.summary ?? ""),
                                  completedAt: new Date().toISOString(),
                                },
                                affectedDecisionTraceIds: parseCsv(reviews[selectedIncident.id]?.affectedDecisionTraceIds ?? (selectedIncident.affectedDecisionTraceIds ?? []).join(", ")),
                                regulatoryNotifications: parseNotificationLines(reviews[selectedIncident.id]?.regulatoryNotifications ?? (selectedIncident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n")),
                              },
                            })
                          }
                          disabled={updateIncidentMutation.isPending}
                        >
                          Complete Postmortem
                        </Button>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
                    Select an incident from the queue to open the workspace.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
    </label>
  );
}

function Metric({ title, value, icon: Icon }: { title: string; value: number; icon: typeof AlertTriangle }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function MetaBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className={`mt-1 ${mono ? "font-mono text-xs break-all leading-5" : "text-sm break-words whitespace-pre-wrap leading-6"}`}>{value}</div>
    </div>
  );
}

function SectionBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function parseCsv(value: string) {
  return value.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function parseNotificationLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((authority) => ({
      authority,
      status: "planned",
      notes: null,
      completedAt: null,
    }));
}

function getIncidentGovernanceEvidence(playbook: IncidentPlaybook | undefined | null) {
  if (!playbook) {
    return null;
  }

  const rulesEngine =
    playbook.rulesEngine && typeof playbook.rulesEngine === "object" && !Array.isArray(playbook.rulesEngine)
      ? (playbook.rulesEngine as Record<string, unknown>)
      : null;
  const governanceCritic =
    playbook.governanceCritic && typeof playbook.governanceCritic === "object" && !Array.isArray(playbook.governanceCritic)
      ? (playbook.governanceCritic as Record<string, unknown>)
      : null;
  const sourceAttributionVerifier =
    playbook.sourceAttributionVerifier &&
    typeof playbook.sourceAttributionVerifier === "object" &&
    !Array.isArray(playbook.sourceAttributionVerifier)
      ? (playbook.sourceAttributionVerifier as Record<string, unknown>)
      : null;
  const factProvenanceVerifier =
    playbook.factProvenanceVerifier &&
    typeof playbook.factProvenanceVerifier === "object" &&
    !Array.isArray(playbook.factProvenanceVerifier)
      ? (playbook.factProvenanceVerifier as Record<string, unknown>)
      : null;
  const actionConfirmationVerifier =
    playbook.actionConfirmationVerifier &&
    typeof playbook.actionConfirmationVerifier === "object" &&
    !Array.isArray(playbook.actionConfirmationVerifier)
      ? (playbook.actionConfirmationVerifier as Record<string, unknown>)
      : null;
  const shadowPolicy =
    playbook.shadowPolicy && typeof playbook.shadowPolicy === "object" && !Array.isArray(playbook.shadowPolicy)
      ? (playbook.shadowPolicy as Record<string, unknown>)
      : null;
  const reviewRelease =
    playbook.reviewRelease && typeof playbook.reviewRelease === "object" && !Array.isArray(playbook.reviewRelease)
      ? (playbook.reviewRelease as Record<string, unknown>)
      : null;

  const reasonCodes = Array.isArray(playbook.reasonCodes)
    ? playbook.reasonCodes.filter((entry): entry is string => typeof entry === "string")
    : [];
  const thresholdBreaches = Array.isArray(playbook.thresholdBreaches)
    ? playbook.thresholdBreaches.filter((entry): entry is string => typeof entry === "string")
    : [];
  const restrictedPromptMatches = Array.isArray(playbook.restrictedPromptMatches)
    ? playbook.restrictedPromptMatches.filter((entry): entry is string => typeof entry === "string")
    : [];
  const lawPackIdsApplied = Array.isArray(playbook.lawPackIdsApplied)
    ? playbook.lawPackIdsApplied.filter((entry): entry is string => typeof entry === "string")
    : [];
  const allowedCapabilitiesApplied = Array.isArray(playbook.allowedCapabilitiesApplied)
    ? playbook.allowedCapabilitiesApplied.filter((entry): entry is string => typeof entry === "string")
    : [];
  const policyCategories = Array.isArray(playbook.policyCategories)
    ? playbook.policyCategories.filter((entry): entry is string => typeof entry === "string")
    : [];
  const requestedCapabilities = Array.isArray(playbook.requestedCapabilities)
    ? playbook.requestedCapabilities.filter((entry): entry is string => typeof entry === "string")
    : [];
  const outOfScopeCapabilities = Array.isArray(playbook.outOfScopeCapabilities)
    ? playbook.outOfScopeCapabilities.filter((entry): entry is string => typeof entry === "string")
    : [];

  const hasEvidence =
    typeof playbook.decision === "string" ||
    typeof playbook.decisionSummary === "string" ||
    reasonCodes.length > 0 ||
    thresholdBreaches.length > 0 ||
    restrictedPromptMatches.length > 0 ||
    lawPackIdsApplied.length > 0 ||
    allowedCapabilitiesApplied.length > 0 ||
    policyCategories.length > 0 ||
    requestedCapabilities.length > 0 ||
    outOfScopeCapabilities.length > 0 ||
    typeof playbook.telemetryEventId === "string" ||
    typeof playbook.correlationId === "string" ||
    typeof playbook.legalProfileApplied === "string" ||
    typeof playbook.capabilityProfileApplied === "string" ||
    typeof playbook.strictnessApplied === "string" ||
    Boolean(rulesEngine) ||
    Boolean(governanceCritic) ||
    Boolean(sourceAttributionVerifier) ||
    Boolean(factProvenanceVerifier) ||
    Boolean(actionConfirmationVerifier) ||
    Boolean(reviewRelease) ||
    Boolean(shadowPolicy);

  if (!hasEvidence) {
    return null;
  }

  return {
    decision: typeof playbook.decision === "string" ? playbook.decision : null,
    decisionSummary: typeof playbook.decisionSummary === "string" ? playbook.decisionSummary : null,
    thresholdBreaches,
    restrictedPromptMatches,
    reasonCodes,
    legalProfileApplied:
      typeof playbook.legalProfileApplied === "string" ? playbook.legalProfileApplied : "global",
    lawPackIdsApplied,
    capabilityProfileApplied:
      typeof playbook.capabilityProfileApplied === "string" ? playbook.capabilityProfileApplied : "general_assistant",
    allowedCapabilitiesApplied,
    strictnessApplied:
      typeof playbook.strictnessApplied === "string" ? playbook.strictnessApplied : "normal",
    policyCategories,
    requestedCapabilities,
    outOfScopeCapabilities,
    telemetryEventId: typeof playbook.telemetryEventId === "string" ? playbook.telemetryEventId : null,
    correlationId:
      typeof playbook.correlationId === "string" ? playbook.correlationId : null,
    rulesEngine,
    governanceCritic,
    sourceAttributionVerifier,
    factProvenanceVerifier,
    actionConfirmationVerifier,
    reviewRelease,
    shadowPolicy,
  };
}
