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
