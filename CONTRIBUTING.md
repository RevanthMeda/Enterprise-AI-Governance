# Contributing to AI CONTROL GRID

Thank you for helping improve AI CONTROL GRID.

## Ways to contribute

Useful contributions include:

- bug reports with reproducible steps;
- governance-rule or policy-engine improvements;
- tests for tenant isolation, authorization, auditability, and runtime safety;
- documentation and deployment improvements;
- integrations and telemetry adapters;
- accessibility and operator-experience fixes;
- security findings reported through the process in [SECURITY.md](SECURITY.md).

## Development setup

Requirements:

- Node.js 20.x
- npm
- PostgreSQL 16 for the full regression suite

Install dependencies:

```bash
npm ci
```

Start local development:

```bash
npm run dev
```

Run the main validation gates before opening a pull request:

```bash
npm run check
npm run build
npm run test:regression:all
```

Security-focused changes should also run the relevant `test:security:*` scripts. The full security pipeline is available as:

```bash
npm run security:all
```

## Pull request expectations

Keep pull requests focused. A good PR should:

1. explain the problem and why the change is needed;
2. include tests for changed behavior when practical;
3. call out security, tenancy, data-retention, or governance implications;
4. avoid unrelated formatting or generated-file churn;
5. update user-facing documentation when behavior changes.

Do not commit credentials, access tokens, production exports, customer data, private keys, session cookies, or real organization secrets.

## Governance-sensitive changes

Changes to policy evaluation, jurisdiction handling, model-risk classification, approval routing, audit evidence, identity, telemetry enforcement, or legal-source handling require extra care. Tests should demonstrate both the intended decision and relevant failure/deny paths.

AI CONTROL GRID provides governance tooling; it does not replace legal, regulatory, security, or compliance advice.

## Maintainer review

The project currently uses a maintainer-led review model. See [GOVERNANCE.md](GOVERNANCE.md) for roles and decision-making.
