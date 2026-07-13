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
- backend `/api/ready`, including the exact Git revision when `SMOKE_EXPECTED_RELEASE_COMMIT` is set
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
- frontend `/auth/sso/complete` (the page must load without a code and fail closed)
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
- `secrets.FIREBASE_SERVICE_ACCOUNT`
- `secrets.RENDER_DEPLOY_HOOK_URL`
- `secrets.SMOKE_ADMIN_USERNAME`
- `secrets.SMOKE_ADMIN_PASSWORD`

The workflow triggers Render and waits until `/api/ready` reports `release.commit` equal to `${{ github.sha }}` before Firebase or Netlify can publish. A healthy older backend therefore cannot accidentally satisfy the release gate. Render supplies `RENDER_GIT_COMMIT` automatically for a Git-backed service; another host must set `RELEASE_COMMIT_SHA` to its deployed Git revision.

Production jobs in both workflows share the `production-deploy` concurrency
group, so an automatic push deployment and a manual promotion cannot interleave.
Before either job can modify the database, the production environment variable
`PRODUCTION_DB_BACKUP_CONFIRMED` must equal the full `${{ github.sha }}` being
promoted. This makes backup acknowledgement release-specific instead of a
permanent boolean bypass.

After the new backend is ready, the workflow runs `npm run db:migrate:invite-token-digests` before publishing the frontend. This idempotent data migration removes legacy plaintext organization-invite tokens; the application remains compatible with a legacy row if an interrupted deployment must be retried.

The workflow runs the full smoke script again after deploying Firebase Hosting. The optional Netlify hook remains available for the proxied secondary frontend.

Evidence-storage readiness is also returned by `/api/ready`. Follow [Production Evidence Storage](./evidence-storage-production.md) before enabling `REQUIRE_DURABLE_EVIDENCE_STORAGE=true`.

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
11. On Firebase, complete one configured SAML or OIDC login, confirm the browser passes through `/auth/sso/complete`, refresh, and confirm the session remains signed in

Federated login requires `sso_login_attempts`, `sso_login_exchanges`, and
`external_auth_identities`. Run the production schema step before the backend
release; an old schema must block promotion rather than publishing a frontend
whose federated login cannot complete or whose identity scope is ambiguous.
