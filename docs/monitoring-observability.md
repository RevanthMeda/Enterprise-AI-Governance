# Monitoring and Error Reporting

## What is captured

The application now emits three observability streams:

1. API request logs
   - `requestId`
   - `organizationId`
   - `userId`
   - `route`
   - `status`
   - `durationMs`

2. Backend error events
   - unhandled API `5xx` failures
   - `unhandledRejection`
   - `uncaughtExceptionMonitor`

3. Client runtime error events
   - `window.error`
   - `window.unhandledrejection`
   - latest known `X-Request-Id`
   - browser URL and user agent

## Environment variables

Set these on the backend service if you want events forwarded to an external sink.

- `MONITORING_WEBHOOK_URL`
- `MONITORING_WEBHOOK_TOKEN` optional bearer token
- `MONITORING_SERVICE_NAME` optional, defaults to `ai-control-tower`
- `MONITORING_ENVIRONMENT` optional, defaults to `NODE_ENV`

If `MONITORING_WEBHOOK_URL` is not set, the app still logs structured events locally but does not forward them.

## Client error ingest route

Public route:

- `POST /api/monitoring/client-errors`

This route is CSRF-exempt so the public marketing and login pages can report runtime failures.

## Recommended external sink shape

The outbound payload is a single JSON event with:

- `service`
- `environment`
- `timestamp`
- `level`
- `source`
- `event`
- `message`
- `requestId`
- `organizationId`
- `userId`
- `route`
- `method`
- `status`
- `stack`
- `metadata`

This works cleanly with:

- generic webhook collectors
- log ingestion endpoints
- lightweight incident relay functions
- vendor adapters for Sentry, Datadog, Better Stack, or similar

## Operational recommendation

Use `/api/health` for liveness and `/api/ready` for readiness.
Combine those with webhook-backed error forwarding for production alerting.
