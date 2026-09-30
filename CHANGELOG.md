# Changelog

All notable changes to AI CONTROL GRID will be documented in this file.

The project is currently pre-stable. Until version 1.0.0, minor releases may include breaking changes when they are clearly documented in release notes.

## [Unreleased]

No user-facing changes have been queued since the v0.1.0 release baseline.

## [0.1.0] - 2026-09-30

First public pre-stable open-source baseline for AI CONTROL GRID.

### Added

- MIT license and public contributor documentation.
- Maintainer-led governance model with Revanth Meda (@RevanthMeda) documented as primary maintainer.
- Security policy, code of conduct, roadmap, issue templates, pull-request template, and CODEOWNERS.
- Weekly Dependabot configuration for npm and GitHub Actions.
- Reproducible PostgreSQL 16 contributor development stack with Docker Compose.
- Local-development guide including Windows PowerShell setup and database lifecycle commands.
- Expanded Node telemetry SDK quickstart with a runnable synthetic example.
- Documentation for telemetry SDK preflight/postflight enforcement, error handling, privacy boundaries, and custom transports.
- Maintainer release checklist and versioning guidance.
- Public Security and Regression Safeguards GitHub Actions workflows.

### Changed

- Root application metadata now identifies the project as `ai-control-grid` version `0.1.0`.
- Root workspace is marked private to prevent accidental npm publication.
- README now presents the repository as an open-source project with architecture, setup, validation, governance, security, SDK, and release guidance.
- Regression fixtures were aligned with current MFA, RBAC, background-job readiness, SSO, and audit-chain behavior.
- Heavy seed execution is deterministic in CI.
- Nodemailer was upgraded to the secure 10.x line and dependency resolutions were refreshed.
- Historical/generated QA, research, Firebase cache, and generated SBOM artifacts were removed from the maintained source tree.

### Security

- CI now provides explicit test-only secrets while preserving fail-closed runtime behavior.
- Outbound HTTP request deadlines remain active until awaited requests settle.
- Security regression coverage validates safe outbound HTTP behavior, configuration, secrets-at-rest, SSO, exports, rate limits, CSRF, session handling, and related boundaries.
- Generated SBOM output is produced by CI rather than committed to source control.

### Known limitations

- The project is pre-stable; API and deployment interfaces may still change before 1.0.0.
- Vercel Hobby deployments do not support the current production cron frequencies used for background jobs and retention. See issue #11 for the tracked deployment-design follow-up.
- Evidence/export durability still depends on deployment-specific persistent storage configuration.
- Major dependency upgrades such as React 19 and Framer Motion 13 are intentionally deferred until they can be reviewed as separate compatibility changes.
