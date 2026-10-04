# AI CONTROL GRID

[![Regression Safeguards](https://github.com/RevanthMeda/Enterprise-AI-Governance/actions/workflows/regression-safeguards.yml/badge.svg)](https://github.com/RevanthMeda/Enterprise-AI-Governance/actions/workflows/regression-safeguards.yml)
[![Security](https://github.com/RevanthMeda/Enterprise-AI-Governance/actions/workflows/security.yml/badge.svg)](https://github.com/RevanthMeda/Enterprise-AI-Governance/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**AI CONTROL GRID** is an open-source enterprise AI governance and runtime-oversight platform. It provides a control plane for registering AI systems, evaluating governance requirements, managing approvals and evidence, monitoring runtime telemetry, and maintaining auditable operational records across organizations.

> **Project status:** active development. Interfaces and deployment guidance may evolve while the project moves toward stable tagged releases.

## What it covers

- AI system registry and ownership records
- risk assessment and governance workflows
- jurisdiction-aware governance profiles
- policy registry, controls, evidence, and approvals
- EU AI Act, NIST AI RMF, and ISO/IEC 42001-oriented governance workflows
- human review, override capture, and decision traceability
- multi-tenant identity, SAML, OIDC, domains, JIT, and invitations
- tamper-evident audit logging
- incident response and telemetry evaluation
- retention and legal-hold controls
- portfolio-level oversight
- telemetry SDK and integration connectors
- API documentation and public trust/security surfaces

AI CONTROL GRID is governance tooling. It does not replace legal, regulatory, security, or compliance advice.

## Architecture at a glance

The repository contains a TypeScript/Node.js backend, React frontend, PostgreSQL-backed data model, shared governance logic, runtime telemetry services, and a Node telemetry SDK.

Key areas:

- `server/` — APIs, identity, governance services, telemetry, incidents, storage
- `client/` — operator and administrator user interface
- `shared/` — governance rules, policy catalogs, schemas, and shared domain logic
- `packages/telemetry-sdk-node/` — Node.js telemetry SDK
  - [SDK quickstart](packages/telemetry-sdk-node/README.md)
- `script/` — validation, migration, security, test, and operational tooling
- `examples/` — integration and runtime examples
- `docs/` — product, deployment, architecture, and operator documentation

See [Architecture and data flow summary](docs/architecture-data-flow-summary.md).

## Quick start

**New to the project?** Start with the [10-minute external evaluation guide](docs/evaluate-in-10-minutes.md) for a synthetic, no-database/no-provider walkthrough.

### Offline pitch/demo mode

This is the fastest way to explore the governance flow without configuring a database or external AI provider:

```bash
npm ci
npm run demo:pitch
```

Open:

```text
http://127.0.0.1:18080/control-grid
```

The pitch scenario uses synthetic data and deterministic local responses. See the [pitch demo runbook](docs/pitch-demo-runbook.md).

### Local development

Requirements:

- Node.js 24.x
- npm
- PostgreSQL for database-backed workflows

For the quickest contributor setup with Docker:

```bash
npm ci
npm run dev:db:up
cp .env.example .env.local
npm run db:push -- --force
npm run dev
```

See the [local development guide](docs/local-development.md) for Windows commands, database reset instructions, and troubleshooting.

Default local endpoints include:

- application: `http://localhost:5000/`
- login: `http://localhost:5000/auth/login`
- API docs: `http://localhost:5000/api-docs`

Never commit real values from `.env.local`.

## Validation

Core checks:

```bash
npm run check
npm run build
npm run test:regression:all
```

Security pipeline:

```bash
npm run security:all
```

The GitHub workflows run regression and security gates on pull requests.

## Documentation

Start with the [application documentation index](docs/application-documentation-index.md).

Useful references:

- [10-minute external evaluation guide](docs/evaluate-in-10-minutes.md)
- [Product overview](docs/product-overview.md)
- [Route-by-route user manual](docs/route-by-route-user-manual.md)
- [Admin operations guide](docs/admin-operations-guide.md)
- [Role-based usage guide](docs/role-based-usage-guide.md)
- [Architecture and data flow summary](docs/architecture-data-flow-summary.md)
- [Vercel deployment guide](docs/vercel-deployment.md)
- [Firebase Hosting deployment guide](docs/firebase-hosting-deployment.md)

## Contributing

Contributions are welcome. Please read:

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [GOVERNANCE.md](GOVERNANCE.md)
- [SECURITY.md](SECURITY.md)
- [ROADMAP.md](ROADMAP.md)
- [CHANGELOG.md](CHANGELOG.md)
- [Release process](docs/releasing.md)
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

Good first areas include documentation, regression tests, accessibility, example integrations, developer tooling, deployment guidance, and reproducible bug reports.

## Project governance

The project currently uses a maintainer-led model.

**Primary maintainer:** [Revanth Meda (@RevanthMeda)](https://github.com/RevanthMeda)

The primary maintainer owns roadmap, issue triage, release decisions, security coordination, pull-request review, and contributor onboarding. Sustained contributors can grow into component ownership and core-maintainer responsibilities. See [GOVERNANCE.md](GOVERNANCE.md).

## Security

Do not disclose exploitable vulnerabilities, credentials, tenant data, production exports, or private keys in public issues. See [SECURITY.md](SECURITY.md) for the reporting process.

## License

AI CONTROL GRID is available under the [MIT License](LICENSE).
