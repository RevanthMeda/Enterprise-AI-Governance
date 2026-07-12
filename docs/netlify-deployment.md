# Netlify Deployment (Frontend) + Node Deployment (Backend)

This project is not a static-only app. It has:
- React SPA frontend
- Express API backend
- Session-based auth and cookies

Use two deployments:
- Netlify for frontend
- Render/Railway/Fly (or similar) for backend

Release operations:

- automated validation/build: [deploy.yml](/mnt/d/Personal/Enterprise-AI-Governance/.github/workflows/deploy.yml)
- manual promotion: [promote-production.yml](/mnt/d/Personal/Enterprise-AI-Governance/.github/workflows/promote-production.yml)
- rollback guidance: [deployment-rollback-runbook.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/deployment-rollback-runbook.md)

## 1) Deploy backend first

Deploy the same repo as a Node web service with:
- Build command: `npm ci && npm run build`
- Start command: `npm run start`

Required backend environment variables:
- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL=<postgres-connection-string>`
- `SESSION_SECRET=<long-random-secret>`
- `PASSWORD_RESET_SECRET=<dedicated-long-random-secret>`
- `CONTROL_TOWER_VAULT_SECRET=<dedicated-long-random-secret>`
- `TRUST_PROXY=true`
- `PUBLIC_APP_URL=https://aicontrolgrid.com`
- `CORS_ALLOWED_ORIGINS=https://aicontrolgrid.com,https://ai-control-grid.netlify.app,https://ai-control-tower-d9854.web.app,https://ai-control-tower-d9854.firebaseapp.com`
- `SESSION_COOKIE_SAME_SITE=none`
- `SESSION_COOKIE_SECURE=true`
- `SESSION_COOKIE_PARTITIONED=true`
- `SESSION_COOKIE_NAME=__Host-aict.sid.v2`
- `CSRF_ENFORCED=true`

Those cookie values assume this deployment shares the Render backend with the Firebase preview. One backend must use one cookie policy; the partitioned cross-site policy also works when Netlify relays `/api` on the frontend origin. If you provision a dedicated Netlify-only backend, `SameSite=lax`, `Partitioned=false`, and the default cookie name are acceptable instead.

Optional (if used in your flows):
- `LEAD_WEBHOOK_URL=<webhook-url>`
- `SMTP_HOST=<smtp-host>`
- `SMTP_PORT=<smtp-port>`
- `SMTP_SECURE=<true|false>`
- `SMTP_USER=<smtp-username>`
- `SMTP_PASSWORD=<smtp-password>`
- `SMTP_FROM=<from-address>`
- `INVITE_WEBHOOK_URL=<delivery-webhook-url>`
- `EXPOSE_INVITE_TOKENS=false`
- `ALLOW_SELF_SIGNUP=false`
- `SEED_TEST_USERS=true`
- `TEST_USER_PASSWORD=<strong-temp-password>`

Run database schema sync once backend env is ready:
- `npm run db:push -- --force`

## 2) Deploy frontend on Netlify

The repo now includes:
- `netlify.toml`
- `client/public/_redirects`

These ensure SPA routing works (no Netlify 404 on app routes).

Leave `VITE_API_BASE_URL` unset (or empty). The checked-in Netlify proxy forwards same-origin `/api/*` requests to the backend. This keeps the browser session first-party even though the server runs separately.

Then deploy.

## 3) Post-deploy checks

After deploy, verify:
1. `https://<netlify-domain>/` loads (no Netlify 404 page).
2. Login works from Netlify frontend.
3. Browser API requests stay on the Netlify domain under `/api/*`.
4. Session cookie is set through the Netlify origin with `Secure`, `SameSite=None`, `Partitioned`, and the versioned `__Host-aict.sid.v2` name.
5. Organization invites generate frontend `/invite/accept` links and are delivered through SMTP or webhook if configured.

## 4) Common failure modes

- Netlify root shows "Page not found":
  - Missing SPA redirect config. This is fixed by `netlify.toml` and `_redirects`.
- Frontend loads but login/API fail:
  - `VITE_API_BASE_URL` was set and bypassed the same-origin Netlify proxy. Remove it and rebuild.
- Login request succeeds but user is immediately unauthenticated:
  - Cookie policy/CORS mismatch. Recheck:
    - `CORS_ALLOWED_ORIGINS`
    - `SESSION_COOKIE_SAME_SITE=none`
    - `SESSION_COOKIE_SECURE=true`
    - `SESSION_COOKIE_PARTITIONED=true`
    - `SESSION_COOKIE_NAME=__Host-aict.sid.v2`
    - `TRUST_PROXY=true`
- Backend fails immediately on boot:
  - Runtime validation rejected missing or placeholder production settings. Recheck:
    - `PUBLIC_APP_URL`
    - `PASSWORD_RESET_SECRET`
    - `CONTROL_TOWER_VAULT_SECRET`
    - `CSRF_ENFORCED=true`
