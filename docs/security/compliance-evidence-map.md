# Compliance Evidence Map

This map links existing technical controls to common compliance evidence needs.

## SOC 2 / ISO 27001 Control Evidence

| Control Area | Current Evidence Source | Command / Artifact |
|---|---|---|
| Tenant isolation | Integration tests + guardrails | `npm run test:tenant:isolation`, `npm run test:tenant:routes`, `npm run tenant:guard` |
| Access control | Auth/session code + org membership model | [auth.ts](/mnt/d/Personal/Enterprise-AI-Governance/server/auth.ts), [tenant.ts](/mnt/d/Personal/Enterprise-AI-Governance/server/tenant.ts) |
| Change management | PR + CI checks | `.github/workflows/security.yml` |
| Dependency risk management | Dependency audit report | `npm run security:deps` |
| Secret handling | Secret scanning report | `npm run security:secrets` |
| Software inventory | SBOM artifact | `npm run security:sbom` (`sbom.cdx.json`) |
| Monitoring/auditability | Audit logs + route protections | [routes.ts](/mnt/d/Personal/Enterprise-AI-Governance/server/routes.ts), audit services |
| Incident response | IR runbook | [incident-response.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/security/incident-response.md) |

## Required Cadence
- Security checks: every PR and `main` push.
- Tenant isolation tests: every PR touching tenant-bound paths.
- Manual security review: quarterly.
- Third-party penetration test: at least annually.

## Open Gaps (Planned)
- Mandatory MFA enforcement for all accounts.
- Production CSRF enforcement rollout (`CSRF_ENFORCED=true`).
- Centralized SIEM ingestion and alert playbooks.
- Artifact signing in CI/CD.
