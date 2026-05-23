# Deploy Smoke Checklist

Run the automated smoke script after each deploy:

```bash
npm run smoke:deploy -- https://ai-control-grid.netlify.app https://enterprise-ai-governance.onrender.com
```

Environment variable form:

```bash
SMOKE_FRONTEND_URL=https://ai-control-grid.netlify.app \
SMOKE_BACKEND_URL=https://enterprise-ai-governance.onrender.com \
npm run smoke:deploy
```

Authenticated admin coverage:

```bash
SMOKE_FRONTEND_URL=https://ai-control-grid.netlify.app \
SMOKE_BACKEND_URL=https://enterprise-ai-governance.onrender.com \
SMOKE_ADMIN_USERNAME=admin_test \
SMOKE_ADMIN_PASSWORD=TestUser123! \
npm run smoke:deploy
```

The script checks:

- backend `/api/health`
- backend `/api/ready`
- backend authenticated admin APIs, when admin credentials are provided:
  - `/api/auth/user`
  - `/api/organization/subscription`
  - `/api/organization/jira-integration`
  - `/api/decision-audits/summary`
  - `/api/incidents/summary`
  - `/api/telemetry/summary`
  - `/api/audit-logs/verify-chain`
- frontend `/`
- frontend `/auth/login`
- frontend `/auth/reset-password`
- frontend `/api-docs`
- frontend `/trust-center`
- frontend `/api-docs/identity.html`
- frontend `/api-docs/platform.html`
- frontend `/book-demo/thank-you`
- frontend `/start-pilot/thank-you`

The script retries automatically to absorb deploy propagation and cold starts.

GitHub Actions production promotion uses:

- `vars.PRODUCTION_FRONTEND_URL`
- `vars.PRODUCTION_BACKEND_URL`
- `secrets.SMOKE_ADMIN_USERNAME`
- `secrets.SMOKE_ADMIN_PASSWORD`

and runs the same smoke script after triggering the Render and Netlify deploy hooks.

Manual spot checks after the script passes:

1. Sign in with `admin_test`
2. Open `/account-security`, `/settings`, `/integrations`, and `/billing`
3. Open `/decision-trace` and record a trace
4. Open `/incidents` and confirm a playbook can be opened
5. Open `/trust-center`
6. Open `/api-docs/identity.html`
7. Submit `/book-demo`
8. Open one registry card and confirm detail navigation
