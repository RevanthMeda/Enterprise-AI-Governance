# Vercel deployment guide

## Deployment model

This repo is prepared for Vercel as:

- Vite static frontend served from `dist/public`
- Express API served through the serverless function at `api/[...route].ts`
- Vercel Cron triggering:
  - `/api/cron/background-jobs`
  - `/api/cron/retention`

## Required environment variables

- `DATABASE_URL`
- `SESSION_SECRET`
- `PASSWORD_RESET_SECRET`
- `CONTROL_TOWER_VAULT_SECRET`
- `CRON_SECRET`
- `PUBLIC_APP_URL`
- `CORS_ALLOWED_ORIGINS`

Recommended:

- `TRUST_PROXY=true`
- `CSRF_ENFORCED=true`
- `AUTO_SEED_ON_STARTUP=false`

Optional path overrides:

- `UPLOAD_ROOT`
- `EXPORTS_ROOT`

## Important Vercel-specific behavior

- Process-based background workers are not started on Vercel.
- Retention polling timers are not started on Vercel.
- Both are replaced by Vercel Cron routes.

## Important storage limitation

This repo still stores evidence uploads and generated exports on the local filesystem.

On Vercel those paths default to `/tmp/ai-control-tower/...`, which is writable but not durable.

That means:

- uploads can work during a function lifetime
- exports can be generated and downloaded during a function lifetime
- neither should be treated as persistent object storage

For production-safe evidence handling, move uploads and exports to durable storage such as Supabase Storage or S3-compatible object storage.

## Vercel project settings

- Framework preset: `Vite`
- Build command: `npm run build:vercel`
- Output directory: `dist/public`

## Cron security

Set `CRON_SECRET` in Vercel.

Vercel Cron will send:

- `Authorization: Bearer <CRON_SECRET>`

The cron endpoints reject unauthorized requests.

## After deploy

Verify:

1. `/api/health`
2. `/api/ready`
3. sign-in flow
4. `/telemetry-adapter`
5. `/runtime-monitoring`
6. background jobs summary
7. retention summary

## Remaining production hardening

- move evidence uploads to durable object storage
- move export artifacts to durable object storage
- optionally replace session cookies with a deployment pattern explicitly optimized for multi-region serverless if needed
