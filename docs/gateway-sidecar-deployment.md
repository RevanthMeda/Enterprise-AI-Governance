# Gateway Sidecar Deployment

## Purpose

This package lets a customer deploy AI CONTROL GRID as a containerized inline gateway inside their own environment.

The container exposes:

- `/api/gateway/openai/v1/chat/completions`
- `/api/gateway/openai/v1/responses`
- `/api/gateway/anthropic/v1/messages`
- `/api/gateway/gemini/v1beta/models/:model:generateContent`
- `/api/gateway/azure-openai/openai/deployments/:deployment/chat/completions`
- `/api/gateway/vertex-ai/v1/projects/:projectId/locations/:location/publishers/:publisher/models/:model:generateContent`
- `/api/gateway/bedrock/:region/model/:modelId/converse`
- `/api/gateway/providers/:provider/v1/chat/completions`
- `/api/gateway/providers/:provider/v1/responses`

## What the sidecar controls

- prompt inflow before model execution
- response outflow before user delivery
- tool allowlists
- tool argument policy
- tenant-scoped upstream provider credentials

## Required environment

- `DATABASE_URL`
- `SESSION_SECRET`
- `CONTROL_TOWER_VAULT_SECRET`

Optional provider fallbacks:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_BASE_URL`
- `AZURE_OPENAI_API_VERSION`
- `VERTEX_AI_ACCESS_TOKEN`
- `VERTEX_AI_BASE_URL`
- `BEDROCK_AWS_ACCESS_KEY_ID`
- `BEDROCK_AWS_SECRET_ACCESS_KEY`
- `BEDROCK_AWS_SESSION_TOKEN`
- `BEDROCK_AWS_REGION`

## Build locally

```bash
npm run docker:gateway:build
```

## Run with Docker Compose

```bash
docker compose -f deploy/sidecar/docker-compose.yml up --build
```

## Deployment model

Use one container per customer environment or tenant boundary.

Recommended pattern:

1. deploy the sidecar into the customer network
2. bind a telemetry key to that tenant or system
3. store upstream provider credentials in the adapter vault
4. point the customer AI application to the sidecar URL instead of the raw provider URL

## Security notes

- provider keys can be stored in the adapter vault and are encrypted at rest
- raw prompt/output storage is still controlled by the adapter collection profile
- model allowlists and tool argument policies are enforced per tenant
