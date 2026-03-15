import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, PlugZap, Workflow } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const integrationQuery = useQuery<JiraIntegration | null>({ queryKey: ["/api/organization/jira-integration"] });
  const [form, setForm] = useState({
    enabled: false,
    baseUrl: "",
    projectKey: "",
    userEmail: "",
    apiToken: "",
    issueType: "Task",
    labels: "ai-control-tower,high-risk",
  });
  const [testResult, setTestResult] = useState<string | null>(null);

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

  const automationState = useMemo(() => {
    if (!form.enabled) return "Disabled";
    if (!form.baseUrl || !form.projectKey || !form.userEmail || !form.apiToken) return "Configuration incomplete";
    return "High-risk approvals will open Jira tickets";
  }, [form]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect AI Control Tower to Jira so high-risk approvals and portfolio escalations open tickets automatically.
          </p>
        </div>
        <Badge variant="outline">First external connector</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <InfoCard title="Connector" value="Jira Cloud" icon={PlugZap} />
        <InfoCard title="Automation rule" value="High priority or high-risk workflow" icon={Workflow} />
        <InfoCard title="Current state" value={automationState} icon={Link2} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Jira connection</CardTitle>
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
