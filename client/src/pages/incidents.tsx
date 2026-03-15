import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ShieldAlert, Siren, Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Incident = {
  id: string;
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
  resolvedAt: string | null;
  postmortemCompletedAt: string | null;
  playbook: { targetContainmentHours?: number; steps?: string[] };
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
  const [reviews, setReviews] = useState<Record<string, { rootCause: string; reviewSummary: string; affectedDecisionTraceIds: string; regulatoryNotifications: string }>>({});
  const summaryQuery = useQuery<IncidentSummary>({ queryKey: ["/api/incidents/summary"] });
  const listQuery = useQuery<Incident[]>({ queryKey: ["/api/incidents"] });

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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">AI Incident Response</h1>
        <p className="text-sm text-muted-foreground">
          Run bias, security, privacy, and reliability playbooks with explicit containment targets and escalation owners.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Total incidents" value={summaryQuery.data?.total ?? 0} icon={AlertTriangle} />
        <Metric title="Open" value={summaryQuery.data?.open ?? 0} icon={Siren} />
        <Metric title="High severity" value={summaryQuery.data?.highSeverity ?? 0} icon={ShieldAlert} />
        <Metric title="SLA breached" value={summaryQuery.data?.breached ?? 0} icon={Clock3} />
        <Metric title="Postmortems pending" value={summaryQuery.data?.postmortemPending ?? 0} icon={Clock3} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Open a new AI incident</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Active incident playbooks</CardTitle>
          </CardHeader>
          <CardContent>
            {listQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (listQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No incidents are open.</div>
            ) : (
              <div className="space-y-4">
                {listQuery.data!.map((incident) => (
                  <div key={incident.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold">{incident.title}</div>
                        <div className="text-xs text-muted-foreground">{incident.category} • detected {new Date(incident.detectedAt).toLocaleString()}</div>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={incident.severity === "critical" ? "destructive" : "default"}>{incident.severity}</Badge>
                        <Badge variant="outline">{incident.status}</Badge>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{incident.description}</p>
                    {incident.rootCause ? (
                      <div className="mt-3 rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="text-xs font-medium text-muted-foreground">Root cause</div>
                        <div className="mt-1 whitespace-pre-wrap">{incident.rootCause}</div>
                      </div>
                    ) : null}
                    {incident.postIncidentReview && Object.keys(incident.postIncidentReview).length > 0 ? (
                      <div className="mt-3 rounded-md border bg-muted/20 p-3 text-sm">
                        <div className="text-xs font-medium text-muted-foreground">Post-incident review</div>
                        <div className="mt-1 whitespace-pre-wrap">
                          {String(incident.postIncidentReview.summary ?? "Review recorded")}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
                      <div className="rounded-md bg-muted/30 p-3 text-sm">
                        <div className="text-xs font-medium text-muted-foreground">Playbook</div>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {(incident.playbook?.steps ?? []).map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex flex-col gap-2">
                        <Button variant="outline" onClick={() => updateIncidentMutation.mutate({ id: incident.id, payload: { status: "contained" } })} disabled={incident.status !== "open" || updateIncidentMutation.isPending}>Contain</Button>
                        <Button onClick={() => updateIncidentMutation.mutate({ id: incident.id, payload: { status: "resolved" } })} disabled={incident.status === "resolved" || incident.status === "postmortem" || updateIncidentMutation.isPending}>Resolve</Button>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <Field label="Root cause">
                        <textarea
                          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={reviews[incident.id]?.rootCause ?? incident.rootCause ?? ""}
                          onChange={(event) =>
                            setReviews((current) => ({
                              ...current,
                              [incident.id]: {
                                rootCause: event.target.value,
                                reviewSummary: current[incident.id]?.reviewSummary ?? String(incident.postIncidentReview?.summary ?? ""),
                                affectedDecisionTraceIds: current[incident.id]?.affectedDecisionTraceIds ?? (incident.affectedDecisionTraceIds ?? []).join(", "),
                                regulatoryNotifications: current[incident.id]?.regulatoryNotifications ?? (incident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n"),
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Post-incident review summary">
                        <textarea
                          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={reviews[incident.id]?.reviewSummary ?? String(incident.postIncidentReview?.summary ?? "")}
                          onChange={(event) =>
                            setReviews((current) => ({
                              ...current,
                              [incident.id]: {
                                rootCause: current[incident.id]?.rootCause ?? incident.rootCause ?? "",
                                reviewSummary: event.target.value,
                                affectedDecisionTraceIds: current[incident.id]?.affectedDecisionTraceIds ?? (incident.affectedDecisionTraceIds ?? []).join(", "),
                                regulatoryNotifications: current[incident.id]?.regulatoryNotifications ?? (incident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n"),
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Affected decision trace IDs (comma separated)">
                        <input
                          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={reviews[incident.id]?.affectedDecisionTraceIds ?? (incident.affectedDecisionTraceIds ?? []).join(", ")}
                          onChange={(event) =>
                            setReviews((current) => ({
                              ...current,
                              [incident.id]: {
                                rootCause: current[incident.id]?.rootCause ?? incident.rootCause ?? "",
                                reviewSummary: current[incident.id]?.reviewSummary ?? String(incident.postIncidentReview?.summary ?? ""),
                                affectedDecisionTraceIds: event.target.value,
                                regulatoryNotifications: current[incident.id]?.regulatoryNotifications ?? (incident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n"),
                              },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Regulatory notifications (one authority per line)">
                        <textarea
                          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
                          value={reviews[incident.id]?.regulatoryNotifications ?? (incident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n")}
                          onChange={(event) =>
                            setReviews((current) => ({
                              ...current,
                              [incident.id]: {
                                rootCause: current[incident.id]?.rootCause ?? incident.rootCause ?? "",
                                reviewSummary: current[incident.id]?.reviewSummary ?? String(incident.postIncidentReview?.summary ?? ""),
                                affectedDecisionTraceIds: current[incident.id]?.affectedDecisionTraceIds ?? (incident.affectedDecisionTraceIds ?? []).join(", "),
                                regulatoryNotifications: event.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          updateIncidentMutation.mutate({
                            id: incident.id,
                            payload: {
                              status: "postmortem",
                              rootCause: reviews[incident.id]?.rootCause ?? incident.rootCause ?? null,
                              postIncidentReview: {
                                summary: reviews[incident.id]?.reviewSummary ?? String(incident.postIncidentReview?.summary ?? ""),
                                completedAt: new Date().toISOString(),
                              },
                              affectedDecisionTraceIds: parseCsv(reviews[incident.id]?.affectedDecisionTraceIds ?? (incident.affectedDecisionTraceIds ?? []).join(", ")),
                              regulatoryNotifications: parseNotificationLines(reviews[incident.id]?.regulatoryNotifications ?? (incident.regulatoryNotifications ?? []).map((item) => item.authority).join("\n")),
                            },
                          })
                        }
                        disabled={updateIncidentMutation.isPending}
                      >
                        Complete Postmortem
                      </Button>
                    </div>
                  </div>
                ))}
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
