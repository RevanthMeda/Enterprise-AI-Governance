# Post-Deploy Commercial Verification

Use this after Netlify and Render are updated with the latest build.

## Automated gate

Run:

```bash
SMOKE_FRONTEND_URL=https://ai-control-tower.netlify.app \
SMOKE_BACKEND_URL=https://enterprise-ai-governance.onrender.com \
SMOKE_ADMIN_USERNAME=admin_test \
SMOKE_ADMIN_PASSWORD=TestUser123! \
npm run smoke:deploy
```

Expected result:
- all checks print `PASS`
- no 5xx on `/api/ready`
- admin-only commercialization endpoints return `200`

## Manual verification

### 1. Public trust and buyer-facing pages

Check:
- `/`
- `/trust-center`
- `/api-docs`
- `/api-docs/identity.html`
- `/api-docs/platform.html`
- `/auth/reset-password`
- `/book-demo/thank-you`
- `/start-pilot/thank-you`

Expected:
- trust-center page loads and shows buyer diligence posture
- Redoc pages render instead of a blank screen
- reset-password page renders without a client crash
- thank-you aliases render without auth redirect

### 2. Admin commercialization surfaces

Sign in as `admin_test`.

Check:
- `/account-security`
- `/settings`
- `/integrations`
- `/billing`
- `/decision-trace`
- `/incidents`

Expected:
- routes load without router errors
- account security loads and MFA/password actions render
- sidebar links exist for Decision Trace, Incidents, Integrations, Billing

### 3. Jira connector

In `/integrations`:
- save Jira configuration
- run `Test connection`

Expected:
- success response if credentials are valid
- `last tested` timestamp updates

Then create or update a high-priority approval workflow tied to a high-risk system.

Expected:
- workflow gets `jiraIssueKey` / `jiraIssueUrl`
- Jira sync state becomes `linked`
- admin audit / workflow audit reflects the link event

### 4. Decision traceability

In `/decision-trace`:
- create one new decision trace with:
  - context
  - AI output
  - human-reviewed output
  - override rationale
  - outcome summary

Expected:
- new record appears in Recent decision traces
- human override badge appears when human output differs
- audit chain card remains `Verified`
- summary cards update

### 5. Incidents and playbooks

In `/incidents`:
- create one `bias` incident with `high` severity
- confirm playbook steps auto-populate
- move it to `contained`
- move it to `resolved`

Expected:
- summary cards update
- high-severity incident creates admin-visible alerting behavior
- status transitions persist after refresh

### 6. Billing and usage

In `/billing`:
- switch tier between `pilot`, `growth`, `enterprise`
- adjust seat limit
- set billing email

Expected:
- form saves successfully
- usage summary reflects current tenant counts
- page reload preserves the saved values

### 7. API readiness and queue health

Check:
- `/api/health`
- `/api/ready`

Expected:
- `ok: true`
- `ready: true`
- queue block present and sane

## Required environment/config for production verification

### Render
- `DATABASE_URL`
- `SESSION_SECRET`
- `PASSWORD_RESET_SECRET`
- `CONTROL_TOWER_VAULT_SECRET`
- `CORS_ALLOWED_ORIGINS`
- `PUBLIC_APP_URL`
- `CSRF_ENFORCED=true`
- Jira, if testing integration live:
  - org-specific values entered in app UI

### GitHub Actions
- `RENDER_DEPLOY_HOOK_URL`
- `NETLIFY_BUILD_HOOK_URL`
- `PRODUCTION_FRONTEND_URL`
- `PRODUCTION_BACKEND_URL`
- optional admin smoke credentials:
  - `SMOKE_ADMIN_USERNAME`
  - `SMOKE_ADMIN_PASSWORD`

## Release sign-off

Only sign off when all of these are true:
- smoke script passes
- Jira test succeeds or is intentionally marked not configured
- decision trace create path works
- incident create/contain/resolve path works
- billing save path works
- reset-password page loads publicly
- account-security page loads after login
- trust center and API docs load publicly
