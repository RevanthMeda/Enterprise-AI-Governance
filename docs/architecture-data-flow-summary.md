# AI CONTROL GRID by Arcturos Architecture and Data Flow Summary

## 1. System architecture

The application has three main layers:

1. React frontend
2. Express backend
3. PostgreSQL database

Supporting operational layers:
- background job worker
- monitoring sink integration
- telemetry threshold engine
- audit chain logic
- deployment smoke tooling

## 2. Frontend architecture

The frontend is a React SPA.

Key characteristics:
- route-based UI
- public and authenticated route split
- lazy-loaded page bundles
- sidebar-based authenticated shell
- query-driven data fetching
- admin pages embedded into the same app shell

Important frontend routes include:
- public pages
- auth pages
- registry/risk/compliance/workflow pages
- decision/incident/telemetry pages
- admin settings and ops pages

## 3. Backend architecture

The backend is an Express application providing:
- session auth
- tenant-aware middleware
- identity routes
- admin routes
- CRUD/API routes for governance data
- background worker startup
- readiness and health endpoints

Core service areas:
- auth and session
- tenant enforcement
- decision audit
- incident management
- telemetry ingestion and threshold evaluation
- retention enforcement
- subscription/billing
- Jira integration
- portfolio control

## 4. Database model

The database stores:
- users
- organizations
- memberships
- organization domains
- AI systems
- system controls
- approval workflows
- audit logs
- notifications
- evidence
- risk assessments
- decision audits
- decision audit versions
- incidents
- telemetry events
- telemetry policies
- telemetry adapters
- subscriptions
- background jobs
- portfolios
- portfolio memberships
- portfolio organizations
- portfolio telemetry policies

## 5. Authentication flow

### Local login
1. user submits credentials
2. backend validates password
3. if MFA enabled, challenge is enforced
4. session is created
5. frontend fetches `/api/auth/user`
6. active organization context is loaded

### SSO login
1. user starts from login page with org slug
2. backend begins SAML or OIDC flow
3. identity provider returns user assertion/token
4. backend resolves org context
5. domains and membership/JIT rules are evaluated
6. session is created with current org

## 6. Tenant enforcement flow

The system enforces tenant boundaries by:
- storing org-scoped data
- checking current organization membership
- attaching org context to requests
- requiring org-scoped access in services and storage

At runtime:
1. request arrives
2. session is read
3. active organization is resolved
4. org membership is checked
5. route/service executes in tenant scope

## 7. Approval and risk routing flow

Approval workflows are created with routing inputs such as:
- financial impact
- PII usage
- customer-facing flag
- reversibility
- strategic impact
- safety criticality

These fields influence:
- decision tier
- committee type
- blocking reason
- required approvers

This lets workflows act as governance routing objects rather than just simple status rows.

## 8. Decision trace flow

Decision traces store:
- business objective
- prompt and model evidence
- input sources and snapshot
- explainability factors
- AI output
- human-reviewed output
- override rationale
- documentation status
- sealed hash
- version history
- outcomes

Flow:
1. workflow exists or sensitive decision is identified
2. trace is created or linked
3. model/context/human-review data is captured
4. record is sealed
5. later edits create version snapshots instead of silently replacing the prior sealed state
6. archived traces become immutable

## 9. Audit model

Audit logging is broad and cross-cutting.

It captures:
- auth events
- invite events
- domain events
- workflow events
- telemetry ingest events
- retention/legal-hold actions
- admin configuration actions

The audit log also supports:
- cryptographic chain verification
- latest hash inspection

## 10. Telemetry flow

Telemetry can be ingested through:
- authenticated internal telemetry endpoints
- public SDK/gateway ingest using rotated org-scoped keys

Telemetry event fields include:
- system
- model
- provider
- gateway
- event type
- severity
- drift score
- bias flags
- summary
- metadata

Threshold evaluation then checks:
- drift
- bias
- safety
- override spikes
- error-rate anomalies

Depending on the effective policy:
- warnings may notify
- critical events may escalate to incidents

## 11. Telemetry policy inheritance

Policy resolution order:

1. explicit org override
2. portfolio default
3. platform default

This allows:
- local org tuning
- parent portfolio governance defaults
- sensible fallback behavior

## 12. Incident flow

Incidents support:
- category
- severity
- status
- playbook
- root cause
- post-incident review
- affected decision traces
- regulatory notifications
- postmortem completion

Flow:
1. incident is opened manually or through telemetry escalation
2. containment and resolution are tracked
3. post-incident review is completed
4. linked decision traces and regulatory notes are preserved

## 13. Retention flow

Decision traces carry retention metadata.

Retention behavior:
- traces due for archive can be archived automatically or manually
- legal hold can block archival
- legal hold requires a reason
- archived traces are immutable

This provides a stronger records-control posture than ordinary mutable records.

## 14. Background jobs

Persistent background jobs are used for:
- invite delivery
- monitoring webhook delivery

Worker behavior includes:
- polling
- retry/backoff
- failed state
- admin retry capability

Queue health is exposed in:
- readiness endpoint
- settings activity/admin surfaces

## 15. Portfolio model

A portfolio layer exists above organizations.

Purpose:
- let a parent operator view multiple operating companies
- keep org data isolated underneath
- enable shared governance defaults such as telemetry policy inheritance

Portfolio control surfaces show:
- aggregate metrics
- per-org metrics
- inherited policy status

## 16. Billing and integration model

Billing:
- subscription tier
- status
- billing email
- seat limit
- usage summary

Integrations:
- Jira config
- workflow-linked external ticket behavior

These are organization-scoped.

## 17. Public trust and documentation model

The application exposes public buyer and integrator surfaces:
- trust center
- API docs
- Redoc pages
- lead capture pages

This supports:
- buyer trust review
- API evaluation
- sales motion

## 18. Deployment model

Current target deployment model:
- frontend on Netlify
- backend on Render or equivalent Node host
- PostgreSQL database

Operational support exists for:
- health checks
- readiness checks
- smoke deployment validation
- monitoring hooks

## 19. Operational observability

Implemented operational features include:
- structured request logging
- stable error metadata
- readiness endpoint
- monitoring webhook integration
- client error capture
- background job visibility

These make the application more production-operable than a standard CRUD app.

## 20. Current technical caveat

Schema evolution is currently safest through controlled/manual DB delta application in this repository state because of prior `drizzle-kit push` rename-detection issues.

That is an operational note, not a runtime product failure, but it matters for deployment discipline.
