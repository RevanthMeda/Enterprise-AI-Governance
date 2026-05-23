# Multi-tenant Hardening Runbook

This runbook defines the operational and engineering rules that keep tenant data isolated in AI CONTROL GRID.

## Tenant model

Tenant isolation is built on three core tables:

- `users`: global identity records
- `organizations`: tenant boundary
- `memberships`: user-to-organization access and org-scoped role truth

Tenant-bound operational data must always carry `organization_id`.

Primary tenant-bound tables:

- `ai_systems`
- `system_controls`
- `approval_workflows`
- `audit_logs`
- `notifications`
- `evidence_files`
- `risk_assessments`
- `admin_audit_events`

Identity and access support tables:

- `organization_domains`
- `organization_invites`

Global/shared tables remain unscoped unless explicitly linked through membership or organization ownership.

## Request resolution flow

Tenant resolution is handled in [tenant.ts](/mnt/d/Personal/Enterprise-AI-Governance/server/tenant.ts).

Resolution order:

1. `X-Organization-Id` request header, if present
2. `req.session.currentOrganizationId`
3. active membership fallback when the session org is stale

Rules:

- every resolved org must be backed by an active membership
- stale `currentOrganizationId` values are rejected or repaired through active membership lookup
- routes must not trust raw client org IDs without membership validation

## Middleware rules

Mandatory route guards:

- `requireAuth` for authenticated endpoints
- `requireTenant` for tenant-bound endpoints
- `requireOrgRole(...)` for tenant-bound privileged mutation endpoints

Hard requirements:

- tenant-bound routes must not manually query unrelated org data
- route handlers must not implement ad hoc tenant filtering
- route handlers should delegate to services or storage methods that require explicit `organizationId`

## Storage and service rules

Storage rules:

- every tenant-bound storage read/write method requires explicit `organizationId`
- linked records must be validated in the same org scope before mutation
- no storage helper should infer organization ownership from unrelated IDs

Service rules:

- route handlers call services for business logic
- services call storage methods only
- services are responsible for cross-entity validation before write operations

## Identity federation and provisioning

Identity federation is implemented with org-aware SSO routes in [routes.ts](/mnt/d/Personal/Enterprise-AI-Governance/server/routes.ts) and service logic in `server/services`.

Implemented identity controls:

- SSO metadata endpoint: `GET /api/auth/sso/metadata`
- SSO start endpoint: `GET /api/auth/sso/start`
- SSO callback endpoint: `POST /api/auth/sso/callback`
- SSO mock callback endpoint: `POST /api/auth/sso/mock-callback` (regression-only, disabled in production unless `ENABLE_TEST_AUTH_ROUTES=true`)
- provider identity linking on `users`
- JIT provisioning with `provisioningSource = "jit"`
- invite acceptance with `provisioningSource = "invite"`
- org domain allowlisting using first-class `organization_domains`
- DNS TXT verification for claimed org domains

Provider identity rules:

- provider subject reuse must resolve to a single global user
- provider-subject/user conflicts are denied
- email fallback may be used only when it does not conflict with an existing linked identity

JIT rules:

- JIT must be explicitly enabled for the organization
- JIT allowlisting is enforced through `organization_domains`
- default JIT role must remain low privilege
- every JIT allow, deny, user creation, and membership creation is audited

Invite rules:

- invites are org-scoped
- raw invite tokens are not stored
- expired or revoked invites must not be accepted
- invite acceptance may onboard external users without domain allowlisting

## Domain management rules

Domain allowlisting is backed by `organization_domains`, not only legacy auth settings JSON.

Source-of-truth precedence:

1. `organization_domains`
2. `organizations.settings.auth.allowedDomains` only when no first-class domain rows exist

Normalization requirements:

- lowercase
- trimmed
- no protocol
- no path/query/hash
- no wildcards unless explicitly supported later

Verification model:

- TXT record name: `_aicontrolgrid.<domain>`
- TXT record value: `aicontrolgrid-verification=<token>`

Only verified domains should be treated as enterprise-claimed in rollout policies if you later tighten enforcement.

## Session and auth payload rules

Auth/session expectations:

- auth payload includes `currentOrganizationId`
- auth payload includes `organizations[]`
- `req.session.currentOrganizationId` is updated after:
  - local login
  - SSO login
  - explicit org switch
- current org is validated against active memberships on each org-aware request path

`/api/auth/user` is the canonical auth payload endpoint for frontend session state.

## Files, exports, and async work

Storage namespacing:

- uploads: `uploads/{organizationId}/...`
- exports: `exports/{organizationId}/...`

Async/background job requirements:

- payloads must explicitly carry `organizationId`
- payloads should also carry actor identity where relevant
- async handlers must not reconstruct org context from user ID alone

## Audit requirements

Every critical identity or tenant-admin action must write org-scoped audit events.

Minimum audited areas:

- SSO config change
- domain allowlist updates
- domain verification changes
- invite create/resend/revoke/accept
- JIT allow/deny
- JIT user creation
- JIT membership creation
- role changes
- org switch

Audit records must always include `organizationId`.

## Validation commands

Run these before merging tenant or identity changes:

- `npm run check`
- `npm run tenant:validate`
- `npm run tenant:guard`
- `npm run test:tenant:isolation`
- `npm run test:tenant:routes`
- `npm run test:regression:all`

Schema changes:

- `npm run db:push -- --force`

## Pre-merge checklist

- no tenant-bound table writes omit `organization_id`
- no route bypasses `requireTenant` where tenant scope is required
- no role-gated mutation route bypasses `requireOrgRole(...)`
- stale session orgs are rejected safely
- cross-org evidence access is denied
- cross-org workflow/control mutations are denied
- aggregate queries remain org-filtered before grouping
- SSO/JIT conflicts are denied
- invite acceptance remains org-correct and state-validated

## Deployment sequence

Recommended production order:

1. deploy nullable schema additions first
2. run `npm run db:push -- --force`
3. run validation checks
4. deploy backend changes behind safe defaults
5. deploy frontend/admin UI changes
6. enable enterprise identity features per organization

## Rollback approach

If tenant or identity validation fails:

1. halt follow-up schema enforcement
2. restore from the pre-deploy DB snapshot when needed
3. revert the application deploy
4. re-run:
   - `npm run tenant:validate`
   - `npm run test:tenant:isolation`
   - `npm run test:tenant:routes`

Do not apply irreversible `NOT NULL` or destructive cleanup changes until validation is green.
