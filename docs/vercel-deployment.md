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
- Both are replaced by Vercel Cron routes.

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
4. refresh and confirm the session remains signed in
5. create an AI Registry entry
6. run a Runtime/Telemetry test, then perform another protected write
7. `/telemetry-adapter`
8. `/runtime-monitoring`
9. background jobs summary
10. retention summary

## Remaining production hardening

- move evidence uploads to durable object storage
- move export artifacts to durable object storage
- optionally replace session cookies with a deployment pattern explicitly optimized for multi-region serverless if needed
