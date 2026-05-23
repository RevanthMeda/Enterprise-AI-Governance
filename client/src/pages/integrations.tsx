import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Brain, Link2, PlugZap, Radio, ShieldAlert, Workflow, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageCopy } from "@/lib/page-copy";
import type {
  GovernanceAutomationRunResponse,
  GovernanceAutomationSummaryResponse,
  GovernanceEventFeedResponse,
} from "@shared/governance-events";
import {
  integrationConnectorSeverityFloors,
  integrationConnectorTypeDescriptions,
  integrationConnectorTypeLabels,
  integrationConnectorTypes,
  type IntegrationConnectorConfig,
} from "@shared/integration-connectors";
import {
  governanceAutomationRuleKeys,
  governanceAutomationRuleLabels,
  governanceAutomationRunModes,
  type GovernanceAutomationConfig,
} from "@shared/governance-automation-builder";
import {
  threatIntelExternalFeedDefaultLabels,
  threatIntelExternalFeedTypeDescriptions,
  threatIntelExternalFeedTypeLabels,
  threatIntelExternalFeedTypes,
  threatIntelExternalFeedUrlPlaceholders,
  type ThreatIntelConfig,
  type ThreatIntelSummaryResponse,
} from "@shared/threat-intelligence";

type JiraIntegration = {
  id: string;
  enabled: boolean;
  baseUrl: string | null;
  projectKey: string | null;
  userEmail: string | null;
  apiToken: string | null;
  issueType: string;
  labels: string[];
  lastTestedAt: string | null;
  lastSyncAt: string | null;
};

export default function IntegrationsPage() {
  const pageCopy = usePageCopy();
  const integrationPage = pageCopy.integrations;
  const integrationBadges = integrationPage.badges ?? {};
  const integrationQuery = useQuery<JiraIntegration | null>({ queryKey: ["/api/organization/jira-integration"] });
  const governanceEventsQuery = useQuery<GovernanceEventFeedResponse>({
    queryKey: ["/api/governance-events"],
  });
  const connectorsQuery = useQuery<IntegrationConnectorConfig[]>({
    queryKey: ["/api/integrations/connectors"],
  });
  const automationSummaryQuery = useQuery<GovernanceAutomationSummaryResponse>({
    queryKey: ["/api/governance-automation/summary"],
  });
  const threatIntelSummaryQuery = useQuery<ThreatIntelSummaryResponse>({
    queryKey: ["/api/threat-intelligence/summary"],
  });
  const threatIntelConfigQuery = useQuery<ThreatIntelConfig>({
    queryKey: ["/api/threat-intelligence/config"],
  });
  const automationConfigQuery = useQuery<GovernanceAutomationConfig>({
    queryKey: ["/api/governance-automation/config"],
  });
  const [form, setForm] = useState({
    enabled: false,
    baseUrl: "",
    projectKey: "",
    userEmail: "",
    apiToken: "",
    issueType: "Task",
    labels: "ai-control-grid,high-risk",
  });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [eventTestResult, setEventTestResult] = useState<string | null>(null);
  const [connectorTestResult, setConnectorTestResult] = useState<string | null>(null);
  const [automationResult, setAutomationResult] = useState<string | null>(null);
  const [threatIntelResult, setThreatIntelResult] = useState<string | null>(null);
  const [automationConfigDraft, setAutomationConfigDraft] = useState<GovernanceAutomationConfig | null>(null);
  const [threatIntelDraft, setThreatIntelDraft] = useState<ThreatIntelConfig | null>(null);
  const [connectorDraft, setConnectorDraft] = useState<IntegrationConnectorConfig[]>([]);

  useEffect(() => {
    if (!integrationQuery.data) return;
    setForm({
      enabled: integrationQuery.data.enabled,
      baseUrl: integrationQuery.data.baseUrl ?? "",
      projectKey: integrationQuery.data.projectKey ?? "",
      userEmail: integrationQuery.data.userEmail ?? "",
      apiToken: integrationQuery.data.apiToken ?? "",
      issueType: integrationQuery.data.issueType ?? "Task",
      labels: Array.isArray(integrationQuery.data.labels) ? integrationQuery.data.labels.join(",") : "",
    });
  }, [integrationQuery.data]);

  useEffect(() => {
    if (!automationConfigQuery.data) return;
    setAutomationConfigDraft(automationConfigQuery.data);
  }, [automationConfigQuery.data]);

  useEffect(() => {
    if (!connectorsQuery.data) return;
    setConnectorDraft(connectorsQuery.data);
  }, [connectorsQuery.data]);

  useEffect(() => {
    if (!threatIntelConfigQuery.data) return;
    setThreatIntelDraft(threatIntelConfigQuery.data);
  }, [threatIntelConfigQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/organization/jira-integration", {
        enabled: form.enabled,
        baseUrl: form.baseUrl || null,
        projectKey: form.projectKey || null,
        userEmail: form.userEmail || null,
        apiToken: form.apiToken || null,
        issueType: form.issueType || "Task",
        labels: form.labels.split(",").map((value) => value.trim()).filter(Boolean),
      });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/jira-integration"] });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/organization/jira-integration/test", {});
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      setTestResult(data.message ?? "Connection successful");
    },
    onError: (error: Error) => {
      setTestResult(error.message);
    },
  });

  const eventTestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/governance-events/test", {});
      return res.json();
    },
    onSuccess: (data: { queued?: boolean; reason?: string; jobId?: string; jobCount?: number }) => {
      setEventTestResult(
        data.queued
          ? `Test event queued${data.jobId ? ` as job ${data.jobId}` : ""}${data.jobCount ? ` across ${data.jobCount} destination(s)` : ""}.`
          : `Webhook not configured (${data.reason ?? "not queued"}).`,
      );
      void governanceEventsQuery.refetch();
    },
    onError: (error: Error) => {
      setEventTestResult(error.message);
    },
  });

  const automationRunMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/governance-automation/run", {});
      return (await res.json()) as GovernanceAutomationRunResponse;
    },
    onSuccess: (data) => {
      setAutomationResult(
        `Remediation sweep completed: ${data.notificationsCreated} notifications created across ${data.actionsRun.length} action groups.`,
      );
      void Promise.all([automationSummaryQuery.refetch(), governanceEventsQuery.refetch()]);
    },
    onError: (error: Error) => {
      setAutomationResult(error.message);
    },
  });

  const connectorMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/integrations/connectors", connectorDraft);
      return (await res.json()) as IntegrationConnectorConfig[];
    },
    onSuccess: async (updated) => {
      setConnectorDraft(updated);
      setConnectorTestResult("Integration connectors saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/integrations/connectors"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/governance-events"] }),
      ]);
    },
    onError: (error: Error) => {
      setConnectorTestResult(error.message);
    },
  });

  const connectorTestMutation = useMutation({
    mutationFn: async (connectorId: string | null) => {
      const res = await apiRequest("POST", "/api/integrations/connectors/test", { connectorId });
      return res.json();
    },
    onSuccess: (data: { queued?: boolean; reason?: string; jobId?: string; jobCount?: number }) => {
      setConnectorTestResult(
        data.queued
          ? `Connector test queued${data.jobCount ? ` across ${data.jobCount} destination(s)` : ""}${data.jobId ? ` starting with job ${data.jobId}` : ""}.`
          : `Connector test not queued (${data.reason ?? "not queued"}).`,
      );
      void governanceEventsQuery.refetch();
    },
    onError: (error: Error) => {
      setConnectorTestResult(error.message);
    },
  });

  const automationConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/governance-automation/config", automationConfigDraft ?? {});
      return (await res.json()) as GovernanceAutomationConfig;
    },
    onSuccess: async (updated) => {
      setAutomationConfigDraft(updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/governance-automation/config"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/governance-automation/summary"] }),
      ]);
    },
    onError: (error: Error) => {
      setAutomationResult(error.message);
    },
  });

  const threatIntelConfigMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/threat-intelligence/config", threatIntelDraft ?? {});
      return (await res.json()) as ThreatIntelConfig;
    },
    onSuccess: async (updated) => {
      setThreatIntelDraft(updated);
      setThreatIntelResult("Threat intelligence settings saved.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/threat-intelligence/config"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/threat-intelligence/summary"] }),
      ]);
    },
    onError: (error: Error) => {
      setThreatIntelResult(error.message);
    },
  });

  const automationState = useMemo(() => {
    if (!form.enabled) return integrationBadges.disabled ?? "Disabled";
    if (!form.baseUrl || !form.projectKey || !form.userEmail || !form.apiToken) {
      return integrationBadges.configurationIncomplete ?? "Configuration incomplete";
    }
    return integrationBadges.jiraReady ?? "High-risk approvals will open Jira tickets";
  }, [form, integrationBadges]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{integrationPage.title}</h1>
          <p className="text-sm text-muted-foreground">{integrationPage.description}</p>
        </div>
        <Badge variant="outline">
          {integrationBadges.connectorExpansion ?? "Connector expansion enabled"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title={integrationBadges.connectors ?? "Connectors"} value={String((connectorsQuery.data ?? []).length)} icon={PlugZap} />
        <InfoCard title={integrationBadges.automationRule ?? "Automation rule"} value={integrationBadges.highRiskWorkflow ?? "High priority or high-risk workflow"} icon={Workflow} />
        <InfoCard title={integrationBadges.currentState ?? "Current state"} value={automationState} icon={Link2} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{integrationBadges.connectorCatalog ?? "Connector catalog"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectorsQuery.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <>
              <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                Configure org-scoped destinations for governed events. Slack, Teams, ServiceNow, GitHub, Datadog, and generic webhook endpoints all use the same delivery and audit path.
              </div>
              <div className="space-y-3">
                {connectorDraft.length === 0 ? (
                  <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                    No org-scoped connectors are configured yet. Add one below or continue using only the platform-level webhook fallback.
                  </div>
                ) : (
                  connectorDraft.map((connector) => (
                    <div key={connector.id} className="rounded-md border p-3">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <Field label="Label">
                          <input
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={connector.label}
                            onChange={(event) =>
                              setConnectorDraft((current) =>
                                current.map((entry) =>
                                  entry.id === connector.id ? { ...entry, label: event.target.value } : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Type">
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={connector.type}
                            onChange={(event) =>
                              setConnectorDraft((current) =>
                                current.map((entry) =>
                                  entry.id === connector.id
                                    ? { ...entry, type: event.target.value as IntegrationConnectorConfig["type"] }
                                    : entry,
                                ),
                              )
                            }
                          >
                            {integrationConnectorTypes.map((type) => (
                              <option key={type} value={type}>
                                {integrationConnectorTypeLabels[type]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Severity floor">
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={connector.severityFloor}
                            onChange={(event) =>
                              setConnectorDraft((current) =>
                                current.map((entry) =>
                                  entry.id === connector.id
                                    ? {
                                        ...entry,
                                        severityFloor: event.target.value as IntegrationConnectorConfig["severityFloor"],
                                      }
                                    : entry,
                                ),
                              )
                            }
                          >
                            {integrationConnectorSeverityFloors.map((severity) => (
                              <option key={severity} value={severity}>
                                {severity}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Webhook URL">
                          <input
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={connector.webhookUrl ?? ""}
                            onChange={(event) =>
                              setConnectorDraft((current) =>
                                current.map((entry) =>
                                  entry.id === connector.id ? { ...entry, webhookUrl: event.target.value || null } : entry,
                                ),
                              )
                            }
                            placeholder="https://..."
                          />
                        </Field>
                        <Field label="Auth token">
                          <input
                            type="password"
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={connector.authToken ?? ""}
                            onChange={(event) =>
                              setConnectorDraft((current) =>
                                current.map((entry) =>
                                  entry.id === connector.id ? { ...entry, authToken: event.target.value || null } : entry,
                                ),
                              )
                            }
                          />
                        </Field>
                        <Field label="Event filters">
                          <input
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={connector.eventFilters.join(", ")}
                            onChange={(event) =>
                              setConnectorDraft((current) =>
                                current.map((entry) =>
                                  entry.id === connector.id
                                    ? {
                                        ...entry,
                                        eventFilters: event.target.value
                                          .split(",")
                                          .map((value) => value.trim())
                                          .filter(Boolean)
                                          .slice(0, 12),
                                      }
                                    : entry,
                                ),
                              )
                            }
                            placeholder="incident, policy.changed, automation"
                          />
                        </Field>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={connector.enabled}
                              onChange={(event) =>
                                setConnectorDraft((current) =>
                                  current.map((entry) =>
                                    entry.id === connector.id ? { ...entry, enabled: event.target.checked } : entry,
                                  ),
                                )
                              }
                            />
                            Enabled
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {integrationConnectorTypeDescriptions[connector.type]}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => connectorTestMutation.mutate(connector.id)}
                            disabled={connectorTestMutation.isPending}
                          >
                            Test
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setConnectorDraft((current) => current.filter((entry) => entry.id !== connector.id))
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setConnectorDraft((current) => {
                      const nextConnector: IntegrationConnectorConfig = {
                        id: `connector-${Date.now().toString(36).slice(-6)}`,
                        label: "New connector",
                        type: "slack",
                        enabled: true,
                        webhookUrl: null,
                        authToken: null,
                        eventFilters: [],
                        severityFloor: "warning",
                      };
                      return [...current, nextConnector].slice(0, 12);
                    })
                  }
                >
                  Add connector
                </Button>
                <Button onClick={() => connectorMutation.mutate()} disabled={connectorMutation.isPending}>
                  {connectorMutation.isPending ? "Saving..." : "Save connectors"}
                </Button>
                <Button variant="outline" onClick={() => connectorTestMutation.mutate(null)} disabled={connectorTestMutation.isPending}>
                  {connectorTestMutation.isPending ? "Queueing..." : "Test all connectors"}
                </Button>
              </div>
              {connectorTestResult ? <div className="rounded-md border bg-muted/30 p-3 text-sm">{connectorTestResult}</div> : null}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{integrationBadges.threatIntel ?? "Threat intelligence"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!threatIntelDraft || threatIntelSummaryQuery.isLoading ? (
            <Skeleton className="h-44 w-full" />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-4">
                <InfoCard title="Status" value={threatIntelDraft.enabled ? "Enabled" : "Disabled"} icon={ShieldAlert} />
                <InfoCard title="Mode" value={threatIntelDraft.advisoryMode ? "Advisory" : "Escalating"} icon={Brain} />
                <InfoCard title="Recent matches" value={String(threatIntelSummaryQuery.data?.recentMatches ?? 0)} icon={Zap} />
                <InfoCard
                  title="Remote feed"
                  value={
                    threatIntelSummaryQuery.data?.status.remoteProviderLabel ??
                    (threatIntelSummaryQuery.data?.status.remoteFeedConfigured
                      ? threatIntelExternalFeedTypeLabels[threatIntelSummaryQuery.data.status.remoteProviderType]
                      : "Not configured")
                  }
                  icon={Radio}
                />
              </div>

              <div className="grid gap-3 xl:grid-cols-[1fr_0.95fr]">
                <div className="space-y-3">
                  <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={threatIntelDraft.enabled}
                      onChange={(event) =>
                        setThreatIntelDraft((current) => (current ? { ...current, enabled: event.target.checked } : current))
                      }
                    />
                    Turn on threat-intelligence matching for governed telemetry.
                  </label>
                  <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={threatIntelDraft.advisoryMode}
                      onChange={(event) =>
                        setThreatIntelDraft((current) => (current ? { ...current, advisoryMode: event.target.checked } : current))
                      }
                    />
                    Advisory mode only annotates and surfaces matches. Disable it to escalate matched traffic automatically.
                  </label>
                  <div className="grid gap-3 rounded-md border p-3 md:grid-cols-2">
                    <Field label="Feed format">
                      <select
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={threatIntelDraft.externalFeed.providerType}
                        onChange={(event) =>
                          setThreatIntelDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  externalFeed: {
                                    ...current.externalFeed,
                                    providerType: event.target.value as ThreatIntelConfig["externalFeed"]["providerType"],
                                    providerLabel:
                                      current.externalFeed.providerLabel ??
                                      threatIntelExternalFeedDefaultLabels[event.target.value as ThreatIntelConfig["externalFeed"]["providerType"]],
                                  },
                                }
                              : current,
                          )
                        }
                      >
                        {threatIntelExternalFeedTypes.map((entry) => (
                          <option key={entry} value={entry}>
                            {threatIntelExternalFeedTypeLabels[entry]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="External feed provider">
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={threatIntelDraft.externalFeed.providerLabel ?? ""}
                        onChange={(event) =>
                          setThreatIntelDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  externalFeed: { ...current.externalFeed, providerLabel: event.target.value || null },
                                }
                              : current,
                          )
                        }
                        placeholder={threatIntelExternalFeedDefaultLabels[threatIntelDraft.externalFeed.providerType]}
                      />
                    </Field>
                    <Field label="Feed URL">
                      <input
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={threatIntelDraft.externalFeed.feedUrl ?? ""}
                        onChange={(event) =>
                          setThreatIntelDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  externalFeed: { ...current.externalFeed, feedUrl: event.target.value || null },
                                }
                              : current,
                          )
                        }
                        placeholder={threatIntelExternalFeedUrlPlaceholders[threatIntelDraft.externalFeed.providerType]}
                      />
                    </Field>
                    <Field label="Feed token">
                      <input
                        type="password"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                        value={threatIntelDraft.externalFeed.authToken ?? ""}
                        onChange={(event) =>
                          setThreatIntelDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  externalFeed: { ...current.externalFeed, authToken: event.target.value || null },
                                }
                              : current,
                          )
                        }
                      />
                    </Field>
                    <label className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm">
                      <input
                        type="checkbox"
                        checked={threatIntelDraft.externalFeed.enabled}
                        onChange={(event) =>
                          setThreatIntelDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  externalFeed: { ...current.externalFeed, enabled: event.target.checked },
                                }
                              : current,
                          )
                        }
                      />
                      Use an org-specific external feed instead of relying only on the platform default.
                    </label>
                  </div>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {threatIntelExternalFeedTypeDescriptions[threatIntelDraft.externalFeed.providerType]}
                  </div>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Built-in indicators cover governance overrides, prompt exfiltration, phishing language, and AML-evasion phrasing. Custom indicators let you add tenant-specific attack patterns.
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Custom indicators</p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setThreatIntelDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  customIndicators: [
                                    ...current.customIndicators,
                                    {
                                      id: `custom-${Date.now().toString(36).slice(-6)}`,
                                      title: "New indicator",
                                      pattern: "",
                                      category: "custom",
                                      severity: "medium" as const,
                                      source: "custom" as const,
                                      enabled: true,
                                    },
                                  ].slice(0, 20),
                                }
                              : current,
                          )
                        }
                      >
                        Add indicator
                      </Button>
                    </div>
                    {(threatIntelDraft.customIndicators ?? []).length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        No tenant-specific indicators are configured yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {threatIntelDraft.customIndicators.map((indicator) => (
                          <div key={indicator.id} className="rounded-md border p-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <Field label="Title">
                                <input
                                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                  value={indicator.title}
                                  onChange={(event) =>
                                    setThreatIntelDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            customIndicators: current.customIndicators.map((entry) =>
                                              entry.id === indicator.id ? { ...entry, title: event.target.value } : entry,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </Field>
                              <Field label="Category">
                                <input
                                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                  value={indicator.category}
                                  onChange={(event) =>
                                    setThreatIntelDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            customIndicators: current.customIndicators.map((entry) =>
                                              entry.id === indicator.id ? { ...entry, category: event.target.value } : entry,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </Field>
                              <Field label="Pattern">
                                <input
                                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                  value={indicator.pattern}
                                  onChange={(event) =>
                                    setThreatIntelDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            customIndicators: current.customIndicators.map((entry) =>
                                              entry.id === indicator.id ? { ...entry, pattern: event.target.value } : entry,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                />
                              </Field>
                              <Field label="Severity">
                                <select
                                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                                  value={indicator.severity}
                                  onChange={(event) =>
                                    setThreatIntelDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            customIndicators: current.customIndicators.map((entry) =>
                                              entry.id === indicator.id
                                                ? { ...entry, severity: event.target.value as "critical" | "high" | "medium" }
                                                : entry,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                >
                                  <option value="critical">critical</option>
                                  <option value="high">high</option>
                                  <option value="medium">medium</option>
                                </select>
                              </Field>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={indicator.enabled}
                                  onChange={(event) =>
                                    setThreatIntelDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            customIndicators: current.customIndicators.map((entry) =>
                                              entry.id === indicator.id ? { ...entry, enabled: event.target.checked } : entry,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                />
                                Enabled
                              </label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setThreatIntelDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          customIndicators: current.customIndicators.filter((entry) => entry.id !== indicator.id),
                                        }
                                      : current,
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button onClick={() => threatIntelConfigMutation.mutate()} disabled={threatIntelConfigMutation.isPending}>
                    {threatIntelConfigMutation.isPending ? "Saving..." : "Save threat intelligence"}
                  </Button>
                  {threatIntelResult ? <div className="rounded-md border bg-muted/30 p-3 text-sm">{threatIntelResult}</div> : null}
                </div>

                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Remote indicators: {threatIntelSummaryQuery.data?.status.remoteIndicatorCount ?? 0} • Custom indicators: {threatIntelSummaryQuery.data?.status.customIndicatorCount ?? 0}
                    {threatIntelSummaryQuery.data?.status.remoteProviderLabel ? ` • Provider ${threatIntelSummaryQuery.data.status.remoteProviderLabel}` : ""}
                    {threatIntelSummaryQuery.data?.status.remoteFeedConfigured
                      ? ` • Format ${threatIntelExternalFeedTypeLabels[threatIntelSummaryQuery.data.status.remoteProviderType]}`
                      : ""}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Top matches</p>
                    {(threatIntelSummaryQuery.data?.topMatches ?? []).length === 0 ? (
                      <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        No threat-intelligence matches have been observed recently.
                      </div>
                    ) : (
                      (threatIntelSummaryQuery.data?.topMatches ?? []).map((match) => (
                        <div key={match.indicatorId} className="rounded-md border p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-medium">{match.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">{match.category}</p>
                            </div>
                            <Badge variant={match.severity === "critical" ? "destructive" : match.severity === "high" ? "secondary" : "outline"}>
                              {match.matchCount}
                            </Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Recent matched events</p>
                    {(threatIntelSummaryQuery.data?.recentEvents ?? []).slice(0, 5).map((event) => (
                      <div key={event.telemetryEventId} className="rounded-md border p-3">
                        <p className="text-sm font-medium">{event.summary}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{new Date(event.detectedAt).toLocaleString()}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {event.matches.map((match) => (
                            <Badge key={`${event.telemetryEventId}-${match.indicatorId}`} variant="outline">
                              {match.title}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{integrationBadges.jiraConnection ?? "Jira connection"}</CardTitle>
        </CardHeader>
        <CardContent>
          {integrationQuery.isLoading ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} />
                Enable Jira sync for qualifying approvals
              </label>
              <Field label="Base URL">
                <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.baseUrl} onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://yourcompany.atlassian.net" />
              </Field>
              <Field label="Project key">
                <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.projectKey} onChange={(event) => setForm((current) => ({ ...current, projectKey: event.target.value }))} placeholder="AI" />
              </Field>
              <Field label="User email">
                <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.userEmail} onChange={(event) => setForm((current) => ({ ...current, userEmail: event.target.value }))} />
              </Field>
              <Field label="API token">
                <input type="password" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.apiToken} onChange={(event) => setForm((current) => ({ ...current, apiToken: event.target.value }))} />
              </Field>
              <Field label="Issue type">
                <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.issueType} onChange={(event) => setForm((current) => ({ ...current, issueType: event.target.value }))} />
              </Field>
              <Field label="Labels (comma separated)">
                <input className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.labels} onChange={(event) => setForm((current) => ({ ...current, labels: event.target.value }))} />
              </Field>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save integration"}</Button>
            <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>{testMutation.isPending ? "Testing..." : "Test connection"}</Button>
          </div>
          {testResult ? <div className="mt-3 rounded-md border bg-muted/30 p-3 text-sm">{testResult}</div> : null}
          {integrationQuery.data ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm text-muted-foreground">
              <div className="rounded-md border p-3">Last tested: {integrationQuery.data.lastTestedAt ? new Date(integrationQuery.data.lastTestedAt).toLocaleString() : "Never"}</div>
              <div className="rounded-md border p-3">Last sync: {integrationQuery.data.lastSyncAt ? new Date(integrationQuery.data.lastSyncAt).toLocaleString() : "No workflow tickets created yet"}</div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{integrationBadges.eventStream ?? "Governance event stream"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {governanceEventsQuery.isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard
                    title="Webhook status"
                    value={governanceEventsQuery.data?.status.webhookConfigured ? "Configured" : "Not configured"}
                    icon={Radio}
                  />
                  <InfoCard
                    title="Destinations"
                    value={String(governanceEventsQuery.data?.status.connectorCount ?? 0)}
                    icon={PlugZap}
                  />
                  <InfoCard
                    title="Background jobs"
                    value={governanceEventsQuery.data?.status.backgroundJobsEnabled ? "Enabled" : "Disabled"}
                    icon={Workflow}
                  />
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Destinations: {(governanceEventsQuery.data?.status.destinationLabels ?? []).join(", ") || "No governance event webhook configured"}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => eventTestMutation.mutate()} disabled={eventTestMutation.isPending}>
                    {eventTestMutation.isPending ? "Queueing..." : "Queue test event"}
                  </Button>
                  <Badge variant="outline">Events: incident, workflow, policy, automation</Badge>
                </div>
                {eventTestResult ? <div className="rounded-md border bg-muted/30 p-3 text-sm">{eventTestResult}</div> : null}
                <div className="space-y-2">
                  {(governanceEventsQuery.data?.events ?? []).slice(0, 6).map((event) => (
                    <div key={event.id} className="rounded-md border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{event.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{event.summary}</p>
                        </div>
                        <Badge variant={event.severity === "critical" ? "destructive" : event.severity === "warning" ? "secondary" : "outline"}>
                          {event.eventType}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                        <span>{new Date(event.createdAt).toLocaleString()}</span>
                        {event.href ? (
                          <a href={event.href} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                            Open
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
          <CardTitle className="text-sm font-semibold">{integrationBadges.remediationHooks ?? "Automated remediation hooks"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {automationSummaryQuery.isLoading ? (
              <Skeleton className="h-44 w-full" />
            ) : (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <InfoCard title="Open critical incidents" value={String(automationSummaryQuery.data?.totals.openCriticalIncidents ?? 0)} icon={Zap} />
                  <InfoCard title="Breached incident SLAs" value={String(automationSummaryQuery.data?.totals.breachedIncidents ?? 0)} icon={Workflow} />
                  <InfoCard title="Stale workflows" value={String(automationSummaryQuery.data?.totals.staleWorkflows ?? 0)} icon={PlugZap} />
                </div>
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Execution mode: <span className="font-medium text-foreground">{automationSummaryQuery.data?.runMode ?? "assistive"}</span>
                </div>
                <div className="space-y-2">
                  {(automationSummaryQuery.data?.actions ?? []).length === 0 ? (
                    <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                      No remediation actions are queued right now.
                    </div>
                  ) : (
                    (automationSummaryQuery.data?.actions ?? []).map((action) => (
                      <div key={action.key} className="rounded-md border p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{action.title}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{action.summary}</p>
                          </div>
                          <Badge variant={action.severity === "critical" ? "destructive" : "secondary"}>
                            {action.targetCount}
                          </Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Button onClick={() => automationRunMutation.mutate()} disabled={automationRunMutation.isPending}>
                  {automationRunMutation.isPending ? "Running sweep..." : "Run remediation sweep"}
                </Button>
                {automationResult ? <div className="rounded-md border bg-muted/30 p-3 text-sm">{automationResult}</div> : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{integrationBadges.automationBuilder ?? "Automation builder"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!automationConfigDraft ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Execution mode</p>
                <div className="flex flex-wrap gap-2">
                  {governanceAutomationRunModes.map((mode) => (
                    <Button
                      key={mode}
                      type="button"
                      size="sm"
                      variant={automationConfigDraft.runMode === mode ? "default" : "outline"}
                      onClick={() =>
                        setAutomationConfigDraft((current) => (current ? { ...current, runMode: mode } : current))
                      }
                    >
                      {mode}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Manual keeps sweeps operator-triggered, assistive keeps human review in the loop, and auto marks the org ready for unattended governance sweeps.
                </p>
              </div>

              <div className="grid gap-3 xl:grid-cols-3">
                {governanceAutomationRuleKeys.map((ruleKey) => {
                  const rule = automationConfigDraft.rules.find((entry) => entry.key === ruleKey);
                  if (!rule) return null;
                  return (
                    <div key={ruleKey} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{governanceAutomationRuleLabels[ruleKey]}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{rule.description}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(event) =>
                            setAutomationConfigDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    rules: current.rules.map((entry) =>
                                      entry.key === ruleKey ? { ...entry, enabled: event.target.checked } : entry,
                                    ),
                                  }
                                : current,
                            )
                          }
                        />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <label className="space-y-1 text-xs">
                          <span className="font-medium">Minimum severity</span>
                          <select
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={rule.minSeverity}
                            onChange={(event) =>
                              setAutomationConfigDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      rules: current.rules.map((entry) =>
                                        entry.key === ruleKey
                                          ? {
                                              ...entry,
                                              minSeverity: event.target.value as "critical" | "high" | "medium",
                                            }
                                          : entry,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          >
                            <option value="critical">critical</option>
                            <option value="high">high</option>
                            <option value="medium">medium</option>
                          </select>
                        </label>
                        <label className="space-y-1 text-xs">
                          <span className="font-medium">Stale days</span>
                          <input
                            type="number"
                            min={0}
                            max={30}
                            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                            value={rule.staleDays}
                            onChange={(event) =>
                              setAutomationConfigDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      rules: current.rules.map((entry) =>
                                        entry.key === ruleKey
                                          ? {
                                              ...entry,
                                              staleDays: Number.isFinite(Number(event.target.value))
                                                ? Math.max(0, Math.min(30, Number(event.target.value)))
                                                : entry.staleDays,
                                            }
                                          : entry,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => automationConfigMutation.mutate()} disabled={automationConfigMutation.isPending}>
                  {automationConfigMutation.isPending ? "Saving..." : "Save automation builder"}
                </Button>
                <Button variant="outline" onClick={() => automationRunMutation.mutate()} disabled={automationRunMutation.isPending}>
                  {automationRunMutation.isPending ? "Running..." : "Run with current config"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
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

function InfoCard({ title, value, icon: Icon }: { title: string; value: string; icon: typeof PlugZap }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <div className="text-xs font-medium text-muted-foreground">{title}</div>
          <div className="mt-1 text-lg font-semibold">{value}</div>
        </div>
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  );
}
