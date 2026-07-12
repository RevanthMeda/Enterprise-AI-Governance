# Deploy Smoke Checklist

Run the automated smoke script after each deploy:

```bash
npm run smoke:deploy -- https://ai-control-grid.netlify.app https://enterprise-ai-governance.onrender.com
```

Environment variable form:

```bash
SMOKE_FRONTEND_URL=https://ai-control-grid.netlify.app \
SMOKE_BACKEND_URL=https://enterprise-ai-governance.onrender.com \
SMOKE_FRONTEND_TOPOLOGY=same-origin \
npm run smoke:deploy
```

Authenticated admin coverage:

```bash
SMOKE_FRONTEND_URL=https://ai-control-grid.netlify.app \
SMOKE_BACKEND_URL=https://enterprise-ai-governance.onrender.com \
SMOKE_ADMIN_USERNAME=admin_test \
SMOKE_ADMIN_PASSWORD=TestUser123! \
SMOKE_FRONTEND_TOPOLOGY=same-origin \
npm run smoke:deploy
```

Use `SMOKE_FRONTEND_TOPOLOGY=same-origin` for Render, Netlify proxy, and Vercel deployments. Use `cross-site` only for the split Firebase frontend plus Render backend. Same-origin is the safe default; a broken proxy/function must fail rather than silently falling back to the backend URL.

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
- cookie-backed `/api/auth/user` session verification
- an unauthenticated Telemetry Adapter probe that requires a non-cacheable `401` with `X-Error-Code: AUTHENTICATION_REQUIRED`
- a no-data authenticated Registry mutation probe that must pass CSRF and stop at schema validation
- frontend session topology:
  - same-origin/proxied frontends authenticate and pass the mutation probe through their own `/api`
  - split Firebase hosting verifies CORS, exposed recovery headers, the versioned partitioned cookie, and the protected mutation path against the configured backend
- frontend `/`
- frontend `/auth/login`
- frontend `/auth/reset-password`
- frontend `/api-docs`
- frontend `/trust-center`
- frontend `/api-docs/identity.html`
- frontend `/api-docs/platform.html`
- frontend `/book-demo/thank-you`
- frontend `/start-pilot/thank-you`

The script retries automatically to absorb deploy propagation and cold starts. The mutation probe submits an empty object and expects schema validation to reject it, so it does not create a Registry record.

Node-based smoke checks validate the cross-site HTTP contract but cannot emulate browser cookie-partition policy. For Firebase releases, also complete the manual browser sequence below in Edge or Chrome.

GitHub Actions production promotion uses:

- `vars.PRODUCTION_FRONTEND_URL`
- `vars.PRODUCTION_BACKEND_URL`
- `vars.PRODUCTION_FRONTEND_TOPOLOGY`
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
9. On Firebase, refresh after login, run one Runtime/Telemetry evaluation, then create or update a Registry item
10. On Firebase, download an evidence file and confirm the browser stays signed in
