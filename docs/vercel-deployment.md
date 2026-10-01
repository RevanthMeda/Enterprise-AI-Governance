# Vercel deployment guide

## Deployment model

AI CONTROL GRID supports two explicit Vercel deployment modes.

| Mode | Config | Scheduling | Intended use |
| --- | --- | --- | --- |
| Portable / preview | `vercel.json` | No Vercel Cron registration | Contributor previews, Hobby-compatible deployments, or production deployments using an external scheduler |
| Production cron | `vercel.production.json` | Background jobs every 5 minutes; retention every 15 minutes | Production deployments on a Vercel plan that supports per-minute cron schedules |

Both configs use the same application runtime:

- Vite static frontend served from `dist/public`
- Express API served through `api/[...route].ts`
- Node.js 24 selected through the root `package.json` `engines.node` field; Vercel's official Node runtime needs no custom `functions.runtime` entry
- the authenticated cron endpoints remain available at:
  - `/api/cron/background-jobs`
  - `/api/cron/retention`

The only intentional difference between the two config files is Vercel Cron registration. A regression test enforces that invariant.

## Why the default config is cron-free

Vercel Hobby allows cron jobs only once per day, while the production AI CONTROL GRID schedules require 5-minute and 15-minute intervals. A repository-level `vercel.json` containing those schedules causes Hobby deployments to fail configuration validation before the application is deployed.

The default `vercel.json` therefore does not register cron jobs. This keeps pull-request previews and contributor deployments portable without silently changing the production cadence to an unsafe once-per-day schedule.

Current Vercel references:

- [Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Vercel CLI local config option](https://vercel.com/docs/cli/global-options#local-config)

## Portable / preview deployment

Git-integrated Vercel deployments use the repository's default `vercel.json`.

You can also deploy it explicitly:

```bash
npx vercel
```

This mode deploys the UI, API, and authenticated cron endpoints but does **not** schedule background processing automatically.

For a production system that uses the portable config, configure an external scheduler to invoke:

- `GET /api/cron/background-jobs` every 5 minutes
- `GET /api/cron/retention` every 15 minutes

Each request must include:

```text
Authorization: Bearer <CRON_SECRET>
```

Do not treat a production deployment as complete if neither Vercel Cron nor an external scheduler is configured.

## Production deployment with Vercel Cron

Use `vercel.production.json` only on a plan that supports the required per-minute cron frequency.

Deploy from the CLI with Vercel's supported local-config option:

```bash
npx vercel --prod --local-config vercel.production.json
```

The production config registers:

```text
/api/cron/background-jobs   */5 * * * *
/api/cron/retention         */15 * * * *
```

Vercel Git integration reads `vercel.json`; it does not automatically select `vercel.production.json`. If production is deployed through Git integration, keep the default config and use an external scheduler, or move the production deployment into CI/CLI where the production config can be selected explicitly.

## Required environment variables

- `DATABASE_URL`
- `SESSION_SECRET`
- `PASSWORD_RESET_SECRET`
- `CONTROL_TOWER_VAULT_SECRET`
- `CRON_SECRET`
- `PUBLIC_APP_URL`
- `CORS_ALLOWED_ORIGINS`

`CRON_SECRET` is required for Vercel production deployments even when `vercel.json` is cron-free because the scheduler endpoints remain deployed and must stay authenticated.

Recommended:

- `TRUST_PROXY=true`
- `CSRF_ENFORCED=true`
- `SESSION_COOKIE_SAME_SITE=lax`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_PARTITIONED=false`
- `SESSION_COOKIE_NAME=__Host-aict.sid.v2`
- `AUTO_SEED_ON_STARTUP=false`

Leave `VITE_API_BASE_URL` unset (or empty). Vercel serves the frontend and `/api` function on one origin; an external API base URL would unnecessarily turn the session cookie into a third-party cookie.

Optional path overrides:

- `UPLOAD_ROOT`
- `EXPORTS_ROOT`

## Important Vercel-specific behavior

- Process-based background workers are not started on Vercel.
- Retention polling timers are not started on Vercel.
- Scheduled execution must therefore come from Vercel Cron or an external scheduler.
- The cron routes are protected by `CRON_SECRET`; an unauthenticated scheduler request is rejected.

## Important storage limitation

This repo still stores evidence uploads and generated exports on the local filesystem.

On Vercel those paths default to `/tmp/ai-control-grid/...`, which is writable but not durable.

That means:

- uploads can work during a function lifetime
- exports can be generated and downloaded during a function lifetime
- neither should be treated as persistent object storage

For production-safe evidence handling, move uploads and exports to durable storage such as Supabase Storage or S3-compatible object storage.

## Vercel project settings

- Framework preset: `Vite`
- Build command: `npm run build:vercel`
- Output directory: `dist/public`

## Validate deployment configs

Run:

```bash
npm run test:deployment:vercel
```

The test verifies that:

- `vercel.json` remains cron-free;
- `vercel.production.json` retains the required 5-minute and 15-minute schedules;
- both configurations remain otherwise identical.

The same validation runs in the pull-request Regression Safeguards workflow.

## Platform administrator rollout

Platform-wide access is controlled by the explicit `users.is_platform_admin` entitlement. Tenant roles such as `owner`, `admin`, `cro`, or `ciso` do not grant platform access, and the application never infers it from a username or email address.

Roll this change out in this order:

1. Apply the schema change so `is_platform_admin` exists with its default of `false`.
2. Identify the approved operator by immutable user ID.
3. Grant the entitlement directly by that ID:

   ```sql
   UPDATE users
   SET is_platform_admin = TRUE
   WHERE id = '<approved-user-uuid>';
   ```

4. Verify the intended account before deploying the authorization change:

   ```sql
   SELECT id, username, email, is_platform_admin
   FROM users
   WHERE id = '<approved-user-uuid>';
   ```

5. Deploy the API and confirm the approved operator can access platform-only lead administration while tenant administrators receive `403`.

Revoke the entitlement with the same immutable-ID process by setting `is_platform_admin = FALSE`. Never bulk-grant it from `role`, username, email, email domain, or organization membership. Existing users default to no platform access until explicitly granted.

## After deploy

Verify:

1. `/api/health`
2. `/api/ready`
3. sign-in flow
4. refresh and confirm the session remains signed in
5. create an AI Registry entry
6. run a Runtime/Telemetry test, then perform another protected write
7. `/telemetry-adapter`
8. `/runtime-monitoring`
9. background jobs summary
10. retention summary
11. confirm the selected scheduler is successfully invoking both cron endpoints

## Remaining production hardening

- move evidence uploads to durable object storage
- move export artifacts to durable object storage
- optionally replace session cookies with a deployment pattern explicitly optimized for multi-region serverless if needed
