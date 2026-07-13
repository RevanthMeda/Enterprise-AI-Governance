import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearch } from "wouter";
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
import { usePageCopy } from "@/lib/page-copy";
import {
  resolveIncidentDeepLink,
  resolveVisibleIncidentId,
  type IncidentQueueScope,
} from "@/lib/incident-navigation";
import type { AiSystem } from "@shared/schema";
import type { IncidentResolutionSuggestionResponse } from "@shared/incident-resolution-suggestions";

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
  eventType?: string;
  eventSummary?: string;
  gateway?: string | null;
  provider?: string | null;
  modelName?: string | null;
  promptPreview?: string | null;
  outputPreview?: string | null;
  runtimeContextSnapshot?: Record<string, unknown>;
  assignment?: Record<string, unknown>;
  telemetryEventId?: string;
  correlationId?: string | null;
  rulesEngine?: Record<string, unknown>;
  governanceCritic?: Record<string, unknown>;
  sourceAttributionVerifier?: Record<string, unknown>;
  factProvenanceVerifier?: Record<string, unknown>;
  actionConfirmationVerifier?: Record<string, unknown>;
  reviewRelease?: Record<string, unknown>;
  shadowPolicy?: Record<string, unknown>;
  threatIntelligence?: Record<string, unknown>;
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
  priority?: {
    score: number;
    level: string;
    reasons: string[];
    breached: boolean;
    needsAssignment: boolean;
    active: boolean;
    ageHours: number;
    timeToDueHours: number | null;
  } | null;
};

type IncidentSummary = {
  total: number;
  open: number;
  active?: number;
  highSeverity: number;
  breached: number;
  postmortemPending: number;
  urgent: number;
  highPriority: number;
  normalPriority: number;
  monitor: number;
  unassignedActive: number;
};

type IncidentAssigneeCandidate = {
  userId: string;
  fullName: string;
  email: string | null;
  membershipRole: string;
  label: string;
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

function replaceIncidentIdInCurrentUrl(incidentId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }

  const url = new URL(window.location.href);
  if (incidentId) {
    url.searchParams.set("incidentId", incidentId);
  } else {
    url.searchParams.delete("incidentId");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export default function IncidentsPage() {
  const pageCopy = usePageCopy();
  const locationSearch = useSearch();
  const requestedIncidentId = useMemo(() => {
    return new URLSearchParams(locationSearch).get("incidentId") ?? "";
  }, [locationSearch]);
  const [form, setForm] = useState(initialForm);
  const [queueScope, setQueueScope] = useState<IncidentQueueScope>("active");
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [handledIncidentRequest, setHandledIncidentRequest] = useState("");
  const [reviews, setReviews] = useState<Record<string, { rootCause: string; reviewSummary: string; affectedDecisionTraceIds: string; regulatoryNotifications: string }>>({});
  const [releaseDrafts, setReleaseDrafts] = useState<Record<string, { reviewerNote: string; actionName: string; toolName: string; receiptId: string; details: string }>>({});
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const summaryQuery = useQuery<IncidentSummary>({
    queryKey: ["/api/incidents/summary"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/incidents/summary", undefined, { signal });
      return response.json();
    },
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    staleTime: 5_000,
  });
  const listQuery = useQuery<Incident[]>({
    queryKey: ["/api/incidents"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/incidents", undefined, { signal });
      const payload = await response.json();
      return Array.isArray(payload)
        ? payload.map((entry) => normalizeIncident(entry)).filter((entry): entry is Incident => entry !== null)
        : [];
    },
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
  const assigneesQuery = useQuery<IncidentAssigneeCandidate[]>({
    queryKey: ["/api/incidents/assignees"],
    queryFn: async ({ signal }) => {
      const response = await apiRequest("GET", "/api/incidents/assignees", undefined, { signal });
      const payload = await response.json();
      return Array.isArray(payload)
        ? payload
            .map((entry) => normalizeIncidentAssigneeCandidate(entry))
            .filter((entry): entry is IncidentAssigneeCandidate => entry !== null)
        : [];
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!requestedIncidentId) {
      if (handledIncidentRequest) {
        setHandledIncidentRequest("");
      }
      return;
    }
    if (!listQuery.isSuccess) {
      return;
    }
    if (handledIncidentRequest === requestedIncidentId) {
      if (!listQuery.data.some((incident) => incident.id === requestedIncidentId)) {
        replaceIncidentIdInCurrentUrl(null);
      }
      return;
    }

    const resolvedDeepLink = resolveIncidentDeepLink(requestedIncidentId, listQuery.data);
    if (resolvedDeepLink) {
      setQueueScope(resolvedDeepLink.queueScope);
      setSelectedIncidentId(resolvedDeepLink.incidentId);
    } else {
      replaceIncidentIdInCurrentUrl(null);
    }
    setHandledIncidentRequest(requestedIncidentId);
  }, [handledIncidentRequest, listQuery.data, listQuery.isSuccess, requestedIncidentId]);

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

  const systemNameById = new Map((systemsQuery.data ?? []).map((system) => [system.id, system.name]));
  const getSystemLabel = (systemId?: string | null) => {
    if (!systemId) {
      return "Not linked";
    }

    return systemNameById.get(systemId) ?? systemId;
  };

  const incidents = [...(listQuery.data ?? [])].sort((a, b) => {
    const priorityDelta = (b.priority?.score ?? -1) - (a.priority?.score ?? -1);
    if (priorityDelta !== 0) return priorityDelta;
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
  }).filter((incident) => {
    if (priorityFilter !== "all" && incident.priority?.level !== priorityFilter) {
      return false;
    }
    if (severityFilter !== "all" && incident.severity !== severityFilter) {
      return false;
    }
    if (categoryFilter !== "all" && incident.category !== categoryFilter) {
      return false;
    }
    if (assignmentFilter === "assigned" && !incident.owner) {
      return false;
    }
    if (assignmentFilter === "unassigned" && incident.owner) {
      return false;
    }
    if (!searchQuery.trim()) {
      return true;
    }

    const evidence = getIncidentGovernanceEvidence(incident.playbook);
    const haystack = [
      incident.title,
      incident.description,
      incident.category,
      incident.severity,
      incident.status,
      incident.owner ?? "",
      incident.escalatedTo ?? "",
      getSystemLabel(incident.systemId),
      evidence?.decisionSummary ?? "",
      evidence?.eventSummary ?? "",
      ...(evidence?.reasonCodes ?? []),
      ...(evidence?.policyCategories ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(searchQuery.trim().toLowerCase());
  });

  const incidentCategories = Array.from(new Set(incidents.map((incident) => incident.category))).sort();

  const incidentDeepLinkPending = Boolean(
    requestedIncidentId && handledIncidentRequest !== requestedIncidentId,
  );
  const visibleSelectedIncidentId = !incidentDeepLinkPending
    ? resolveVisibleIncidentId(selectedIncidentId, filteredIncidents.map((incident) => incident.id))
    : null;
  const selectedIncident =
    filteredIncidents.find((incident) => incident.id === visibleSelectedIncidentId) ?? null;

  useEffect(() => {
    if (incidentDeepLinkPending || selectedIncidentId === visibleSelectedIncidentId) {
      return;
    }

    setSelectedIncidentId(visibleSelectedIncidentId);
  }, [incidentDeepLinkPending, selectedIncidentId, visibleSelectedIncidentId]);
  const selectedIncidentEvidence = getIncidentGovernanceEvidence(selectedIncident?.playbook);
  const selectedReleaseDraft = selectedIncident ? releaseDrafts[selectedIncident.id] ?? {
    reviewerNote: "",
    actionName: "",
    toolName: "",
    receiptId: "",
    details: "",
  } : null;
  const selectedAssigneeId = selectedIncident
    ? assignmentDrafts[selectedIncident.id] ??
      resolveIncidentAssigneeId(selectedIncident.owner, assigneesQuery.data ?? [])
    : "";
  const resolutionSuggestionQuery = useQuery<IncidentResolutionSuggestionResponse | null>({
    queryKey: ["/api/incidents/resolution-suggestion", selectedIncident?.id ?? "none"],
    enabled: Boolean(selectedIncident?.id),
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      if (!selectedIncident?.id) {
        return null;
      }
      const response = await apiRequest("GET", `/api/incidents/${selectedIncident.id}/resolution-suggestion`, undefined, { signal });
      return (await response.json()) as IncidentResolutionSuggestionResponse;
    },
  });

  return (
    <div className="page-shell">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.incidents.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.incidents.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{pageCopy.incidents.badges?.open} {summaryQuery.data?.open ?? 0}</Badge>
          <Badge variant={summaryQuery.data && summaryQuery.data.urgent > 0 ? "destructive" : "outline"}>
            {pageCopy.incidents.badges?.urgent} {summaryQuery.data?.urgent ?? 0}
          </Badge>
          <Badge variant="outline">{pageCopy.incidents.badges?.highSeverity} {summaryQuery.data?.highSeverity ?? 0}</Badge>
          <Badge variant={summaryQuery.data && summaryQuery.data.breached > 0 ? "destructive" : "outline"}>
            {pageCopy.incidents.badges?.slaBreached} {summaryQuery.data?.breached ?? 0}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <Metric title="Total incidents" value={summaryQuery.data?.total ?? 0} icon={AlertTriangle} />
        <Metric title="Active" value={summaryQuery.data?.active ?? summaryQuery.data?.open ?? 0} icon={Siren} />
        <Metric title="Urgent queue" value={summaryQuery.data?.urgent ?? 0} icon={ShieldAlert} />
        <Metric title="SLA breached" value={summaryQuery.data?.breached ?? 0} icon={Clock3} />
        <Metric title="Needs assignment" value={summaryQuery.data?.unassignedActive ?? 0} icon={Clock3} />
      </div>

      <div className="space-y-6">
        {summaryQuery.isError || listQuery.isError ? (
          <Card className="border-destructive/40">
            <CardContent className="p-4 text-sm text-muted-foreground">
              Incident data could not be loaded cleanly. The page now falls back to normalized incident payloads, but the API still returned an error for part of the queue.
            </CardContent>
          </Card>
        ) : null}
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
              <CardTitle className="text-sm font-semibold">
                {queueScope === "active" ? "Active incident queue" : queueScope === "resolved" ? "Resolved incident queue" : "Incident queue"}
              </CardTitle>
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
            <div className="mb-4 grid gap-3 rounded-lg border bg-muted/10 p-3 md:grid-cols-2 xl:grid-cols-6">
              <Field label="Search incidents">
                <input
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search title, system, reason code, summary..."
                />
              </Field>
              <Field label="Priority">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={priorityFilter}
                  onChange={(event) => setPriorityFilter(event.target.value)}
                >
                  <option value="all">All priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="monitor">Monitor</option>
                </select>
              </Field>
              <Field label="Severity">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={severityFilter}
                  onChange={(event) => setSeverityFilter(event.target.value)}
                >
                  <option value="all">All severities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </Field>
              <Field label="Category">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">All categories</option>
                  {incidentCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assignment">
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={assignmentFilter}
                  onChange={(event) => setAssignmentFilter(event.target.value)}
                >
                  <option value="all">All incidents</option>
                  <option value="assigned">Assigned only</option>
                  <option value="unassigned">Unassigned only</option>
                </select>
              </Field>
              <div className="flex flex-col justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setPriorityFilter("all");
                    setSeverityFilter("all");
                    setCategoryFilter("all");
                    setAssignmentFilter("all");
                  }}
                >
                  Clear filters
                </Button>
                <div className="text-xs text-muted-foreground">
                  {filteredIncidents.length} of {incidents.length} incidents shown
                </div>
              </div>
            </div>
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
                            {incident.priority?.level ? (
                              <Badge variant={incident.priority.level === "urgent" ? "destructive" : "secondary"}>
                                {incident.priority.level}
                              </Badge>
                            ) : null}
                            <Badge variant={incident.severity === "critical" ? "destructive" : "default"}>{incident.severity}</Badge>
                            <Badge variant="outline">{incident.status}</Badge>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{incident.description}</p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {incident.systemId ? <Badge variant="outline">{getSystemLabel(incident.systemId)}</Badge> : null}
                          {incident.owner ? <Badge variant="outline">Owner {incident.owner}</Badge> : <Badge variant="secondary">Unassigned</Badge>}
                          {incident.priority?.reasons?.[0] ? <Badge variant="outline">{incident.priority.reasons[0]}</Badge> : null}
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
                        {selectedIncident.priority?.level ? (
                          <Badge variant={selectedIncident.priority.level === "urgent" ? "destructive" : "secondary"}>
                            {selectedIncident.priority.level}
                          </Badge>
                        ) : null}
                        <Badge variant={selectedIncident.severity === "critical" ? "destructive" : "default"}>{selectedIncident.severity}</Badge>
                        <Badge variant="outline">{selectedIncident.status}</Badge>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                      <MetaBlock label="System" value={getSystemLabel(selectedIncident.systemId)} mono={!systemNameById.has(selectedIncident.systemId ?? "")} />
                      <MetaBlock label="Assigned reviewer" value={selectedIncident.owner ?? "Unassigned"} />
                      <MetaBlock label="Escalated to" value={selectedIncident.escalatedTo ?? "Not set"} />
                      <MetaBlock label="Containment target" value={selectedIncident.dueAt ? formatDateTime(selectedIncident.dueAt) : "Not set"} />
                      <MetaBlock
                        label="Priority"
                        value={
                          selectedIncident.priority
                            ? `${selectedIncident.priority.level} (${selectedIncident.priority.score})`
                            : "Not scored"
                        }
                      />
                      <MetaBlock
                        label="Queue signals"
                        value={
                          selectedIncident.priority
                            ? [
                                selectedIncident.priority.breached ? "SLA breached" : null,
                                selectedIncident.priority.needsAssignment ? "Needs assignment" : null,
                                selectedIncident.priority.reasons[0] ?? null,
                              ]
                                .filter(Boolean)
                                .join("\n") || "No escalated queue signals"
                            : "No escalated queue signals"
                        }
                      />
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

                              {selectedIncidentEvidence.eventSummary ||
                              selectedIncidentEvidence.promptPreview ||
                              selectedIncidentEvidence.outputPreview ? (
                                <div className="space-y-3">
                                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Captured runtime context</p>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <MetaBlock label="Event type" value={selectedIncidentEvidence.eventType ?? "Not recorded"} />
                                    <MetaBlock label="Gateway / model" value={buildRuntimePathLabel(selectedIncidentEvidence)} />
                                  </div>
                                  {selectedIncidentEvidence.eventSummary ? (
                                    <div className="rounded-lg border bg-background p-3">
                                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Event summary</p>
                                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{selectedIncidentEvidence.eventSummary}</p>
                                    </div>
                                  ) : null}
                                  <div className="grid gap-3 lg:grid-cols-2">
                                    <div className="rounded-lg border bg-background p-3">
                                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Prompt preview</p>
                                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                        {selectedIncidentEvidence.promptPreview ?? "No prompt preview captured."}
                                      </p>
                                    </div>
                                    <div className="rounded-lg border bg-background p-3">
                                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Output preview</p>
                                      <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                                        {selectedIncidentEvidence.outputPreview ?? "No output preview captured."}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </SectionBlock>
                        ) : null}

                        <SectionBlock title="Playbook">
                          {getStringArray(selectedIncident.playbook?.steps).length > 0 ? (
                            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                              {getStringArray(selectedIncident.playbook?.steps).map((step) => (
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
                        <SectionBlock title="Assignment">
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                              Every incident should have a named reviewer. Auto-assignment now picks a role-aligned owner, but you can reassign the case here without leaving the queue.
                            </p>
                            <Field label="Assigned reviewer">
                              <select
                                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                value={selectedAssigneeId}
                                onChange={(event) =>
                                  setAssignmentDrafts((current) => ({
                                    ...current,
                                    [selectedIncident.id]: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Leave unassigned</option>
                                {(assigneesQuery.data ?? []).map((candidate) => (
                                  <option key={candidate.userId} value={candidate.userId}>
                                    {candidate.label}
                                  </option>
                                ))}
                              </select>
                            </Field>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="outline"
                                onClick={() => {
                                  const nextOwner = (assigneesQuery.data ?? []).find((candidate) => candidate.userId === selectedAssigneeId);
                                  updateIncidentMutation.mutate({
                                    id: selectedIncident.id,
                                    payload: {
                                      owner: nextOwner?.fullName ?? null,
                                    },
                                  });
                                }}
                                disabled={updateIncidentMutation.isPending}
                              >
                                Save assignment
                              </Button>
                              {selectedIncidentEvidence?.assignment?.autoAssigned ? (
                                <Badge variant="secondary">
                                  Auto-assigned {typeof selectedIncidentEvidence.assignment?.ownerRole === "string"
                                    ? `via ${selectedIncidentEvidence.assignment.ownerRole.replace(/_/g, " ")}`
                                    : ""}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </SectionBlock>

                        <SectionBlock title="Reviewer recommendation">
                          {resolutionSuggestionQuery.isLoading ? (
                            <div className="space-y-2">
                              <Skeleton className="h-6 w-32" />
                              <Skeleton className="h-16 w-full" />
                            </div>
                          ) : resolutionSuggestionQuery.data ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Badge variant={resolutionSuggestionQuery.data.recommendation === "contain_and_escalate" ? "destructive" : "secondary"}>
                                  {resolutionSuggestionQuery.data.recommendation.replace(/_/g, " ")}
                                </Badge>
                                <Badge variant="outline">{resolutionSuggestionQuery.data.confidence} confidence</Badge>
                                {resolutionSuggestionQuery.data.signals.priorityLevel ? (
                                  <Badge variant="outline">
                                    queue {resolutionSuggestionQuery.data.signals.priorityLevel}
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="text-sm text-muted-foreground">{resolutionSuggestionQuery.data.summary}</p>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Rationale</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                  {resolutionSuggestionQuery.data.rationale.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Recommended actions</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                  {resolutionSuggestionQuery.data.recommendedActions.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                              <div>
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Reviewer checks</p>
                                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                                  {resolutionSuggestionQuery.data.reviewerChecks.map((item) => (
                                    <li key={item}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {resolutionSuggestionQuery.data.suggestedStatus &&
                                resolutionSuggestionQuery.data.suggestedStatus !== selectedIncident.status ? (
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      updateIncidentMutation.mutate({
                                        id: selectedIncident.id,
                                        payload: { status: resolutionSuggestionQuery.data?.suggestedStatus },
                                      })
                                    }
                                    disabled={updateIncidentMutation.isPending}
                                  >
                                    Apply suggested status: {resolutionSuggestionQuery.data.suggestedStatus}
                                  </Button>
                                ) : null}
                                {resolutionSuggestionQuery.data.shouldEscalate ? (
                                  <Badge variant="secondary">Escalation recommended</Badge>
                                ) : null}
                                {resolutionSuggestionQuery.data.shouldAssignOwner ? (
                                  <Badge variant="secondary">Assignment recommended</Badge>
                                ) : null}
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">No recommendation is available for this incident.</p>
                          )}
                        </SectionBlock>

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

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function normalizeIncidentAssigneeCandidate(value: unknown): IncidentAssigneeCandidate | null {
  const record = getObjectRecord(value);
  if (!record) {
    return null;
  }

  const userId = getStringValue(record.userId);
  const fullName = getStringValue(record.fullName);
  if (!userId || !fullName) {
    return null;
  }

  return {
    userId,
    fullName,
    email: getStringValue(record.email),
    membershipRole: getStringValue(record.membershipRole) ?? "reviewer",
    label: getStringValue(record.label) ?? fullName,
  };
}

function normalizeIncident(value: unknown): Incident | null {
  const record = getObjectRecord(value);
  if (!record) {
    return null;
  }

  const id = getStringValue(record.id);
  const title = getStringValue(record.title);
  const category = getStringValue(record.category);
  const severity = getStringValue(record.severity);
  const status = getStringValue(record.status);
  const description = getStringValue(record.description);
  const detectedAt = getStringValue(record.detectedAt);
  if (!id || !title || !category || !severity || !status || !description || !detectedAt) {
    return null;
  }

  const regulatoryNotifications = Array.isArray(record.regulatoryNotifications)
    ? record.regulatoryNotifications
        .map((entry) => {
          const notification = getObjectRecord(entry);
          const authority = getStringValue(notification?.authority);
          if (!authority) {
            return null;
          }

          return {
            authority,
            status: getStringValue(notification?.status) ?? "planned",
            notes: getStringValue(notification?.notes),
            completedAt: getStringValue(notification?.completedAt),
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    : [];

  return {
    id,
    systemId: getStringValue(record.systemId),
    title,
    category,
    severity,
    status,
    description,
    rootCause: getStringValue(record.rootCause),
    postIncidentReview: getObjectRecord(record.postIncidentReview) ?? {},
    affectedDecisionTraceIds: getStringArray(record.affectedDecisionTraceIds),
    regulatoryNotifications,
    owner: getStringValue(record.owner),
    escalatedTo: getStringValue(record.escalatedTo),
    dueAt: getStringValue(record.dueAt),
    detectedAt,
    updatedAt: getStringValue(record.updatedAt),
    resolvedAt: getStringValue(record.resolvedAt),
    postmortemCompletedAt: getStringValue(record.postmortemCompletedAt),
    playbook: (getObjectRecord(record.playbook) ?? {}) as IncidentPlaybook,
    priority: (() => {
      const priority = getObjectRecord(record.priority);
      if (!priority) {
        return null;
      }

      const score = typeof priority.score === "number" ? priority.score : null;
      const level = getStringValue(priority.level);
      if (score === null || !level) {
        return null;
      }

      return {
        score,
        level,
        reasons: getStringArray(priority.reasons),
        breached: priority.breached === true,
        needsAssignment: priority.needsAssignment === true,
        active: priority.active === true,
        ageHours: typeof priority.ageHours === "number" ? priority.ageHours : 0,
        timeToDueHours: typeof priority.timeToDueHours === "number" ? priority.timeToDueHours : null,
      };
    })(),
  };
}

function resolveIncidentAssigneeId(owner: string | null | undefined, candidates: IncidentAssigneeCandidate[]) {
  if (!owner) {
    return "";
  }

  const normalizedOwner = owner.trim().toLowerCase();
  return (
    candidates.find((candidate) =>
      [candidate.fullName, candidate.email]
        .filter(Boolean)
        .some((value) => value?.trim().toLowerCase() === normalizedOwner),
    )?.userId ?? ""
  );
}

function buildRuntimePathLabel(evidence: ReturnType<typeof getIncidentGovernanceEvidence>) {
  if (!evidence) {
    return "Not recorded";
  }

  const parts = [evidence.gateway, evidence.provider, evidence.modelName].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" • ") : "Not recorded";
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
  const assignment =
    playbook.assignment && typeof playbook.assignment === "object" && !Array.isArray(playbook.assignment)
      ? (playbook.assignment as Record<string, unknown>)
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
    typeof playbook.eventType === "string" ||
    typeof playbook.eventSummary === "string" ||
    typeof playbook.promptPreview === "string" ||
    typeof playbook.outputPreview === "string" ||
    typeof playbook.legalProfileApplied === "string" ||
    typeof playbook.capabilityProfileApplied === "string" ||
    typeof playbook.strictnessApplied === "string" ||
    Boolean(rulesEngine) ||
    Boolean(governanceCritic) ||
    Boolean(sourceAttributionVerifier) ||
    Boolean(factProvenanceVerifier) ||
    Boolean(actionConfirmationVerifier) ||
    Boolean(assignment) ||
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
    eventType: typeof playbook.eventType === "string" ? playbook.eventType : null,
    eventSummary: typeof playbook.eventSummary === "string" ? playbook.eventSummary : null,
    gateway: typeof playbook.gateway === "string" ? playbook.gateway : null,
    provider: typeof playbook.provider === "string" ? playbook.provider : null,
    modelName: typeof playbook.modelName === "string" ? playbook.modelName : null,
    promptPreview: typeof playbook.promptPreview === "string" ? playbook.promptPreview : null,
    outputPreview: typeof playbook.outputPreview === "string" ? playbook.outputPreview : null,
    runtimeContextSnapshot:
      playbook.runtimeContextSnapshot && typeof playbook.runtimeContextSnapshot === "object" && !Array.isArray(playbook.runtimeContextSnapshot)
        ? (playbook.runtimeContextSnapshot as Record<string, unknown>)
        : null,
    rulesEngine,
    governanceCritic,
    sourceAttributionVerifier,
    factProvenanceVerifier,
    actionConfirmationVerifier,
    assignment,
    reviewRelease,
    shadowPolicy,
  };
}
