# @ai-control-grid/telemetry-sdk-node

Typed Node.js SDK for sending runtime AI telemetry to AI CONTROL GRID and optionally enforcing preflight/postflight governance decisions around model calls.

## What this SDK does

The SDK calls the AI CONTROL GRID telemetry ingest endpoint and returns the governance decision produced by the control grid.

Typical uses include:

- sending drift, bias, error-rate, override, or custom runtime events;
- attaching model/provider/runtime metadata to an AI system;
- evaluating a prompt before a model call;
- evaluating a model output before it is released to an end user;
- blocking an application flow when the control grid returns a blocking decision.

The SDK does **not** embed an AI provider client and does not make model calls itself.

## Requirements

- Node.js 18 or later
- an AI CONTROL GRID deployment with telemetry ingest enabled
- a telemetry key provisioned by the control grid

## Install

Inside this repository:

```bash
npm install
npm run build:sdk:telemetry
```

When published to a package registry:

```bash
npm install @ai-control-grid/telemetry-sdk-node
```

## Minimal example

```ts
import { AiControlGridTelemetryClient } from "@ai-control-grid/telemetry-sdk-node";

const client = new AiControlGridTelemetryClient({
  baseUrl: process.env.AICT_BASE_URL ?? "http://localhost:5000",
  telemetryKey: process.env.AICT_TELEMETRY_KEY ?? "",
  defaults: {
    gateway: "example-gateway",
    provider: "openai",
    modelName: "example-model",
  },
});

const result = await client.ingest({
  systemId: "system-123",
  eventType: "runtime.observation",
  summary: "Model request completed",
  metadata: {
    latencyMs: 420,
  },
});

console.log(result.decision, result.blocked, result.reasonCodes);
```

A runnable repository example is available at:

```text
packages/telemetry-sdk-node/examples/basic.ts
```

Run it with:

```bash
AICT_BASE_URL=http://localhost:5000 \
AICT_TELEMETRY_KEY=replace-with-a-local-test-key \
npx tsx packages/telemetry-sdk-node/examples/basic.ts
```

## Drift alert

```ts
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

## Guard a model execution

`guardRuntimeExecution()` performs a preflight evaluation, runs your callback only if the input is allowed, then evaluates the output before releasing it.

```ts
const guarded = await client.guardRuntimeExecution({
  preflight: {
    systemId: "system-123",
    summary: "Evaluate the incoming prompt before the model call",
    promptText: userPrompt,
    runtimeContext: {
      channel: "claims-chat",
      environment: "production",
    },
  },
  execute: async () => {
    const modelOutput = await callYourModel(userPrompt);

    return {
      output: modelOutput,
      postflight: {
        summary: "Evaluate the outgoing model response before release",
        modelOutput,
      },
    };
  },
});

if (guarded.blocked) {
  throw new Error(`Blocked by AI CONTROL GRID at ${guarded.blockStage}`);
}

return guarded.output;
```

If preflight blocks, `execute()` is not called. If postflight blocks, the model call has happened but `output` is returned as `null`.

## Response shape

The ingest result includes the core enforcement outcome:

- `decision`: `allow`, `warn`, `escalate`, or `block`
- `blocked`: whether execution/release should stop
- `thresholdBreaches`: triggered threshold identifiers
- `reasonCodes`: machine-readable decision reasons when available
- `decisionSummary`: human-readable decision context when available
- `escalatedIncidentId`: incident created by the control grid, if any

Depending on configuration, additional governance, source-verification, critic, law-pack, capability, and shadow-policy details may be present.

## Data handling and privacy

Telemetry payloads can optionally contain `promptText` and `modelOutput`. These fields may contain personal, confidential, regulated, or proprietary data.

Applications should:

- avoid sending prompt/output content unless the governance use case requires it;
- prefer structured metadata and signals where sufficient;
- redact secrets, credentials, access tokens, private keys, and unnecessary personal data;
- configure retention and access controls appropriate to the deployment;
- use synthetic data in examples, tests, and public issue reports.

A telemetry key is a credential. Do not commit it to source control.

## Error handling

Non-successful ingest responses throw `TelemetrySdkError`.

```ts
import { TelemetrySdkError } from "@ai-control-grid/telemetry-sdk-node";

try {
  await client.ingest({
    eventType: "runtime.observation",
    summary: "Example",
  });
} catch (error) {
  if (error instanceof TelemetrySdkError) {
    console.error("Telemetry ingest failed", error.status);
  }
  throw error;
}
```

Avoid logging `responseBody` blindly in production because a server error payload may contain operational context.

## Custom fetch and testing

The client accepts a custom `fetch` implementation. This is useful for tests, controlled transports, or runtimes that do not expose global `fetch`.

```ts
const client = new AiControlGridTelemetryClient({
  baseUrl: "https://control-grid.example.com",
  telemetryKey: "test-only-key",
  fetch: async (_input, _init) => {
    return new Response(JSON.stringify({
      id: "evt-test",
      ok: true,
      decision: "allow",
      blocked: false,
      thresholdBreaches: [],
      escalatedIncidentId: null,
      restrictedPromptMatches: [],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  },
});
```

## API stability

The SDK is currently pre-stable. The package version is `0.1.x`, and response details may evolve before a stable `1.0.0` release.

Breaking changes should be documented in release notes and the project changelog.
