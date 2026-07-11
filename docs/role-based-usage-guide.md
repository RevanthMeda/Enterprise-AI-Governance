# AI CONTROL GRID by ACTURUS Role-Based Usage Guide

This guide explains how each core role should use the application.

## 1. Admin

### Main objective
Configure the organization, operate governance workflows, and maintain tenant health.

### Primary pages
- `/dashboard`
- `/settings`
- `/registry`
- `/approvals`
- `/decision-trace`
- `/exit-readiness`
- `/telemetry-policy`
- `/telemetry-adapter`
- `/retention-control`
- `/integrations`
- `/billing`
- `/portfolio-control` if relevant

### Typical workflow
1. check dashboard readiness and watchlist
2. manage identity or members in settings
3. review approvals and escalations
4. inspect decision traces for sensitive work
5. review incidents and telemetry thresholds
6. check job health and activity

## 2. CRO

### Main objective
Review enterprise AI risk posture and high-risk decisions.

### Primary pages
- `/dashboard`
- `/risk`
- `/approvals`
- `/compliance`
- `/exit-readiness`
- `/incidents`

### Typical workflow
1. review risk posture from dashboard
2. inspect risk assessments
3. review Tier 2 and Tier 3 approval items
4. inspect open incidents and containment posture
5. use exit-readiness KPIs to monitor governance maturity

## 3. CISO

### Main objective
Review security posture around AI systems, identity, incidents, and telemetry.

### Primary pages
- `/dashboard`
- `/settings`
- `/incidents`
- `/telemetry-policy`
- `/telemetry-adapter`
- `/audit`
- `/trust-center`

### Typical workflow
1. review identity/security posture
2. inspect high-severity incidents
3. tune telemetry thresholds
4. ensure adapter keys and gateways are controlled
5. review audit logs for sensitive admin actions

## 4. Compliance Lead

### Main objective
Maintain framework coverage, evidence discipline, and approval readiness.

### Primary pages
- `/compliance`
- `/registry`
- `/systems/:id`
- `/audit`
- `/calendar`
- `/settings`

### Typical workflow
1. review control status across frameworks
2. inspect systems missing evidence or control progress
3. use the calendar for deadlines and overdue items
4. export evidence or audit data when needed

## 5. Reviewer

### Main objective
Review approval workflows and governance tasks.

### Primary pages
- `/dashboard`
- `/activity`
- `/approvals`
- `/decision-trace`

### Typical workflow
1. check activity for pending work
2. review approvals assigned to the reviewer
3. inspect linked decision traces when a decision needs deeper review

## 6. System Owner

### Main objective
Maintain their system records and support governance documentation.

### Primary pages
- `/registry`
- `/systems/:id`
- `/activity`
- `/approvals`
- `/decision-trace`

### Typical workflow
1. keep system metadata current
2. review controls and evidence on the system detail page
3. support or initiate approval requests
4. help maintain decision trace quality for their systems

## 7. Auditor

### Main objective
Inspect traceability, evidence, and audit posture without driving admin operations.

### Primary pages
- `/audit`
- `/compliance`
- `/decision-trace`
- `/systems/:id`
- `/exit-readiness` if granted

### Typical workflow
1. inspect audit records
2. review decision trace completeness
3. inspect system evidence
4. review framework coverage and exported records

## 8. Portfolio operator / portfolio admin

### Main objective
See roll-up posture across multiple operating companies.

### Primary pages
- `/portfolio-control`
- `/exit-readiness`
- `/incidents`
- `/telemetry-policy` at portfolio level where applicable

### Typical workflow
1. select a portfolio
2. compare operating companies
3. inspect documentation and incident posture
4. review Tier 3 exposure
5. manage inherited telemetry defaults if needed

## 9. Recommended page priority by role

Admin:
- Dashboard
- Settings
- Approvals
- Exit Readiness

CRO:
- Dashboard
- Risk
- Approvals
- Exit Readiness

CISO:
- Incidents
- Telemetry Policy
- Audit
- Settings

Compliance Lead:
- Compliance
- Registry
- Calendar
- Audit

Reviewer:
- Activity
- Approvals
- Decision Trace

System Owner:
- Registry
- System Detail
- Activity
- Approvals

Auditor:
- Audit
- Decision Trace
- Compliance

Portfolio operator:
- Portfolio Control
- Exit Readiness
- Incidents

## 10. Role notes

- Admin has the broadest access
- Non-admin roles will not see or access some admin-only routes
- Some pages are operationally useful to many roles, but the route guard and UI visibility still control actual access
