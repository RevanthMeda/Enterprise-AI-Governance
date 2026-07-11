# AI CONTROL GRID — Developed by ACTURUS

AI CONTROL GRID is a multi-tenant enterprise AI governance and operations platform from Acturus. It helps teams register AI systems, classify risk, manage controls and evidence, route approvals, track audit activity, operate enterprise identity, and monitor incidents and telemetry in one control grid.

Founder-built by [Revanth Meda](https://ie.linkedin.com/in/revanth-meda-1ab294226), the product turns the operating model Revanth has shared publicly on LinkedIn into live workflows: register systems, assess risk, map controls, route approvals, and preserve audit-ready evidence.

## Core capabilities

- AI system registry and detailed system records
- Risk assessment and governance workflows
- Compliance management across EU AI Act, NIST AI RMF, and ISO/IEC 42001
- Approval routing with tiered decision handling
- Decision traceability, human override capture, and exit-readiness KPIs
- Enterprise identity with local auth, SAML, OIDC, domains, JIT, and invites
- Audit logging with tamper-evident hash chaining
- Incident response, telemetry thresholding, retention, and legal hold controls
- Portfolio roll-up oversight for multi-company governance
- Public trust center, API docs, and commercialization surfaces

## Quick start

### Pitch demo (no database required)

```bash
npm run demo:pitch
```

Open `http://127.0.0.1:18080/control-grid`. The scenario is fully synthetic and runs locally with deterministic responses, so it is safe to rehearse without external APIs. See [Pitch demo runbook](docs/pitch-demo-runbook.md).

### Local development

```bash
npm install
npm run dev
```

Open:

- `http://localhost:5000/`
- `http://localhost:5000/auth/login`
- `http://localhost:5000/api-docs`

### Local validation

```bash
npm run check
npm run build
npm run test:regression:all
```

## Documentation set

Start here:

- [Application documentation index](docs/application-documentation-index.md)

Detailed docs:

- [Product overview](docs/product-overview.md)
- [Route-by-route user manual](docs/route-by-route-user-manual.md)
- [Admin operations guide](docs/admin-operations-guide.md)
- [Role-based usage guide](docs/role-based-usage-guide.md)
- [Architecture and data flow summary](docs/architecture-data-flow-summary.md)
- [Vercel deployment guide](docs/vercel-deployment.md)
- [Firebase Hosting deployment guide](docs/firebase-hosting-deployment.md)

## Recommended reading order

1. [Application documentation index](docs/application-documentation-index.md)
2. [Product overview](docs/product-overview.md)
3. [Route-by-route user manual](docs/route-by-route-user-manual.md)
4. [Admin operations guide](docs/admin-operations-guide.md)
5. [Role-based usage guide](docs/role-based-usage-guide.md)
6. [Architecture and data flow summary](docs/architecture-data-flow-summary.md)

## Public product links

- API docs: `/api-docs`
- Trust center: `/trust-center`
- Security: `/security`
- Privacy: `/privacy`
- Terms: `/terms`

## Notes

- The markdown set in `docs/` is the current handoff documentation for product, admin, and architecture review.
- If you want a single handbook export later, generate it from the markdown set rather than maintaining a second manual by hand.
