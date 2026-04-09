# AI Control Tower Full Application Report

## 1. Executive summary

AI Control Tower is a multi-tenant enterprise AI governance platform that combines:

- an internal governance console
- a runtime telemetry and incident layer
- an inline AI gateway and policy-enforcement layer
- enterprise identity and tenant administration
- portfolio-level oversight across multiple operating companies

It is not only an inventory or compliance tracker. In practical terms, it behaves like a control plane for governed AI operations.

The application helps organizations:

- register and classify AI systems
- assess risk and map controls
- collect evidence and preserve auditability
- route approvals based on business and regulatory risk
- manage identity with local auth, SAML, OIDC, domains, invites, and JIT provisioning
- evaluate runtime AI behavior through telemetry or inline gateway enforcement
- escalate critical runtime behavior into incidents
- manage retention, legal hold, and immutable decision records
- give portfolio operators a roll-up view across separate tenant organizations

## 2. What the application actually does

The most accurate short description is:

AI Control Tower is an enterprise governance and runtime-control platform for AI systems.

It supports two operating modes at the same time:

### 2.1 Governance console mode

Teams use the web application to:

- maintain an AI system registry
- complete risk assessments
- track framework controls and evidence
- run approval workflows
- inspect audit history
- configure identity, telemetry, retention, billing, and integrations

### 2.2 Runtime control mode

Customer applications connect to AI Control Tower through:

- telemetry SDK ingestion
- direct telemetry evaluation endpoints
- provider-compatible inline gateway routes

In that mode, AI Control Tower can:

- inspect prompts before model execution
- inspect model output before release
- apply legal-profile, law-pack, and capability-based governance rules
- decide whether the runtime outcome should be allowed, warned, escalated, or blocked
- create telemetry evidence, notifications, audit records, and incidents

## 3. Primary users and operating roles

The product is clearly designed for regulated or governance-heavy organizations.

Primary user groups:

- organization admins
- CRO and risk leaders
- CISO and security leaders
- compliance leads
- reviewers
- system owners
- auditors
- portfolio operators and portfolio admins

Secondary user groups:

- buyers evaluating the platform
- security reviewers
- integration teams using APIs or telemetry ingest
- IT teams implementing SSO and domain verification

The role model is split between global user identity and organization-scoped membership roles. The documented roles include:

- admin
- CRO
- CISO
- compliance lead
- reviewer
- system owner
- auditor
- portfolio admin/operator/viewer

## 4. Product surface

### 4.1 Public surface

The public, unauthenticated application includes:

- landing page
- login page
- password reset page
- invite acceptance page
- demo and pilot lead forms
- security, privacy, and terms pages
- trust center
- API docs landing page and OpenAPI artifacts

This means the repo contains both the product console and the buyer-facing commercial surface.

### 4.2 Authenticated surface

The authenticated SPA exposes the following major areas:

- dashboard
- activity
- account security
- registry
- AI system detail
- connect AI application onboarding
- risk assessment
- compliance
- compliance calendar
- approvals
- audit log
- bulk controls
- decision trace
- runtime monitoring
- exit readiness
- incidents
- telemetry policy
- telemetry adapter
- retention control
- settings
- integrations
- billing
- portfolio control
- analytics center
- governance maturity
- knowledge center

## 5. Core capability domains

### 5.1 AI system registry and onboarding

The registry is the canonical system inventory for governed AI applications.

It supports:

- AI system creation and editing
- system detail pages
- auto-registration from onboarding manifests
- per-system control and workflow linkage
- per-system telemetry policy overrides
- runtime-linked onboarding from connected SDK/gateway context

The onboarding flow is stronger than a plain CRUD form. The "connect AI application" wizard infers context such as:

- provider
- model
- gateway
- purpose
- domain
- deployment context
- runtime risk signals

It then computes a draft risk classification and suggested controls.

### 5.2 Risk and compliance management

The governance layer includes:

- baseline risk assessments tied to systems
- framework control catalog and system control assignments
- bulk control assignment
- evidence tracking
- deadline/calendar visibility
- exit-readiness indicators

The product is explicitly framed around common governance frameworks, including:

- EU AI Act
- NIST AI RMF
- ISO/IEC 42001
- additional region/domain overlays through regional profiles and law packs

### 5.3 Approval workflows

Approval workflows are not simple approval rows. They act as governance routing objects influenced by fields such as:

- financial impact
- PII usage
- customer-facing exposure
- reversibility
- strategic impact
- safety criticality

These inputs influence:

- decision tier
- committee type
- reviewer/approver expectations
- downstream governance posture

### 5.4 Decision trace and auditability

The platform has a dedicated decision-audit model for AI decisions and sensitive workflows.

Decision traces capture:

- business objective
- prompt/query
- context and input sources
- input snapshot
- model and provider metadata
- AI output
- human-reviewed output
- override rationale
- sealed hash
- versioned edits
- retention and legal-hold state

This is materially stronger than normal mutable record editing and is clearly intended for:

- regulator readiness
- internal audit
- diligence and M&A review
- operational traceability for consequential AI use

### 5.5 Runtime telemetry and policy engine

Runtime monitoring is a major product pillar.

The platform accepts telemetry through:

- `POST /api/telemetry/ingest`
- `POST /api/telemetry/sdk-ingest`
- `POST /api/telemetry/sdk-evaluate`

The policy engine evaluates signals such as:

- drift
- bias
- safety signals
- toxicity
- PII flags
- override-rate anomalies
- error-rate anomalies
- restricted prompt patterns

Policy outputs include:

- allow
- warn
- escalate
- block

Telemetry policy can exist at multiple layers:

- platform default
- portfolio default
- organization override
- system override

The application also includes telemetry policy recommendations, impact analysis, and assistive policy drafting endpoints, which means it is trying to act as both a control surface and a policy-tuning advisor.

### 5.6 Inline gateway and enforcement

One of the strongest differentiators in the repo is the inline gateway mode.

The gateway supports multiple providers and provider shapes, including:

- OpenAI
- Anthropic
- Gemini
- Azure OpenAI
- Vertex AI
- AWS Bedrock
- generic OpenAI-compatible providers

The gateway can:

- inspect the prompt before upstream execution
- block requests before the model call
- inspect the model response before user delivery
- block the response after provider execution
- apply tool allowlists
- apply tool argument policy
- use upstream provider credentials stored in an encrypted vault

This makes the application a real runtime enforcement point rather than a passive monitoring dashboard.

### 5.7 Agent governance and advanced runtime policy

The repo includes an advanced runtime governance layer beyond simple thresholds.

It supports:

- legal profiles such as `global`, `eu`, `uk`, `us`, and `india`
- law packs such as `eu_finance`, `uk_finance`, and `us_finance`
- capability profiles such as `banking_copilot`, `hr_assistant`, and `devops_assistant`
- strictness modes such as `normal` and `high_risk`
- actor- or workflow-specific agent governance overrides

This means runtime policy can be shaped by:

- jurisdiction
- regulated industry context
- allowed capability surface
- business-specific restrictions

The shared governance logic also includes fact-provenance and action-confirmation verifiers, which suggests the product is designed to evaluate whether AI outputs are claiming facts or actions that have not been proven by authoritative records.

### 5.8 Incidents and operational response

The incident model is tightly coupled to telemetry and runtime outcomes.

The incident capability supports:

- incident creation and summary views
- severity and state management
- assignee selection
- resolution suggestions
- postmortem tracking
- regulatory-notification tracking
- linkage to telemetry evidence and decision traces

This makes the platform closer to an AI operations response console than a static compliance dashboard.

### 5.9 Enterprise identity and tenant administration

Identity and admin capabilities are broad.

Supported identity/admin features:

- local auth
- password change
- password reset
- MFA enrollment, verification, disablement, and recovery code regeneration
- SAML SSO
- OIDC SSO
- domain allowlisting
- DNS TXT domain verification
- JIT provisioning
- invite create/resend/revoke/accept
- organization switching across memberships

This is one of the main reasons the application behaves like a multi-tenant enterprise product rather than a single-tenant dashboard.

### 5.10 Integrations, connectors, and threat intelligence

The integrations area goes beyond Jira.

The repo includes support for:

- Jira integration
- configurable integration connectors
- governed event emission
- governance automation rules
- threat-intelligence configuration and matching
- regional governance profile configuration

Threat intelligence can include:

- built-in indicators
- custom indicators
- external feed ingestion
- provider types such as generic JSON, OpenPhish, and MISP-style feeds

This is a notable expansion beyond standard AI governance functionality.

### 5.11 Portfolio oversight

The platform has a parent portfolio layer above individual tenant organizations.

This supports:

- multiple operating companies under one portfolio
- roll-up oversight without breaking org isolation
- portfolio telemetry defaults
- portfolio-wide exit-readiness and incident posture

This is especially relevant for PE-style roll-ups, holding companies, and regulated group structures.

### 5.12 Analytics and maturity

The repo includes explicit analytics and governance-maturity modules.

Analytics includes:

- overview metrics
- distributions
- trend series
- report presets
- report-builder routes

Governance maturity includes:

- overall maturity score
- domain scores
- strengths
- gaps
- next actions

These features position the product as both an operating system and an executive reporting layer.

## 6. Technical architecture

### 6.1 Frontend

The frontend is a React 18 SPA built with Vite.

Key frontend characteristics:

- route-based application shell using `wouter`
- lazy-loaded pages
- React Query for data fetching and caching
- Radix-based component primitives
- Tailwind CSS styling
- public/authenticated route split
- sidebar-based application shell for authenticated users

The frontend and the public marketing/application-evaluation surface live in the same app.

### 6.2 Backend

The backend is an Express 5 application that:

- bootstraps auth, security middleware, tenant resolution, and route registration
- starts background workers in process when the runtime allows it
- exposes health and readiness endpoints
- logs request-level structured events for API traffic
- serves the SPA in production
- optionally mounts Vite middleware in development

The backend is organized around services rather than one monolithic route file only. The `server/services` folder includes service boundaries for:

- systems
- workflows
- controls
- audit
- decision audits
- incidents
- telemetry
- telemetry adapters
- telemetry policy
- governance events and automation
- portfolio
- subscriptions
- SSO
- invites
- Jira
- background jobs
- retention
- analytics
- workspace search
- threat intelligence

### 6.3 Data layer

The data layer uses:

- PostgreSQL
- Drizzle ORM
- shared schema definitions under `shared/schema.ts`

The repo does not use an in-memory fallback for normal runtime. The exported storage instance is `DatabaseStorage`, which means the app should be understood as database-backed by default.

### 6.4 Shared domain layer

The `shared/` directory is important. It contains business-domain logic and not only type definitions.

Examples include:

- governance policy registry
- law packs
- telemetry policy advisory models
- analytics response models
- governance maturity models
- regional governance profile models
- threat-intelligence models
- runtime-governance verifiers

This is a meaningful design choice. Governance logic is centralized as shared code instead of being scattered only in route handlers.

### 6.5 Deployment shapes

The repo supports several deployment patterns:

- normal Node server process
- Vercel with serverless API entry at `api/[...route].ts`
- Firebase Hosting for frontend-only deployment against an external backend
- sidecar/container deployment for inline gateway use

The sidecar deployment is especially significant because it supports customer-environment inline enforcement use cases.

## 7. Security, tenancy, and control model

### 7.1 Multi-tenancy

The product is strongly built around organization isolation.

Tenant resolution uses:

- `X-Organization-Id` request header when present
- current organization in the session
- active membership fallback logic

Tenant-scoped routes require:

- authentication
- tenant resolution
- role checks for privileged operations

The design intent is clear:

- every tenant-bound record should carry `organizationId`
- services and storage methods should receive explicit org scope
- unscoped tenant access is intentionally discouraged

### 7.2 Session and auth posture

The app supports:

- session-backed auth
- MFA
- local and federated identity
- org switching for users with multiple memberships

The runtime config validator enforces stronger production settings, including:

- required secrets
- `PUBLIC_APP_URL`
- CORS origin validation
- CSRF enforcement
- secure cookie rules for `SameSite=None`

### 7.3 Security middleware

The app applies:

- CSP
- HSTS in production
- frame denial
- referrer policy
- permissions policy
- CSRF protection for API routes

The repo also includes security-focused scripts and documentation for:

- SAST
- dependency audit
- secret scanning
- SBOM generation
- secure development lifecycle expectations
- incident response

### 7.4 Auditability

The application audit posture is broad and cross-cutting.

Audited areas include:

- auth events
- SSO and identity administration
- invite lifecycle actions
- domain verification and routing
- workflow events
- telemetry ingestion
- retention and legal-hold actions
- admin configuration changes

The audit layer also includes chain verification behavior for tamper-evident inspection.

## 8. Data model summary

The schema includes core tables for:

### 8.1 Identity and tenancy

- `users`
- `organizations`
- `memberships`
- `organization_domains`
- `organization_invites`

### 8.2 Portfolio structure

- `portfolios`
- `portfolio_organizations`
- `portfolio_memberships`
- `portfolio_telemetry_policies`

### 8.3 Governance and operations

- `ai_systems`
- `risk_assessments`
- `compliance_controls`
- `system_controls`
- `approval_workflows`
- `agent_governance_profiles`
- `evidence_files`
- `decision_audits`
- `decision_audit_versions`
- `decision_audit_sources`
- `audit_logs`
- `admin_audit_events`

### 8.4 Runtime and incident operations

- `organization_telemetry_policies`
- `system_telemetry_policies`
- `organization_telemetry_adapters`
- `telemetry_reviewer_exceptions`
- `ai_telemetry_events`
- `ai_incidents`

### 8.5 Admin and commercial operations

- `background_jobs`
- `organization_subscriptions`
- `jira_integrations`
- `notifications`
- `leads`
- `marketing_events`

Overall, the schema confirms that this is a full operating product rather than a thin prototype.

## 9. API surface summary

The backend exposes a broad API surface grouped roughly as follows:

- health and readiness
- client error monitoring
- settings and organization admin
- members, invites, and domains
- SAML and OIDC flows
- auth, password reset, and MFA
- leads and marketing tracking
- workspace search and organization switching
- AI systems and auto-registration
- controls and workflows
- audit logs and chain verification
- decision audits, versions, retention, and legal hold
- telemetry ingest, summaries, and reviewer actions
- inline gateway provider routes
- incidents and resolution suggestion
- notifications and digest
- exports and evidence download
- analytics and report builder
- governance maturity
- governance events and automation
- integrations and connector testing
- threat intelligence
- regional governance profile
- dashboard and activity data
- calendar events
- portfolio control

The presence of public-facing ingest and gateway routes means this application exposes both human-facing and machine-facing APIs.

## 10. Operational model

### 10.1 Background jobs

The app uses a small persistent background queue stored in the database.

Current queued side effects include:

- invite delivery via SMTP
- invite delivery via webhook
- monitoring webhook delivery

The worker runs in-process for normal deployments. On Vercel, cron routes replace in-process timers.

### 10.2 Observability

The application emits:

- API request logs
- backend process/error events
- client runtime error events

Optional webhook-based forwarding can send those events to an external monitoring sink.

### 10.3 Files and storage

Evidence uploads and exports are still filesystem-based by default.

This is acceptable for some standard Node deployments, but the repo itself documents an important limitation for serverless targets:

- writable paths such as `/tmp` are not durable object storage

For durable production evidence/export handling on serverless platforms, object storage is still needed.

### 10.4 Command surface

Important repo commands include:

- `npm run dev`
- `npm run build`
- `npm run check`
- `npm run test:regression:all`
- `npm run test:tenant:isolation`
- `npm run test:tenant:routes`
- `npm run security:all`
- `npm run openapi:lint`
- `npm run demo:prep`
- `npm run demo:linked-runtime-app`

The script surface is broad and includes targeted regression coverage for:

- auth and RBAC
- routing
- tenancy
- telemetry
- governance policy
- background jobs
- SSO
- CSP and CSRF

## 11. SDKs, examples, and extension assets

The repo includes:

- a local Node telemetry SDK package
- a local Python telemetry SDK package
- a linked runtime demo application under `examples/linked-runtime-demo`

This matters because the product is designed to be integrated into external AI applications, not only used as a standalone governance dashboard.

The linked runtime demo is particularly useful for understanding the intended product story:

- the frontline user stays in a task-specific workspace
- AI Control Tower governs prompts and outputs behind the scenes
- runtime evidence appears in the governance console in parallel

That is a strong clue about the actual product vision.

## 12. Strengths visible in the current codebase

The strongest aspects of the application appear to be:

- serious multi-tenant design intent
- strong identity and org administration surface
- unusually rich runtime governance and inline gateway capabilities
- portfolio-aware governance model
- decision trace and retention depth
- strong operational documentation
- meaningful regression and security script coverage
- credible demo and SDK story for customer integration

## 13. Constraints, caveats, and notable observations

### 13.1 Filesystem durability is still a production concern

Evidence uploads and export artifacts are still locally stored by default. This is workable in some hosted-node environments, but it is a weak point for serverless or horizontally scaled deployments unless replaced with object storage.

### 13.2 In-process background workers are a simple deployment fit, not a final-scale architecture

The current queue worker design is explicitly described as safe for simpler single-service deployments. If the product grows into multiple worker replicas or stricter delivery guarantees, that area will need hardening.

### 13.3 Documentation inconsistency exists around password reset

One documentation index note still says self-service password recovery is not fully implemented. That appears stale.

Observed evidence in the repo shows:

- a public reset page
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- password reset delivery service and production secret validation

The implementation appears present, so the documentation note should be treated as outdated unless there is an unstated delivery caveat outside this repo.

### 13.4 The route file is large

The service layer is meaningful, but `server/routes.ts` still carries a very large amount of route registration and orchestration. That is a maintainability hotspot and a likely future refactor candidate if the application continues expanding.

### 13.5 The product scope is already broad

This codebase spans:

- governance
- identity
- security operations
- telemetry
- incidents
- buyer-facing marketing
- integrations
- portfolio oversight
- analytics

That breadth is powerful, but it also means feature work can easily cross multiple domains and require care around tenancy, RBAC, auditability, and runtime policy interactions.

## 14. Recommended mental model for future work

When making changes in this repo, the safest mental model is:

AI Control Tower is a multi-tenant enterprise AI governance control plane with both administrative UI workflows and runtime AI enforcement responsibilities.

That means most non-trivial changes should be evaluated against:

- tenant isolation
- org-role access rules
- audit logging requirements
- runtime policy implications
- decision traceability
- retention/legal-hold behavior
- deployment differences between long-running Node and serverless targets

## 15. Source basis for this report

This report was assembled from the repo implementation and project docs, with the highest-value inputs coming from:

- `README.md`
- `package.json`
- `client/src/App.tsx`
- `server/index.ts`
- `server/app.ts`
- `server/env.ts`
- `server/security.ts`
- `server/tenant.ts`
- `server/routes.ts`
- `server/storage.ts`
- `shared/schema.ts`
- `shared/governance-policy-registry.ts`
- `shared/law-packs.ts`
- `shared/runtime-governance-verifiers.ts`
- `shared/analytics-overview.ts`
- `shared/governance-maturity.ts`
- `shared/regional-governance-profile.ts`
- `shared/telemetry-policy-advisor.ts`
- `shared/threat-intelligence.ts`
- `docs/product-overview.md`
- `docs/route-by-route-user-manual.md`
- `docs/admin-operations-guide.md`
- `docs/role-based-usage-guide.md`
- `docs/architecture-data-flow-summary.md`
- `docs/multi-tenant-hardening.md`
- `docs/inline-gateway-mode.md`
- `docs/background-jobs.md`
- `docs/monitoring-observability.md`
- `docs/security/sdlc.md`
- `docs/security/incident-response.md`
- `docs/vercel-deployment.md`
- `docs/firebase-hosting-deployment.md`
- `docs/gateway-sidecar-deployment.md`
- `examples/linked-runtime-demo/README.md`
- `packages/telemetry-sdk-node/README.md`
- `packages/telemetry-sdk-python/README.md`
