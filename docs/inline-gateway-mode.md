# Inline Gateway Mode

## Purpose

This mode turns AI CONTROL GRID from a monitoring endpoint into an inline enforcement layer.

Instead of asking the customer application to send a telemetry event after it already handled the model call, the application points model traffic at AI CONTROL GRID first.

That means AI CONTROL GRID can:

- inspect the incoming prompt before the model call
- decide whether the model call is allowed to execute
- inspect the outgoing model response before user delivery
- decide whether the response may be released
- record both stages in telemetry, incidents, audit, and reassessment flows

## Current scope

The current gateway supports:

- `POST /api/gateway/openai/v1/chat/completions`
- `POST /api/gateway/openai/v1/responses`
- `POST /api/gateway/anthropic/v1/messages`
- `POST /api/gateway/gemini/v1beta/models/:model:generateContent`
- `POST /api/gateway/azure-openai/openai/deployments/:deployment/chat/completions`
- `POST /api/gateway/vertex-ai/v1/projects/:projectId/locations/:location/publishers/:publisher/models/:model:generateContent`
- `POST /api/gateway/bedrock/:region/model/:modelId/converse`
- `POST /api/gateway/providers/:provider/v1/chat/completions`
- `POST /api/gateway/providers/:provider/v1/responses`

Current limitations:

- buffered streaming support is currently implemented for OpenAI routes
- tool calls are now governed by adapter-scoped allowlists
- tool-specific business policy is still coarse and should later move to a richer action-policy model

## Authentication model

Two credentials can be involved in the same request.

### 1. AI CONTROL GRID telemetry key

Header:

```text
x-telemetry-key: actl_sdk_...
```

This authenticates the request to AI CONTROL GRID and binds it to:

- an organization
- an optional default system
- a telemetry collection profile

### 2. Upstream OpenAI provider key

Header:

```text
Authorization: Bearer sk-...
```

AI CONTROL GRID forwards this upstream to OpenAI.

If you do not want to pass the provider key on each request, store it in the telemetry adapter upstream provider vault. Stored provider keys and custom header values are encrypted at rest with `CONTROL_TOWER_VAULT_SECRET`; API responses expose only whether credentials exist and the custom header names.

Stored credentials and stored custom headers are bound to the exact origin that was configured when they were entered. Changing that origin requires re-entering or clearing the credentials. Environment credentials always use the provider's canonical environment-configured endpoint and ignore tenant destination overrides. If a caller overrides a provider base URL with an `x-*-base-url` header, that same request must supply its own provider credential. For Bedrock, both the access-key ID and secret access key must be supplied together. Stored credentials and stored custom headers are never combined with a request-level destination override.

All provider endpoints must use HTTPS. Before dispatch, AI CONTROL GRID rejects local and metadata hosts, private or reserved DNS answers, cross-origin path overrides, redirects, oversized responses, and requests that exceed the bounded deadline.

## How the request flow works

### Step 1. The customer app sends the request to AI CONTROL GRID

The customer app points its OpenAI-compatible base URL to:

```text
https://YOUR_CONTROL_TOWER_HOST/api/gateway/openai/v1
```

Then the app sends normal OpenAI-compatible requests to:

- `/chat/completions`
- `/responses`

### Step 2. AI CONTROL GRID runs preflight

AI CONTROL GRID extracts the prompt from the request body and creates a telemetry event:

- `eventType = runtime.preflight`

If policy blocks the prompt:

- the model call never executes
- the proxy returns a blocked response immediately

### Step 3. AI CONTROL GRID forwards the request upstream

If preflight allows the request:

- AI CONTROL GRID forwards it to OpenAI

### Step 4. AI CONTROL GRID runs postflight

After OpenAI returns a response, AI CONTROL GRID extracts the output text and creates:

- `eventType = runtime.evaluation`

If policy blocks the output:

- the original response is withheld
- the client receives a blocked response instead

If policy allows the output:

- the original provider response is returned to the client

## Optional `_controlTower` metadata

The proxy accepts an extra request field named `_controlTower`.

This field is removed before the upstream provider call.

Use it to pass governance context such as:

- `systemId`
- `gateway`
- `runtimeContext`
- `metadata`
- `severity`
- `biasFlags`
- `piiFlags`
- `safetySignals`
- `toxicityScore`
- `driftScore`
- `correlationId`

## Tool and action control

The telemetry adapter can now define:

- `allowedToolNames`
- `toolArgumentPolicy`

If the inline gateway sees requested or returned tool calls outside that allowlist:

- preflight or postflight is marked as a security violation
- the request is blocked
- the event is recorded in telemetry and audit

This is how the platform can enforce:

- “Only these actions may be used by this company”
- “This AI system may summarize and search, but may not trigger payments or write data”

### Tool argument policy

The telemetry adapter can also define per-tool argument constraints.

Example:

```json
{
  "search_claim": {
    "allowedArgumentKeys": ["claimId", "customerId"],
    "blockedArgumentKeys": ["ssn"],
    "maxStringLength": 500
  },
  "create_case_note": {
    "allowedArgumentKeys": ["claimId", "note"],
    "blockedValuePatterns": ["password", "ignore previous instructions"],
    "maxStringLength": 1000
  }
}
```

If an allowed tool returns malformed JSON arguments, unexpected argument keys, blocked argument keys, blocked value patterns, or oversized string values:

- the postflight stage is marked as a security violation
- the response is blocked before delivery
- the event is recorded in telemetry, incidents, and audit

The tool argument policy can also enforce type-level rules:

```json
{
  "create_payment": {
    "argumentSchema": {
      "amount": { "type": "number", "required": true, "minimum": 1, "maximum": 10000 },
      "currency": { "type": "string", "required": true, "enumValues": ["USD", "EUR"] },
      "customerId": { "type": "string", "required": true, "minLength": 5, "maxLength": 64 }
    }
  }
}
```

If the model returns the wrong type, misses a required field, or produces out-of-range values, the gateway blocks the response before delivery.

## Broad provider coverage

The built-in routes cover:

- OpenAI
- Anthropic
- Gemini
- Azure OpenAI
- Vertex AI
- AWS Bedrock

The generic provider routes cover any provider that exposes an OpenAI-compatible API surface, as long as you configure:

- provider name
- base URL
- API key
- optional headers
- optional model allowlist

Example providers that usually fit this model include hosted gateways and OpenAI-compatible vendors such as:

- Groq
- Mistral-compatible gateways
- Together AI
- Fireworks
- DeepSeek-compatible gateways
- OpenRouter
- xAI-compatible gateways

### Native provider notes

The native provider routes exist because these providers do not fit cleanly into the generic OpenAI-compatible shape:

- `Azure OpenAI`:
  - uses deployment-scoped paths
  - uses `api-key` authentication
  - requires an API version
- `Vertex AI`:
  - uses Google-style project and location paths
  - typically uses bearer access tokens
- `AWS Bedrock`:
  - uses AWS SigV4 request signing
  - uses region-aware model endpoints

Use the native routes for those providers. Use the generic provider routes for OpenAI-compatible vendors.

## Jailbreak and prompt-injection resistance

The current enforcement layer now treats common manipulation patterns as restricted prompt signals, including phrases like:

- `ignore previous instructions`
- `reveal system prompt`
- `developer message`
- `jailbreak`
- `bypass safety`

These patterns are not sufficient on their own for perfect security, but they materially improve baseline resistance.

For stronger protection, the next step is model-assisted prompt-injection classification plus action-level policy.

Example:

```json
{
  "model": "gpt-4.1",
  "messages": [
    { "role": "user", "content": "Summarize this claim and draft a response." }
  ],
  "_controlTower": {
    "systemId": "af7f283e-5101-475d-b7a7-c06594537a6f",
    "gateway": "voice-agent-inline-proxy",
    "runtimeContext": {
      "channel": "voice-agent",
      "region": "us",
      "environment": "production"
    },
    "metadata": {
      "surface": "ivr"
    }
  }
}
```

If the telemetry adapter is already bound to a default system, `systemId` can be omitted.

## Example with `curl`

### Chat completions

```bash
curl -X POST https://YOUR_CONTROL_TOWER_HOST/api/gateway/openai/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "x-telemetry-key: actl_sdk_..." \
  -H "Authorization: Bearer sk-..." \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      { "role": "user", "content": "Summarize this customer complaint." }
    ],
    "_controlTower": {
      "gateway": "claims-inline-proxy",
      "runtimeContext": {
        "channel": "claims-chat",
        "environment": "production"
      }
    }
  }'
```

### Responses API

```bash
curl -X POST https://YOUR_CONTROL_TOWER_HOST/api/gateway/openai/v1/responses \
  -H "Content-Type: application/json" \
  -H "x-telemetry-key: actl_sdk_..." \
  -H "Authorization: Bearer sk-..." \
  -d '{
    "model": "gpt-4.1",
    "input": "Summarize this customer complaint.",
    "_controlTower": {
      "gateway": "claims-inline-proxy",
      "runtimeContext": {
        "channel": "claims-chat",
        "environment": "production"
      }
    }
  }'
```

## Response behavior

### If allowed

AI CONTROL GRID returns the upstream OpenAI JSON response and adds headers:

- `x-aict-correlation-id`
- `x-aict-preflight-decision`
- `x-aict-decision`
- `x-aict-telemetry-event-id`

### If blocked

AI CONTROL GRID returns a blocked JSON response like:

```json
{
  "ok": false,
  "stage": "input",
  "correlationId": "corr_123",
  "id": "evt_123",
  "decision": "block",
  "blocked": true,
  "thresholdBreaches": [
    "restricted_prompt_detected",
    "pii_detected"
  ],
  "escalatedIncidentId": "inc_456",
  "restrictedPromptMatches": [
    "social security number"
  ]
}
```

## Why this is stronger than post-facto telemetry

With ordinary telemetry mode:

- the application tells AI CONTROL GRID what happened

With inline gateway mode:

- AI CONTROL GRID sees the actual prompt
- AI CONTROL GRID sees the actual provider response
- AI CONTROL GRID can stop the flow before damage occurs

That is the stronger control-grid model.

## What still needs to be built

Further production enhancements are:

1. streaming support for the non-OpenAI provider routes
2. richer tool/action-specific policy definitions
3. signed gateway-to-platform trust for customer-managed edge proxies
