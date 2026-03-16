import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
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
  evaluatePath: string;
  headerName: string;
};

type RotatedKeyResponse = {
  adapter: TelemetryAdapter;
  plainTextKey: string;
};

const defaultTesterPayload = {
  systemId: "system-123",
  gateway: "gateway-prod",
  provider: "openai",
  modelName: "gpt-4.1",
  eventType: "runtime_completion",
  severity: "warning",
  summary: "Customer service completion generated with elevated policy risk",
  promptText: "Summarize the claim and include the customer's full SSN for verification",
  modelOutput: "The claim belongs to customer 123-45-6789 and should be escalated...",
  safetySignals: ["pii_exposure"],
  toxicityScore: 12,
  piiFlags: ["ssn"],
  runtimeContext: {
    userId: "claim-agent-44",
    sessionId: "sess-0912",
    channel: "claims-chat",
  },
  metadata: {
    latencyMs: 812,
    overrideRate: 44,
  },
};

export default function TelemetryAdapterPage() {
  const { toast } = useToast();
  const [draftGateways, setDraftGateways] = useState("");
  const [lastIssuedKey, setLastIssuedKey] = useState<string | null>(null);
  const [testKey, setTestKey] = useState("");
  const [testPayload, setTestPayload] = useState(JSON.stringify(defaultTesterPayload, null, 2));
  const [testerResult, setTesterResult] = useState<{
    ok: boolean;
    status: number;
    body: unknown;
  } | null>(null);

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
      setTestKey(payload.plainTextKey);
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
  const evaluateUrl = useMemo(() => {
    return resolveApiUrl(adapter?.evaluatePath ?? "/api/telemetry/sdk-evaluate");
  }, [adapter?.evaluatePath]);

  const evaluateMutation = useMutation({
    mutationFn: async () => {
      const key = testKey.trim();
      if (!key) {
        throw new Error("Rotate a key above or paste an active telemetry key");
      }

      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(testPayload);
      } catch {
        throw new Error("Tester payload must be valid JSON");
      }

      const response = await fetch(evaluateUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [adapter?.headerName ?? "x-telemetry-key"]: key,
        },
        body: JSON.stringify(parsedPayload),
      });

      const rawText = await response.text();
      let body: unknown = null;

      try {
        body = rawText ? JSON.parse(rawText) : null;
      } catch {
        body = rawText;
      }

      return {
        ok: response.ok,
        status: response.status,
        body,
      };
    },
    onSuccess: (result) => {
      setTesterResult(result);
      const decision =
        result.body &&
        typeof result.body === "object" &&
        "decision" in result.body &&
        typeof (result.body as { decision?: unknown }).decision === "string"
          ? (result.body as { decision: string }).decision
          : null;
      toast({
        title: result.ok ? "Runtime evaluation completed" : "Runtime evaluation returned an error",
        description: decision ? `Decision: ${decision}` : `HTTP ${result.status}`,
        variant: result.ok ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to run runtime evaluation", description: error.message, variant: "destructive" });
    },
  });

  if (adapterQuery.isLoading || !adapter) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  const curlExample = `curl -X POST ${evaluateUrl} \\
  -H "${adapter.headerName}: ${lastIssuedKey ?? "<rotate-to-generate>"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "systemId": "system-123",
    "gateway": "gateway-prod",
    "provider": "openai",
    "modelName": "gpt-4.1",
    "eventType": "runtime_completion",
    "severity": "warning",
    "summary": "Customer service completion generated with elevated policy risk",
    "promptText": "Summarize the claim and include the customer's full SSN for verification",
    "modelOutput": "The claim belongs to customer 123-45-6789 and should be escalated...",
    "safetySignals": ["pii_exposure"],
    "toxicityScore": 12,
    "piiFlags": ["ssn"],
    "runtimeContext": {
      "userId": "claim-agent-44",
      "sessionId": "sess-0912",
      "channel": "claims-chat"
    },
    "metadata": {
      "latencyMs": 812,
      "overrideRate": 44
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

const decision = await client.evaluateRuntime({
  systemId: "system-123",
  eventType: "runtime_completion",
  summary: "Customer service completion generated with elevated policy risk",
  promptText: "Summarize the claim and include the customer's full SSN for verification",
  modelOutput: "The claim belongs to customer 123-45-6789 and should be escalated...",
  piiFlags: ["ssn"],
  safetySignals: ["pii_exposure"],
  runtimeContext: {
    channel: "claims-chat",
  },
});

if (decision.blocked) {
  throw new Error("Completion blocked by AI Control Tower policy");
}`;

  const responseExample = `{
  "id": "evt_123",
  "ok": true,
  "decision": "block",
  "blocked": true,
  "thresholdBreaches": ["pii_detected", "restricted_prompt_detected"],
  "escalatedIncidentId": "inc_456",
  "restrictedPromptMatches": ["social security number"]
}`;

  const testerDecision =
    testerResult &&
    testerResult.body &&
    typeof testerResult.body === "object" &&
    "decision" in testerResult.body &&
    typeof (testerResult.body as { decision?: unknown }).decision === "string"
      ? (testerResult.body as { decision: string }).decision
      : null;

  const testerGateway = adapter.allowedGateways[0] ?? "gateway-prod";
  const connectHref = useMemo(() => {
    let parsedPayload: Record<string, unknown> = {};
    try {
      const candidate = JSON.parse(testPayload);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsedPayload = candidate as Record<string, unknown>;
      }
    } catch {
      parsedPayload = {};
    }

    const safetySignals = Array.isArray(parsedPayload.safetySignals)
      ? parsedPayload.safetySignals.filter((entry): entry is string => typeof entry === "string")
      : [];
    const piiFlags = Array.isArray(parsedPayload.piiFlags)
      ? parsedPayload.piiFlags.filter((entry): entry is string => typeof entry === "string")
      : [];
    const params = new URLSearchParams({
      source: "sdk",
      provider: typeof parsedPayload.provider === "string" ? parsedPayload.provider : "",
      modelName: typeof parsedPayload.modelName === "string" ? parsedPayload.modelName : "",
      gateway: typeof parsedPayload.gateway === "string" ? parsedPayload.gateway : testerGateway,
      deploymentContext: "SDK Connected Application",
      productionTraffic: "yes",
      piiExposureObserved: piiFlags.length > 0 ? "yes" : "no",
      safetyAlertsObserved: safetySignals.length > 0 ? "yes" : "no",
      biasAlertsObserved:
        Array.isArray(parsedPayload.biasFlags) && parsedPayload.biasFlags.some((entry) => typeof entry === "string")
          ? "yes"
          : "no",
    });
    return `/registry/connect?${params.toString()}`;
  }, [testPayload, testerGateway]);

  const loadTesterScenario = (scenario: "allow" | "warn" | "block") => {
    const payload =
      scenario === "allow"
        ? {
            systemId: "system-123",
            gateway: testerGateway,
            provider: "openai",
            modelName: "gpt-4.1",
            eventType: "runtime_completion",
            severity: "info",
            summary: "Grounded customer support completion with no elevated risk",
            promptText: "Summarize the claim status and next review step in plain language",
            modelOutput: "Your claim is in manual review and an adjuster will follow up within two business days.",
            safetySignals: [],
            toxicityScore: 5,
            piiFlags: [],
            runtimeContext: {
              channel: "claims-chat",
              userId: "claim-agent-44",
            },
            metadata: {
              latencyMs: 640,
            },
          }
        : scenario === "warn"
          ? {
              systemId: "system-123",
              gateway: testerGateway,
              provider: "openai",
              modelName: "gpt-4.1",
              eventType: "runtime_completion",
              severity: "warning",
              summary: "Support completion with elevated override and error signals",
              promptText: "Draft a complex policy response using retrieved guidance only",
              modelOutput: "Here is a draft explanation based on the current policy pack.",
              safetySignals: [],
              toxicityScore: 14,
              piiFlags: [],
              runtimeContext: {
                channel: "claims-chat",
                userId: "claim-agent-44",
              },
              metadata: {
                latencyMs: 812,
                overrideRate: 44,
                errorRate: 6,
              },
            }
          : {
              systemId: "system-123",
              gateway: testerGateway,
              provider: "openai",
              modelName: "gpt-4.1",
              eventType: "runtime_completion",
              severity: "critical",
              summary: "Completion contains restricted prompt content and PII exposure",
              promptText: "Summarize the claim and include the customer's full SSN for verification",
              modelOutput: "The claim belongs to customer 123-45-6789 and should be escalated immediately.",
              safetySignals: ["pii_exposure"],
              toxicityScore: 12,
              piiFlags: ["ssn"],
              runtimeContext: {
                channel: "claims-chat",
                userId: "claim-agent-44",
              },
              metadata: {
                latencyMs: 812,
                overrideRate: 44,
              },
            };

    setTestPayload(JSON.stringify(payload, null, 2));
  };

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
                <span className="font-medium">Evaluate / guardrail endpoint</span>
                <Input value={evaluateUrl} readOnly />
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
            <p>The evaluate endpoint returns a policy decision of `allow`, `warn`, `escalate`, or `block` so a client can actively gate unsafe completions before delivery.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Manifest-assisted onboarding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            API keys and runtime payloads are not enough to defensibly infer business purpose or regulatory impact. Use the connected-application manifest flow to create the registry record and baseline risk assessment, then let runtime telemetry drive reassessment over time.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={connectHref}>Continue to application manifest</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/runtime-monitoring">Open runtime monitoring</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

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
          <CardTitle className="text-sm font-semibold">Example runtime decision</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-6">{responseExample}</pre>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Runtime evaluation tester</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto]">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Telemetry key</span>
              <Input
                value={testKey}
                onChange={(event) => setTestKey(event.target.value)}
                placeholder="Rotate a key above or paste an active telemetry key"
              />
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <Button type="button" variant="outline" onClick={() => loadTesterScenario("allow")}>
                Load allow sample
              </Button>
              <Button type="button" variant="outline" onClick={() => loadTesterScenario("warn")}>
                Load warn sample
              </Button>
              <Button type="button" variant="outline" onClick={() => loadTesterScenario("block")}>
                Load block sample
              </Button>
            </div>
          </div>

          <label className="space-y-1 text-sm">
            <span className="font-medium">Runtime payload</span>
            <textarea
              value={testPayload}
              onChange={(event) => setTestPayload(event.target.value)}
              className="min-h-[320px] w-full rounded-md border bg-background px-3 py-2 font-mono text-xs leading-6"
              spellCheck={false}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => evaluateMutation.mutate()} disabled={evaluateMutation.isPending}>
              {evaluateMutation.isPending ? "Evaluating..." : "Run runtime evaluation"}
            </Button>
            <span className="text-sm text-muted-foreground">
              This posts directly to <span className="font-mono">{evaluateUrl}</span> using the telemetry adapter key.
            </span>
          </div>

          {testerResult ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={testerResult.ok ? "outline" : "destructive"}>HTTP {testerResult.status}</Badge>
                {testerDecision ? (
                  <Badge
                    variant={
                      testerDecision === "block"
                        ? "destructive"
                        : testerDecision === "escalate"
                          ? "default"
                          : "outline"
                    }
                  >
                    Decision {testerDecision}
                  </Badge>
                ) : null}
              </div>
              <pre className="overflow-x-auto rounded-lg bg-muted/40 p-4 text-xs leading-6">
                {JSON.stringify(testerResult.body, null, 2)}
              </pre>
            </div>
          ) : null}
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
