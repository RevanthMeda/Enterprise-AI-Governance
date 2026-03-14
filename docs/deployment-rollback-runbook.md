# Deployment and Rollback Runbook

This runbook covers production promotion and rollback for the current Netlify + Render deployment model.

## Deployment model

Current production shape:

- frontend: Netlify
- backend: Render
- database: PostgreSQL
- schema changes: `npm run db:push -- --force`

CI/CD entry points:

- validation/build workflow: [deploy.yml](/mnt/d/Personal/Enterprise-AI-Governance/.github/workflows/deploy.yml)
- manual promotion workflow: [promote-production.yml](/mnt/d/Personal/Enterprise-AI-Governance/.github/workflows/promote-production.yml)

## Pre-release checklist

Before promoting:

1. `npm run check`
2. `npm run tenant:validate`
3. `npm run tenant:guard`
4. `npm run test:tenant:isolation`
5. `npm run test:tenant:routes`
6. `npm run test:regression:all`

Operational checks:

- production database snapshot exists
- Render backend env vars are current
- Netlify env vars are current
- deploy hooks are valid

## Promotion sequence

Recommended order:

1. validate on `main`
2. run manual production promotion
3. optionally apply `db:push` during promotion if the release includes schema changes
4. trigger backend deploy
5. trigger frontend deploy
6. run smoke checks:
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
2. redeploy the previous stable Netlify release
3. run smoke checks:
   - `/api/health`
   - `/api/auth/user`
   - dashboard
   - settings

### Application + database rollback

Use when:

- the release applied incompatible schema/data changes
- the app cannot run safely on the new database state

Steps:

1. stop further production promotions
2. restore the pre-release DB snapshot
3. redeploy the previous stable backend
4. redeploy the previous stable frontend
5. re-run tenant and smoke validation

## Important limitations

Current repo state:

- promotion is automated through deploy hooks
- rollback is documented, not provider-API-automated
- database schema promotion uses `drizzle-kit push`, not versioned forward/back SQL migrations

That means database rollback should be treated as snapshot restore, not reverse migration replay.

## Post-rollback checklist

1. confirm `/api/health` is green
2. confirm `/api/auth/user` returns the expected unauthenticated or authenticated payloads
3. confirm tenant validation is clean
4. confirm the last known good login flow works
5. confirm SSO start URL still resolves correctly
6. confirm invite acceptance route still loads

## Recommended next improvement

If you want stronger rollback guarantees, the next step is to move from `db:push` to explicit migration files with release-by-release forward plans.
