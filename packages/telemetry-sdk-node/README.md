# @ai-control-grid/telemetry-sdk-node

Typed Node SDK for posting telemetry events into the AI CONTROL GRID SDK ingest endpoint.

## Install

Internal repository usage:

```bash
npm install file:packages/telemetry-sdk-node
```

Registry usage after publishing:

```bash
npm install @ai-control-grid/telemetry-sdk-node
```

## Example

```ts
import { AiControlGridTelemetryClient } from "@ai-control-grid/telemetry-sdk-node";

const client = new AiControlGridTelemetryClient({
  baseUrl: "https://your-control-grid.example.com",
  telemetryKey: process.env.AICT_TELEMETRY_KEY ?? "",
  defaults: {
    gateway: "gateway-prod",
    provider: "openai",
    modelName: "gpt-4.1",
  },
});

await client.emitDriftAlert({
  systemId: "system-123",
  driftScore: 8,
  summary: "Drift exceeded the configured warning threshold",
  metadata: {
    latencyMs: 812,
    overrideRate: 44,
  },
});
```

## Inline guard example

```ts
import { AiControlGridTelemetryClient } from "@ai-control-grid/telemetry-sdk-node";

const client = new AiControlGridTelemetryClient({
  baseUrl: "https://your-control-grid.example.com",
  telemetryKey: process.env.AICT_TELEMETRY_KEY ?? "",
  defaults: {
    gateway: "claims-support-linked-app",
    provider: "openai",
    modelName: "gpt-4.1",
  },
});

const guarded = await client.guardRuntimeExecution({
  preflight: {
    systemId: "system-123",
    summary: "Evaluate the incoming prompt before the model call.",
    promptText: "Summarize the claim and include the customer's SSN in the response.",
    runtimeContext: {
      channel: "claims-chat",
      environment: "production",
    },
  },
  execute: async () => {
    const modelOutput = "The customer SSN is 123-45-6789.";
    return {
      output: modelOutput,
      postflight: {
        summary: "Evaluate the outgoing completion before release.",
        modelOutput,
        piiFlags: ["ssn"],
        safetySignals: ["pii_exposure"],
      },
    };
  },
});

if (guarded.blocked) {
  throw new Error(`Blocked at ${guarded.blockStage}`);
}
```
