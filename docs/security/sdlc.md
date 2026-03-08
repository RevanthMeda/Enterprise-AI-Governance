# Secure Development Lifecycle (SDLC)

This project follows a security baseline aligned with OWASP SAMM phases.

## Governance
- Security policy owned by engineering + product.
- Annual secure coding training for contributors.
- Quarterly security simulation / tabletop exercise.
- Security requirements captured per feature in PR descriptions.

## Design
- Threat model required for:
  - auth/session changes
  - tenant boundary changes
  - file/export flows
  - integrations and background jobs
- Data flow diagram required for new external integrations.
- Security acceptance criteria must be defined before implementation.

## Implementation
- Mandatory checks in CI:
  - `npm run security:sast`
  - `npm run security:deps`
  - `npm run security:secrets`
  - `npm run security:sbom`
- No new tenant-bound repository method without explicit `organizationId`.
- No new route for tenant data without `requireTenant`.

## Verification
- Required automated checks:
  - tenant isolation tests
  - route/session org-switch tests
  - type checking
- Security regression tests required for:
  - auth/session logic
  - file access
  - export download authorization
  - cross-tenant denial matrix

## Operations
- Security logs monitored for:
  - repeated login failures
  - invalid org switch attempts
  - CSRF validation failures
  - tenant-guard violations
- Incident response process documented in [incident-response.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/security/incident-response.md).

## Release Gate
Before merge to `main`, the following must pass:
- CI security workflow
- tenant isolation tests
- tenant route integration tests
- manual verification for changed auth/session flows
