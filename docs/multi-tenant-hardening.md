# Multi-tenant hardening checklist

## Tenant boundary
- Tenant-bound tables must always carry `organization_id`:
`ai_systems`, `system_controls`, `approval_workflows`, `audit_logs`, `notifications`, `evidence_files`, `risk_assessments`.
- Shared/global tables remain global:
`users`, `organizations`, `memberships`, `compliance_controls`.

## Route and middleware requirements
- Tenant-bound routes must include `requireTenant`.
- Tenant-bound mutating routes must include `requireOrgRole(...)`.
- No route-level ad hoc filtering; tenant scoping must happen in services/repositories.

## Service and repository pattern
- Route handlers call services only.
- Services call `storage` methods only.
- Every tenant-bound `storage` read/write method requires explicit `organizationId`.
- Linked entities must be validated in active org scope (system, reviewer, control, workflow).

## Auth and session
- Auth payload must include `currentOrganizationId` and `organizations[]`.
- Memberships are the source of org-role truth.
- `session.currentOrganizationId` must be validated against active membership on each request.
- Invalid/stale session org must be rejected.

## Files and exports
- Evidence storage path must be namespaced by org:
`uploads/{organizationId}/...`.
- Export storage path must be namespaced by org:
`exports/{organizationId}/...`.
- Download/delete operations must validate both:
organization ownership and actor authorization.

## Query and aggregate guardrails
- Aggregate/dashboard/calendar queries must filter by `organization_id` before grouping.
- Notification reads/writes must be scoped by both `organizationId` and `userId`.
- Audit reads and writes must always include `organizationId`.

## Validation commands
- `npm run db:push`
- `npm run tenant:validate`
- `npm run tenant:guard`
- `npm run check`
- `npm run test:tenant:isolation`
- `npm run test:tenant:routes`

## Pre-merge security checks
- Cross-org control assignment is denied.
- Cross-org workflow updates with foreign system/reviewer are denied.
- Cross-org evidence read/delete is denied.
- Cross-org export download is denied.
- Aggregate outputs do not mix org data.
- Stale session org context is rejected after membership removal.

## Post-schema enforcement
- Keep `organization_id` as `NOT NULL` on tenant-bound tables.
- Re-run `tenant:validate` after every tenant-related migration.
- Audit async/background paths and ensure `organizationId` is explicit in payload and query filters.
