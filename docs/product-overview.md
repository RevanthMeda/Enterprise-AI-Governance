# AI CONTROL GRID by Arcturos Product Overview

## 1. What this application is

AI CONTROL GRID is an enterprise AI governance platform by Arcturos.

The product is founder-built by [Revanth Meda](https://ie.linkedin.com/in/revanth-meda-1ab294226) and shaped around the operating model he has discussed publicly on LinkedIn: replace spreadsheet-led AI governance with a live system for registration, risk assessment, control mapping, role-based approvals, and audit-ready evidence.

It is designed to give an organization one operating layer for:
- AI system inventory
- risk classification
- framework control mapping
- approvals and routing
- evidence management
- audit logging
- enterprise access and identity
- telemetry and incident response
- retention and legal hold
- portfolio-level oversight

It is not just a registry and not just a compliance dashboard. In the current state, it behaves more like an operational control grid for governed AI programs.

## 2. Core outcomes it supports

The product helps a company do the following in one place:

1. register AI systems and maintain a canonical inventory
2. classify systems by risk and document decision context
3. assign and track compliance controls
4. collect evidence and keep it tied to systems and controls
5. route approval workflows based on business and governance risk
6. record audit trails for identity, workflows, controls, telemetry, and admin actions
7. manage enterprise identity with SAML, OIDC, domains, invites, and JIT provisioning
8. monitor telemetry thresholds and escalate serious issues into incidents
9. preserve records through retention, archiving, and legal hold
10. provide executive and portfolio-level readiness views for diligence or oversight

## 3. Who the product is for

Primary users:
- Organization administrators
- CRO / risk leaders
- CISO / security leaders
- Compliance leads
- Reviewers
- System owners
- Auditors
- Portfolio operators at a parent entity level

Secondary users:
- Enterprise buyers evaluating the platform
- Security reviewers
- Integration teams using the API or telemetry ingest
- IT teams configuring SSO and domain routing

## 4. Public product surface

The public side of the application includes:
- landing page
- demo and pilot lead forms
- security, privacy, and terms pages
- trust center
- API docs index and Redoc pages
- login
- invite acceptance

This lets prospects, customers, and integrators evaluate the platform before authentication.

## 5. Authenticated product surface

After sign-in, the application provides:
- dashboard
- activity
- AI system registry
- system detail pages
- risk assessment
- compliance management
- compliance calendar
- approvals
- audit log
- bulk controls
- decision trace center
- exit readiness
- incident response
- settings
- integrations
- billing
- telemetry policy
- telemetry adapter
- retention control
- portfolio control

## 6. Major capability groups

### 6.1 AI governance workflow
- AI registry
- risk assessments
- control mapping
- evidence
- approval workflows
- audit log

### 6.2 Enterprise identity and access
- local auth
- MFA
- SAML
- OIDC
- org invites
- domain allowlisting
- DNS domain verification
- JIT provisioning
- enforce SSO
- multi-org session handling

### 6.3 AI decision audit and diligence
- decision traces
- human override capture
- rationale capture
- versioned sealed records
- outcome tracking
- audit chain verification
- exit-readiness scorecard

### 6.4 Monitoring and incident response
- telemetry events
- threshold policies
- SDK/gateway ingest
- automatic threshold breach evaluation
- incident escalation
- post-incident review
- regulatory notification capture

### 6.5 Operational governance and administration
- background jobs
- queue health
- readiness endpoint
- request/error correlation
- admin activity
- retention and legal hold
- portfolio oversight

### 6.6 Commercial and buyer-facing features
- trust center
- Jira integration
- billing and subscription controls
- portfolio control
- API documentation

## 7. Tenancy and portfolio model

The application is multi-tenant.

Each organization is isolated. Users are attached through memberships. Most business records are org-scoped.

A parent portfolio layer now exists above organizations so a portfolio operator can see aggregate posture across multiple operating companies while preserving organization-level isolation underneath.

## 8. Decision traceability model

The platform has a dedicated decision-trace capability that captures:
- business objective
- system/workflow linkage
- model name and version
- prompt/query
- context
- input sources
- input snapshot
- explainability factors
- AI output
- human-reviewed output
- override rationale
- sealed record hash
- versioned edit history
- outcome summary

This is important for:
- internal audit
- regulator readiness
- M&A diligence
- AI roll-up operating models

## 9. Telemetry and incident model

The platform accepts telemetry in two ways:
- authenticated internal API path
- public SDK/gateway ingest path using rotated org-scoped keys

Telemetry can be evaluated against:
- org-level thresholds
- portfolio inherited defaults
- platform defaults

Critical threshold breaches can:
- create notifications
- escalate into incidents

Incidents support:
- severity/state tracking
- playbooks
- root cause
- post-incident review
- affected decision traces
- regulatory notifications
- postmortem completion

## 10. Retention and immutability model

Decision traces support:
- retention deadlines
- archiving
- legal hold
- immutable archived state
- versioned edits before archival

This creates a stronger record-management posture than a normal mutable CRUD workflow.

## 11. Current maturity

### Strong areas
- multi-tenant hardening
- identity federation and org admin
- registry/risk/compliance/workflow core
- telemetry thresholding
- decision trace foundations
- incident handling foundations
- portfolio oversight
- public trust/docs surface
- deploy/readiness/ops instrumentation

### Important remaining gap
- a final hosted-browser acceptance pass is still worth doing after deployment with production SMTP/SSO wiring

### Secondary polish gaps
- some low-priority UI polish remains
- dependency and bundle trimming should continue as the product surface grows

## 12. Suggested first-time usage path

For a new organization admin:

1. Sign in
2. Open Settings
3. Configure identity mode and domains
4. Invite team members
5. Register AI systems
6. Run risk assessments
7. Route approval workflows
8. Record decision traces for sensitive decisions
9. Configure telemetry policy and adapter if external monitoring is needed
10. Review exit readiness and portfolio control as the program matures

## 13. Why the application matters

This application now supports both:
- day-to-day AI governance execution
- executive, diligence, and operating oversight

That combination is what makes it materially different from a simple compliance checklist tool.
