# Background Jobs

## Current scope

The application now runs a small persistent background queue for external side effects.

Currently queued:

- invite delivery via SMTP
- invite delivery via webhook
- monitoring webhook delivery

Exports remain synchronous for now because the current UI and download contract expect immediate file availability.

## Persistence model

Jobs are stored in `background_jobs` with:

- `type`
- `status`
- `organizationId`
- `createdBy`
- `payload`
- `result`
- `attempts`
- `maxAttempts`
- `runAt`
- `lockedAt`
- `lockedBy`
- `lastError`

## Worker behavior

The API process starts an in-process worker on boot.

- polls pending jobs
- claims a limited batch
- marks jobs `processing`
- recovers processing jobs whose worker lease has expired
- retries failures with backoff
- marks terminal failures as `failed`

Each claim records a worker identity and lease timestamp. A worker may only complete or fail the exact lease it claimed. If a worker exits before recording an outcome, lease recovery counts that abandoned execution as an attempt, applies the normal retry backoff, and stops retrying at `maxAttempts`.

This is safe for the current single-service deployment model on Render.
If you later move to multiple worker processes, upgrade claim logic to stronger DB locking semantics or move to a dedicated worker service.

## Environment variables

- `BACKGROUND_JOBS_DISABLED=true` to disable worker startup
- `BACKGROUND_JOB_POLL_MS` default `5000`
- `BACKGROUND_JOB_BATCH_SIZE` default `5`
- `BACKGROUND_JOB_LEASE_TIMEOUT_MS` default `300000` (values below `30000` are raised to the safe minimum)

Invite delivery still depends on:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`

or:

- `INVITE_WEBHOOK_URL`

## Operational notes

If no invite delivery adapter is configured:

- invites are not queued
- invite responses remain in preview mode
- only non-production environments with invite-secret previews enabled receive the raw token and acceptance URL; production responses never expose them

If delivery is configured:

- invite creation and resend return immediately with `delivery.status = "queued"`
- actual send outcome is stored in the background job record
- the delivery payload, including the one-time acceptance URL, is encrypted at rest with `CONTROL_TOWER_VAULT_SECRET` in production

## Admin visibility

Organization admins can review queue state from the Settings Activity tab.

- per-organization summary counts
- recent failed jobs
- manual retry for failed invite delivery jobs

## Readiness visibility

`GET /api/ready` now includes queue summary fields:

- `workerEnabled`
- `pending`
- `processing`
- `succeeded`
- `failed`
