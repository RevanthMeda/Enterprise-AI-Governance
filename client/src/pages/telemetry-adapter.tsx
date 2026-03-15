import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/api-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type TelemetryAdapter = {
  id: string;
  organizationId: string;
  enabled: boolean;
  hasActiveKey: boolean;
  keyPrefix: string | null;
  allowedGateways: string[];
  lastUsedAt: string | null;
  lastRotatedAt: string | null;
  ingestPath: string;
  headerName: string;
};

type RotatedKeyResponse = {
  adapter: TelemetryAdapter;
  plainTextKey: string;
};

export default function TelemetryAdapterPage() {
  const { toast } = useToast();
  const [draftGateways, setDraftGateways] = useState("");
  const [lastIssuedKey, setLastIssuedKey] = useState<string | null>(null);

  const adapterQuery = useQuery<TelemetryAdapter>({
    queryKey: ["/api/organization/telemetry-adapter"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/organization/telemetry-adapter");
      const payload = await response.json();
      setDraftGateways(Array.isArray(payload.allowedGateways) ? payload.allowedGateways.join(", ") : "");
      return payload;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", "/api/organization/telemetry-adapter", {
        enabled: adapterQuery.data?.enabled ?? true,
        allowedGateways: parseCsv(draftGateways),
      });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-adapter"] });
      toast({ title: "Telemetry adapter updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update telemetry adapter", description: error.message, variant: "destructive" });
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/organization/telemetry-adapter/rotate-key");
      return response.json() as Promise<RotatedKeyResponse>;
    },
    onSuccess: async (payload) => {
      setLastIssuedKey(payload.plainTextKey);
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-adapter"] });
      toast({ title: "Telemetry ingest key rotated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to rotate ingest key", description: error.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("PATCH", "/api/organization/telemetry-adapter", { enabled });
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/organization/telemetry-adapter"] });
    },
  });

  const adapter = adapterQuery.data;
  const endpointUrl = useMemo(() => {
    return resolveApiUrl(adapter?.ingestPath ?? "/api/telemetry/sdk-ingest");
  }, [adapter?.ingestPath]);

  if (adapterQuery.isLoading || !adapter) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const curlExample = `curl -X POST ${endpointUrl} \\
  -H "${adapter.headerName}: ${lastIssuedKey ?? "<rotate-to-generate>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "gateway": "gateway-prod",
    "eventType": "drift_alert",
    "severity": "warning",
    "driftScore": 7,
    "summary": "Drift exceeded expected range",
    "biasFlags": [],
    "metadata": {
      "latencyMs": 812,
      "overrideRate": 44,
      "errorRate": 3
    }
  }'`;

  const npmInstallExample = `npm install file:packages/telemetry-sdk-node`;

  const sdkExample = `import { AiControlTowerTelemetryClient } from "@ai-control-tower/telemetry-sdk-node";

const client = new AiControlTowerTelemetryClient({
  baseUrl: "https://your-control-tower.example.com",
  telemetryKey: process.env.AICT_TELEMETRY_KEY ?? "${lastIssuedKey ?? "<rotate-to-generate>"}",
  defaults: {
    gateway: "gateway-prod",
    provider: "openai",
    modelName: "gpt-4.1",
  },
});

await client.emitDriftAlert({
  systemId: "system-123",
  driftScore: 7,
  summary: "Drift exceeded expected range",
  metadata: {
    latencyMs: 812,
    overrideRate: 44,
  },
});`;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Telemetry Adapter</h1>
          <p className="text-sm text-muted-foreground">
            Issue ingest credentials for external gateways and SDKs that need to post model telemetry without an interactive session.
          </p>
        </div>
        <Badge variant="outline">{adapter.enabled ? "Adapter enabled" : "Adapter disabled"}</Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">SDK ingest configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Ingest endpoint</span>
                <Input value={endpointUrl} readOnly />
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Active key prefix</span>
                <Input value={adapter.keyPrefix ?? "No active key"} readOnly />
              </label>
            </div>

            <label className="space-y-1 text-sm">
              <span className="font-medium">Allowed gateways</span>
              <Input
                value={draftGateways}
                onChange={(event) => setDraftGateways(event.target.value)}
                placeholder="gateway-prod, llm-proxy-eu"
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <Button
                variant={adapter.enabled ? "outline" : "default"}
                onClick={() => toggleMutation.mutate(!adapter.enabled)}
                disabled={toggleMutation.isPending}
              >
                {adapter.enabled ? "Disable adapter" : "Enable adapter"}
              </Button>
              <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Saving..." : "Save adapter"}
              </Button>
              <Button onClick={() => rotateMutation.mutate()} disabled={rotateMutation.isPending}>
                {rotateMutation.isPending ? "Rotating..." : "Rotate ingest key"}
              </Button>
            </div>

            {lastIssuedKey ? (
              <div className="rounded-lg border border-dashed p-4 text-sm">
                <p className="font-medium">New ingest key</p>
                <p className="mt-2 break-all font-mono text-xs">{lastIssuedKey}</p>
                <p className="mt-2 text-muted-foreground">
                  This value is only shown once. Store it in your gateway or SDK secret manager.
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Adapter status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Last rotated: {adapter.lastRotatedAt ? new Date(adapter.lastRotatedAt).toLocaleString() : "Never"}</p>
            <p>Last used: {adapter.lastUsedAt ? new Date(adapter.lastUsedAt).toLocaleString() : "Never"}</p>
            <p>Key present: {adapter.hasActiveKey ? "Yes" : "No"}</p>
            <p>Header name: <span className="font-mono">{adapter.headerName}</span></p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Gateway example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-6">{curlExample}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Node SDK package</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Use the typed Node package in this repository for gateway or sidecar integrations that should post telemetry without managing raw HTTP requests.</p>
            <p>Package path: <span className="font-mono text-xs">packages/telemetry-sdk-node</span></p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Install</p>
            <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-6">{npmInstallExample}</pre>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">TypeScript example</p>
            <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-6">{sdkExample}</pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function parseCsv(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
