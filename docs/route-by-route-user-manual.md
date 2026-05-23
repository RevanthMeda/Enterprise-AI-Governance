# AI CONTROL GRID by Arcturos Route-by-Route User Manual

This document explains every major user-facing route, what appears on it, what it is for, and how it connects to the rest of the product.

## 1. Public routes

## `/`
### Purpose
Main landing page.

### What is on the page
- hero section
- trust and proof sections
- use cases
- differentiators
- operations section
- workflow story
- pricing
- FAQ
- footer links

### What it is used for
- explain the product
- direct users to demo, pilot, docs, login, and trust content

### Key actions
- `Book a Demo`
- `Start a Pilot`
- `Review the API`
- footer links to security, privacy, terms

### Linked routes
- `/book-demo`
- `/start-pilot`
- `/api-docs`
- `/auth/login`
- `/security`
- `/privacy`
- `/terms`
- `/trust-center`

## `/auth/login`
### Purpose
User sign-in page.

### What is on the page
- back-to-welcome-page actions
- username/email field
- password field
- login button
- SSO organization slug field
- SSO button
- MFA step when required
- recovery-code path
- account recovery guidance

### How to use it
1. Enter username or email
2. Enter password
3. If MFA is required:
   - enter authenticator code
   - or switch to recovery code flow
4. Sign in
5. If the URL contains `next`, you are redirected there after login

### Notes
- SSO login is initiated from the same page using an organization slug
- local accounts can request a reset link directly from this page
- SSO-managed identities should be recovered with the external identity provider

### Linked routes and flows
- `/`
- `/auth/reset-password`
- SSO backend start route
- post-login redirect to requested route or `/dashboard`

## `/auth/reset-password`
### Purpose
Reset a local-account password using a signed reset token.

### What is on the page
- new password field
- confirm password field
- reset submit action
- success path back to login

### How to use it
1. Open the reset link delivered by email or webhook
2. Enter a new password
3. Confirm the password
4. Submit the reset
5. Return to `/auth/login`

### Notes
- this route is intended for local accounts only
- SSO-managed users should reset credentials with their identity provider

## `/invite/accept`
### Purpose
Accept an organization invite.

### What is on the page
- invite acceptance flow
- user-facing error message if token is missing or invalid

### How to use it
Open the invite link containing a token.

## `/book-demo`
### Purpose
Demo request lead form.

### What is on the page
- full name
- work email
- company
- role
- team size
- challenge description

### What it does
Captures interest for a sales/demo conversation.

## `/start-pilot`
### Purpose
Pilot request lead form.

### What it does
Captures pilot intent.

## `/thank-you`
## `/book-demo/thank-you`
## `/start-pilot/thank-you`
### Purpose
Public confirmation pages for successful lead-form actions.

## `/security`
### Purpose
Public security page.

## `/privacy`
### Purpose
Public privacy page.

## `/terms`
### Purpose
Public terms page.

## `/trust-center`
### Purpose
Public trust and buyer-assurance page.

### What it is used for
- explain isolation
- explain security posture
- support buyer/vendor review

## `/api-docs`
### Purpose
Public API docs entry page.

### What is on the page
- identity API docs card
- platform API docs card
- links to Redoc pages
- links to YAML specs

### Linked routes
- `/api-docs/identity.html`
- `/api-docs/platform.html`

---

## 2. Authenticated core routes

## `/dashboard`
### Purpose
Primary authenticated landing page.

### What is on the page
- governance KPIs
- risk distribution
- compliance visuals
- recent systems
- recent workflows
- operational readiness
- action board
- program launch wizard
- operational watchlist

### What it is used for
- daily operating overview
- first-run setup guidance
- admin and reviewer triage

### Common next clicks
- registry
- approvals
- compliance
- audit
- settings
- activity

## `/activity`
### Purpose
Personal activity page.

### What is on the page
- pending reviews
- owned systems
- overdue controls
- unread notifications
- recent activity timeline

### What it is used for
Shows work relevant to the current user.

## `/account-security`
### Purpose
Personal credential and MFA management page.

### What is on the page
- MFA enrollment and verification
- recovery-code regeneration
- MFA disable flow
- password change flow

### What it is used for
- enable or disable personal MFA
- rotate recovery codes
- change a local password without using admin settings

### Notes
- available to all authenticated users
- separate from `/settings`, which remains organization-admin configuration

## `/registry`
### Purpose
AI system inventory.

### What is on the page
- search
- filters
- clear filters
- export
- register-system modal
- clickable system cards

### What it is used for
View and manage the organization’s AI system inventory.

### How to use it
1. Search or filter the list
2. Click a system card for details
3. Register a system using the modal
4. Export the list if needed

### Linked routes
- `/systems/:id`

## `/systems/:id`
### Purpose
Detailed page for one AI system.

### Tabs
- Overview
- Controls
- Workflows
- Evidence
- Audit

### What it is used for
This is the canonical record for one AI system.

### How to use it
- review system metadata
- inspect controls
- inspect linked workflows
- upload and review evidence
- inspect system-specific audit activity

## `/risk`
### Purpose
Risk assessment page.

### What is on the page
- risk-tier summaries
- assessment history
- new assessment workflow

### What it is used for
Create and review risk classifications for AI systems.

## `/compliance`
### Purpose
Framework management page.

### What is on the page
- framework summaries
- control tables
- status information
- export

### Frameworks shown
- EU AI Act
- NIST AI RMF
- ISO/IEC 42001

### What it is used for
Track compliance coverage and control state.

## `/calendar`
### Purpose
Governance and compliance event calendar.

### What is on the page
- monthly calendar grid
- event counts
- event-type filter
- KPI cards
- right-side event list

### What it is used for
Operational deadline and event tracking.

### Linked routes
- overdue-items card links to `/approvals`

## `/approvals`
### Purpose
Approval workflow center.

### What is on the page
- tabbed workflow list
- counts by status
- workflow create modal
- workflow routing metadata

### Tabs
- all
- pending
- in review
- escalated
- approved
- rejected

### What it is used for
Manage AI approval flows and route higher-risk decisions correctly.

### Routing behavior
Each workflow can carry:
- estimated financial impact
- PII usage
- customer-facing flag
- reversibility
- strategic impact
- safety-critical flag

These drive the tier/committee posture visible on the page.

## `/audit`
### Purpose
Organization-wide audit trail.

### What is on the page
- activity list
- filters
- export

### What it is used for
Inspect and export logged activity across the tenant.

## `/bulk-controls`
### Purpose
Bulk control assignment page.

### Layout
- systems panel
- controls panel
- preview panel

### What it is used for
Apply multiple controls to multiple systems efficiently.

---

## 3. Advanced governance routes

## `/decision-trace`
### Purpose
Decision trace center.

### What is on the page
- KPI tiles
- decision trace form
- telemetry summary
- immutable audit chain panel
- version history
- recent decision traces

### What it is used for
Record, inspect, revise, and validate traced AI-assisted decisions.

### Main actions
- create trace
- edit a trace
- save versioned changes on sealed traces
- inspect version history

## `/exit-readiness`
### Purpose
Executive diligence / readiness scorecard.

### What is on the page
- KPI tiles with status
- evidence coverage summary
- routing posture summary
- startup guidance for fresh organizations

### What it is used for
Summarize the maturity of AI governance for internal leadership or M&A-style diligence.

## `/incidents`
### Purpose
AI incident response page.

### What is on the page
- KPI tiles
- create incident form
- incident cards
- playbook steps
- review/postmortem fields

### What it is used for
Track incidents from detection through containment, resolution, and postmortem.

### Main actions
- create incident
- update status
- add root cause
- add post-incident review
- link affected decision traces
- record regulatory notifications

---

## 4. Admin and operating-control routes

## `/settings`
### Purpose
Main organization admin console.

### Tabs
- Access
- Identity
- Security
- Activity
- Governance

### Access tab
Used for:
- viewing organization info
- inviting users
- resending/revoking invites
- managing members

### Identity tab
Used for:
- auth mode selection
- SAML/OIDC settings
- JIT settings
- domain management
- DNS verification
- SSO start URL copy

### Security tab
Used for:
- MFA enrollment
- recovery-code handling
- MFA disable/regeneration
- enterprise-security signposting

### Activity tab
Used for:
- admin activity review
- activity filtering
- CSV export
- background job health
- failed-job retry

### Governance tab
Used for:
- framework summary
- region/scope visibility
- important deadlines

## `/integrations`
### Purpose
Integration configuration page.

### Current primary integration
- Jira

### Main actions
- save Jira config
- test connection

## `/billing`
### Purpose
Subscription and plan management page.

### Main actions
- inspect plan tier
- update billing email
- update seat limit
- inspect usage summary

## `/telemetry-policy`
### Purpose
Org telemetry threshold configuration.

### Main actions
- edit warning and critical thresholds
- toggle warning notifications
- toggle auto-escalation
- reset org override if inherited from portfolio

## `/telemetry-adapter`
### Purpose
External telemetry ingest setup page.

### Main actions
- enable/disable adapter
- set allowed gateways
- rotate ingest key
- copy endpoint and example usage

## `/retention-control`
### Purpose
Retention and legal-hold admin page.

### Main actions
- inspect retention summary
- apply/release legal hold
- run retention enforcement

## `/portfolio-control`
### Purpose
Portfolio-level roll-up page.

### Main actions
- select portfolio
- review aggregate metrics
- compare operating companies
- manage portfolio telemetry policy defaults

---

## 5. Common route connections

Registry connects to:
- system detail
- risk
- approvals
- audit

Approvals connects to:
- systems
- decision trace
- Jira integration
- incidents

Decision trace connects to:
- exit readiness
- incidents
- telemetry
- audit verification

Telemetry connects to:
- telemetry policy
- telemetry adapter
- incidents
- exit readiness

Admin identity connects to:
- invites
- SSO
- domains
- JIT provisioning

Portfolio control connects to:
- organization-level posture
- inherited telemetry policy defaults

---

## 6. Recommended navigation patterns

### For an admin
`/dashboard` -> `/settings` -> `/registry` -> `/approvals` -> `/decision-trace`

### For a reviewer
`/dashboard` -> `/approvals` -> `/activity`

### For a system owner
`/registry` -> `/systems/:id` -> `/approvals` -> `/decision-trace`

### For an auditor
`/audit` -> `/compliance` -> `/decision-trace`

### For a portfolio operator
`/portfolio-control` -> `/exit-readiness` -> `/incidents`
