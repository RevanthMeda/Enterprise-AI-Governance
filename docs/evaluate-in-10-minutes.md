# Evaluate AI CONTROL GRID in 10 minutes

This path is for an external developer, security reviewer, maintainer, or potential user who wants to understand the project before configuring a full environment.

It uses only synthetic data and does not require:

- PostgreSQL
- OpenAI or other model-provider credentials
- production identity configuration
- production customer or organization data

## 1. Clone and install

Requirements:

- Node.js 24.x
- npm

```bash
git clone https://github.com/RevanthMeda/Enterprise-AI-Governance.git
cd Enterprise-AI-Governance
npm ci
```

## 2. Start the offline demo

```bash
npm run demo:pitch
```

Open:

```text
http://127.0.0.1:18080/control-grid
```

The offline demo uses deterministic synthetic responses. It does not call an external model provider.

## 3. What to inspect

In the first few minutes, focus on the control-grid flow rather than every page in the application.

### System and governance context

Look for how an AI system is represented, including ownership, risk/governance context, and the controls that apply to it.

### Runtime decision flow

Follow the synthetic runtime scenario and inspect how the system represents:

- a runtime observation;
- governance decision information;
- threshold or reason information;
- escalation/blocking state;
- incident or reviewer-facing context.

### Human oversight

Check where the platform records or exposes:

- review state;
- human override/release decisions;
- auditability of governance-sensitive actions.

The goal of this evaluation is not to prove regulatory compliance. It is to show how the project structures auditable AI-governance operations.

## 4. Evaluate the telemetry SDK

The repository includes a typed Node.js telemetry SDK:

```text
packages/telemetry-sdk-node/
```

Start with:

[Telemetry SDK quickstart](../packages/telemetry-sdk-node/README.md)

The SDK documentation explains:

- telemetry ingest;
- preflight/postflight runtime evaluation;
- blocking behavior;
- error handling;
- privacy/data-handling boundaries;
- custom transport/testing.

The example data is synthetic. Do not use production credentials when evaluating the SDK.

## 5. Full local development

If you want to evaluate database-backed workflows, identity, persistence, and the full server:

[Local development guide](local-development.md)

The supported local path uses PostgreSQL 16 through Docker Compose.

## 6. Validate the repository

Core validation:

```bash
npm run check
npm run build
```

The complete regression suite requires the database-backed test environment used by the project workflows:

```bash
npm run test:regression:all
```

Security-focused validation is available through the documented `test:security:*` scripts and the repository Security workflow.

## 7. What feedback is useful

Useful external feedback includes:

- a setup step that was unclear or failed;
- a governance/runtime result that was difficult to interpret;
- an SDK integration friction point;
- a missing test or example;
- deployment assumptions that are not obvious;
- accessibility or operator-experience issues;
- a reproducible bug.

Open a GitHub issue and include the smallest reproducible example possible.

Do not include:

- API keys;
- passwords;
- private keys or certificates;
- customer/tenant data;
- production prompts or outputs containing sensitive information.

See [SECURITY.md](../SECURITY.md) for vulnerability reporting.

## Next paths

- Product overview: [product-overview.md](product-overview.md)
- Architecture: [architecture-data-flow-summary.md](architecture-data-flow-summary.md)
- Contributor guide: [CONTRIBUTING.md](../CONTRIBUTING.md)
- Roadmap: [ROADMAP.md](../ROADMAP.md)
