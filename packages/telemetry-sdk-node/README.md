# @ai-control-tower/telemetry-sdk-node

Typed Node SDK for posting telemetry events into the AI Control Tower SDK ingest endpoint.

## Install

Internal repository usage:

```bash
npm install file:packages/telemetry-sdk-node
```

Registry usage after publishing:

```bash
npm install @ai-control-tower/telemetry-sdk-node
```

## Example

```ts
import { AiControlTowerTelemetryClient } from "@ai-control-tower/telemetry-sdk-node";

const client = new AiControlTowerTelemetryClient({
  baseUrl: "https://your-control-tower.example.com",
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
