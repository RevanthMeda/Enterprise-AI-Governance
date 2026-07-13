# Deployment and Rollback Runbook

This runbook covers production promotion and rollback for the current Firebase Hosting + Render deployment model. Netlify remains an optional secondary frontend.

## Deployment model

Current production shape:

- primary frontend: Firebase Hosting
- optional secondary frontend: Netlify
- backend: Render
- database: PostgreSQL
- forward-compatible schema expansion: `npm run db:migrate:production` (never use forced schema synchronization against production)

CI/CD entry points:

- validation/build workflow: [deploy.yml](/mnt/d/Personal/Enterprise-AI-Governance/.github/workflows/deploy.yml)
- manual promotion workflow: [promote-production.yml](/mnt/d/Personal/Enterprise-AI-Governance/.github/workflows/promote-production.yml)

## Pre-release checklist

Before promoting:

1. `npm run security:sast`
2. `npm run security:deps`
3. `npm run security:secrets`
4. `npm run tenant:validate`
5. `npm run test:tenant:isolation`
6. `npm run test:tenant:routes`
7. `npm run test:security:csrf`
8. `npm run test:regression:all`

Operational checks:

- a recoverable production database snapshot exists for the exact release
- the production GitHub environment variable `PRODUCTION_DB_BACKUP_CONFIRMED`
  equals the full Git commit SHA being promoted
- Render backend env vars are current
- Netlify env vars are current
- deploy hooks are valid

## Promotion sequence

Recommended order:

1. validate on `main`
2. run manual production promotion
3. confirm the snapshot/restore point, set the production GitHub environment variable `PRODUCTION_DB_BACKUP_CONFIRMED` to the full release commit SHA, and apply `npm run db:migrate:production`
4. trigger backend deploy
5. verify `/api/ready` reports the exact release commit
6. migrate any legacy plaintext invite tokens
7. deploy Firebase Hosting and optionally trigger Netlify
8. run smoke checks:
   - `/api/health`
   - login
   - org switching
   - settings page
   - invite preview/accept flow

## Rollback triggers

Roll back if any of these are observed:

- auth regression
- tenant leakage
- failed schema validation
- broken SSO callback
- broken invite acceptance
- failed session persistence

## Rollback strategy

### Application rollback only

Use when:

- schema is backward compatible
- issue is isolated to frontend or backend app code

Steps:

1. redeploy the previous stable Render release
2. redeploy the previous stable Firebase Hosting release and, if enabled, the previous stable Netlify release
3. run smoke checks:
   - `/api/health`
   - `/api/auth/user`
   - dashboard
   - settings

Invite-token compatibility note: this release replaces plaintext invitation tokens with one-way digests. If the backend is rolled back to a release that predates digest support without restoring the pre-release database snapshot, pending invitations must be resent from the old release before they can be accepted. Never attempt to reconstruct or export the previous raw tokens from their digests.

### Application + database rollback

Use when:

- the release applied incompatible schema/data changes
- the app cannot run safely on the new database state

Steps:

1. stop further production promotions
2. restore the pre-release DB snapshot
3. redeploy the previous stable backend
4. redeploy the previous stable Firebase Hosting release and, if enabled, the previous stable Netlify release
5. re-run tenant and smoke validation

## Important limitations

Current repo state:

- promotion is automated through deploy hooks
- rollback is documented, not provider-API-automated
- the current release migration is an idempotent, version-recorded expand migration; destructive contract migrations remain deliberately separate

That means database rollback should be treated as snapshot restore, not reverse migration replay.

## Post-rollback checklist

1. confirm `/api/health` is green
2. confirm `/api/auth/user` returns the expected unauthenticated or authenticated payloads
3. confirm tenant validation is clean
4. confirm the last known good login flow works
5. confirm SSO start URL still resolves correctly
6. confirm invite acceptance route still loads

## Schema rollback rule

Do not reverse the additive release migration while either the new or previous application release is running. Application rollback remains compatible with the added columns and tables. If data repair is required, restore the verified pre-release snapshot in a controlled maintenance window.
