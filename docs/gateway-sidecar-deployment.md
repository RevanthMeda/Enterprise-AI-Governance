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
- `PASSWORD_RESET_SECRET` (dedicated, different from the session secret)
- `CONTROL_TOWER_VAULT_SECRET`
- `PUBLIC_APP_URL` (the real HTTPS frontend origin, with no path)
- `CORS_ALLOWED_ORIGINS` (exact HTTPS origins, including `PUBLIC_APP_URL`)

Generate separate long random secrets (at least 32 characters); never commit them.
Production startup also validates secret quality and origin/cookie configuration.
Compose checks that these six settings are nonempty before creating containers.
Host environment values are not automatically forwarded into a container: use the
settings declared in the Compose service.

`RATE_LIMIT_HMAC_SECRET` is optional but recommended; use a separate stable secret.
`DB_SSL_MODE` defaults to `verify-full` in Compose. Use a database with a trusted
TLS certificate; do not disable verification to get past a connection error.

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

The final image runs as `node:node` (UID/GID 1000 in the official Node Alpine
image), not root. Application code and dependencies remain root-owned. Only
`/app/uploads` and `/app/exports` are writable application directories. Container
storage is ephemeral; mount durable storage when evidence must survive replacement.
Bind mounts or custom `UPLOAD_ROOT`/`EXPORTS_ROOT` paths must be writable by that
user; prepare ownership on the host rather than running the sidecar as root.

On Linux with Docker and a disposable, schema-initialized local PostgreSQL database:

```bash
DATABASE_URL=... npm run test:deployment:sidecar
```

This builds the actual image, checks its default user, verifies code is not writable
and uploads/exports are writable (including Docker named volumes), then starts the
shipped production command and checks HTTP health, readiness and static assets.
It also renders the shipped Compose configuration, rejects each missing/empty
required variable and starts that actual service (using test-only host networking,
a free port and disposable volumes), rather than bypassing Compose with direct
environment injection.
The test accepts only loopback database hosts and uses host networking; it does not
apply migrations or deploy an image. CI runs it against its ephemeral database.

## Run with Docker Compose

From the repository root, export the six required settings above or put them in a
private environment file outside the repository. Use the same `--env-file` for
validation and startup; it supplies Compose interpolation, not an arbitrary
container environment. For example, after preparing `/secure/sidecar.env`:

```bash
docker compose --env-file /secure/sidecar.env -f deploy/sidecar/docker-compose.yml config --quiet
docker compose --env-file /secure/sidecar.env -f deploy/sidecar/docker-compose.yml up --build -d
```

Do not publish `docker compose config` output without `--quiet`: it includes
resolved secrets. The Compose stack does not provision PostgreSQL or apply schema
migrations. Point `DATABASE_URL` at an approved, initialized database reachable
from inside the container (`localhost` normally means the container itself).
Terminate HTTPS at your trusted reverse proxy and verify `/api/health` and
`/api/ready` before directing traffic to the sidecar. This example is not a
production deployment or provider-settings audit.

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
