# Real-world demo showcase guide

This guide is for local demos after running:

```bash
npm run seed:real-world-demo
```

The dataset is public-source-derived demo data. It is realistic enough for product walkthroughs, but it is not customer production data.

## What is now seeded

- 6 operating companies in the demo portfolio:
  - Northstar Consumer Bank Demo
  - HarborView Diagnostics Demo
  - Meridian Talent Systems Demo
  - Silverline Insurance Operations Demo
  - GridReliant Utilities Demo
  - Summit Education Services Demo
- 15 AI systems
- 15 approval workflows across Tier 1, Tier 2, and Tier 3
- 7 decision traces
- 5 manually seeded incidents plus telemetry-triggered escalations
- 9 telemetry events spanning drift, bias, error-rate, and override spikes
- evidence files, invites, domains, billing, notifications, background jobs, telemetry policy overrides, and portfolio defaults

## Best demo login

Use:

- username: `admin_test`
- password: `TestUser123!`

## Demo path for a client

### 1. Start on portfolio oversight

Open:

- `/portfolio-control`

What to show:

- one PE-style portfolio with six operating companies
- average documentation rate
- open incidents
- telemetry alerts
- Tier 3 exposure
- portfolio telemetry defaults

Narrative:
- "This is the parent operating view across regulated businesses. Each company remains isolated, but the sponsor can see governance posture at the roll-up level."

### 2. Show the operating companies in the registry

Open:

- `/registry`

What to show:

- systems across finance, healthcare, hiring, insurance, utilities, and education
- risk diversity:
  - `high`
  - `limited`
  - `minimal`
- different vendors and deployment contexts

Recommended examples:

- `Credit Eligibility Decision Engine`
- `Mammography Triage Model`
- `Candidate Screening Ranker`
- `Catastrophe Claims Severity Triage`
- `Vegetation Outage Risk Forecaster`
- `Scholarship Eligibility Support Model`

### 3. Show risk and approval routing

Open:

- `/approvals`
- `/risk`

What to show:

- Tier 1 routine internal automation
- Tier 2 operations-committee routing
- Tier 3 governance escalation and blocking

Best workflows to demo:

- `Expand credit eligibility model to new adverse-action policy set`
- `Clinical pilot approval for mammography triage model`
- `Approve recruiter pilot for candidate screening ranker`
- `Approve catastrophe claims triage rollout for storm season`
- `Approve grid-operations model for wildfire season dispatch planning`
- `Approve scholarship support model for counselor pilot`

Narrative:
- "The platform does not just log AI use. It routes consequential changes into the right governance path."

### 4. Show decision traceability

Open:

- `/decision-trace`

Best records to open:

- `Credit eligibility recommendation with adverse-action review`
- `Clinical triage recommendation with radiologist override`
- `Candidate shortlist recommendation with recruiter override`
- `Catastrophe claim severity recommendation with adjuster override`
- `Wildfire-season dispatch recommendation with field-ops override`
- `Scholarship priority recommendation with counselor override`

What to show:

- model and version
- prompt text
- input sources
- input snapshot
- constraints
- AI output vs human output
- override rationale
- explainability factors
- 30/60/90-day outcomes
- sealed record / version history

Narrative:
- "This is the due-diligence layer. We can prove what the model suggested, what the human changed, and what happened later."

### 5. Show incidents and telemetry together

Open:

- `/incidents`
- `/telemetry-policy`
- `/telemetry-adapter`

Best incident examples:

- `Bias review triggered for candidate screening ranker`
- `Field dispatch review triggered for outage-risk forecaster`
- `Bias review initiated for scholarship support pilot`
- `Unsupported exclusion language drafted in policy servicing assistant`

What to show:

- bias, reliability, and safety categories
- postmortem content
- regulatory notification tracking
- telemetry thresholds by organization
- SDK/gateway ingest setup

Narrative:
- "Threshold breaches can create operational alerts and incidents automatically. Admins can tune thresholds per company or inherit them from the portfolio."

### 6. Show evidence, controls, and auditability

Open:

- a system detail page under `/systems/:id`
- `/compliance`
- `/audit`
- `/retention-control`

What to show:

- evidence attachments
- framework coverage
- audit records
- retention and legal-hold controls

Best systems:

- `Credit Eligibility Decision Engine`
- `Mammography Triage Model`
- `Vegetation Outage Risk Forecaster`
- `Scholarship Eligibility Support Model`

### 7. Show enterprise admin surfaces

Open:

- `/settings`
- `/billing`
- `/integrations`

What to show:

- managed domains
- invites
- SAML / OIDC settings
- telemetry policy
- billing and seat limits
- Jira connector form

Narrative:
- "This is not just an analyst console. It includes identity, tenant admin, billing, and integrations."

## Quick verification checklist

After seeding, verify these routes:

- `/dashboard`
- `/portfolio-control`
- `/registry`
- `/approvals`
- `/decision-trace`
- `/exit-readiness`
- `/incidents`
- `/settings`
- `/telemetry-policy`
- `/telemetry-adapter`
- `/billing`
- `/retention-control`

## Sector-to-feature mapping

### Finance

- credit eligibility
- hardship support
- adverse-action traceability
- high-risk approvals

### Healthcare

- clinical triage
- safety incidents
- drift monitoring
- clinician override evidence

### Employment

- screening bias
- override rationale
- cohort-gap review

### Insurance

- catastrophe claims prioritization
- customer-support drafting
- stale policy retrieval incident

### Utilities

- critical infrastructure dispatch planning
- safety escalation
- environmental constraint overrides

### Education

- scholarship prioritization
- fairness reviews
- student-data-sensitive workflows

## How to explain the dataset honestly

Use this wording:

- "The scenarios are based on public governance frameworks and public incident-monitoring references."
- "The organizations are demo companies, not customers."
- "The purpose of the dataset is to exercise the full governance surface with realistic sector-specific workflows."
