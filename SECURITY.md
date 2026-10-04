# Security Policy

AI CONTROL GRID handles identity, governance evidence, model telemetry, secrets, and multi-tenant data. Security reports are treated as high priority.

## Supported versions

Security fixes are currently made on the latest `main` branch. Tagged releases may receive fixes when a release line is actively maintained.

## Reporting a vulnerability

Please do **not** open a public issue for a vulnerability that could expose credentials, tenant data, authentication bypasses, remote code execution, privilege escalation, secret leakage, or similar security impact.

Preferred reporting path:

1. Use GitHub's private vulnerability reporting feature for this repository when available.
2. If private reporting is unavailable, contact the repository owner through the GitHub profile associated with this project and request a private channel before sharing exploit details.

Include:

- affected component and version/commit;
- impact and attack prerequisites;
- minimal reproduction steps;
- logs or proof of concept with all secrets and personal data removed;
- any suggested mitigation.

## Security design expectations

Contributions should preserve:

- tenant isolation;
- least-privilege authorization;
- CSRF and session protections;
- secure secret handling;
- tamper-evident audit behavior;
- safe outbound HTTP controls;
- evidence and export access controls;
- fail-closed behavior for governance-critical decisions where documented.

The repository includes automated security and regression workflows, but automated checks do not replace review.

## Dependency audit policy

High-severity vulnerabilities in production/runtime dependencies remain release-blocking through `npm run security:deps`.

The CI workflow also runs a full dependency audit, including development/build tooling, and keeps that result visible even when an upstream package has no compatible patched release. Such exceptions must be tracked in a public maintenance issue rather than silently suppressed.

As of October 2026, issue #36 tracks CVE-2026-93687 / GHSA-vfj7-8cjw-p6xm in the Tailwind 3 development dependency chain. The advisory currently has no patched `braces` release. A forced Tailwind 4 migration is intentionally not applied without compatibility validation.
