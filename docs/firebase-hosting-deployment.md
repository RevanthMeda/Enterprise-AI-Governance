# Firebase Hosting deployment guide

## What this setup does

This repo is prepared for `Firebase Hosting` as a frontend-only deployment target.

That means:

- the React/Vite app is deployed to Firebase Hosting
- the Express API stays on your existing backend host
- the frontend talks to that backend through `VITE_API_BASE_URL`

## What the Firebase web SDK snippet is for

The snippet from the Firebase console is for client-side Firebase products such as:

- Analytics
- Auth
- Firestore
- Storage

It is **not** required just to deploy this app to Firebase Hosting.

For this repo, Hosting works without adding the Firebase SDK at all.

## Files already added

- [firebase.json](/mnt/d/Personal/Enterprise-AI-Governance/firebase.json)
- [.firebaserc](/mnt/d/Personal/Enterprise-AI-Governance/.firebaserc)

## Frontend environment profile

Firebase uses the checked-in, non-secret `client/.env.firebase` profile:

```env
VITE_API_BASE_URL=https://enterprise-ai-governance.onrender.com
```

`npm run build:firebase` selects this profile explicitly. Normal production builds leave `VITE_API_BASE_URL` empty and use same-origin `/api` requests.

## Required backend configuration

Because Firebase Hosting and your API are on different origins, your backend must explicitly allow the Firebase site.

Set these backend env vars:

```env
PUBLIC_APP_URL=https://aicontrolgrid.com
API_PUBLIC_URL=https://enterprise-ai-governance.onrender.com
CORS_ALLOWED_ORIGINS=https://aicontrolgrid.com,https://ai-control-grid.netlify.app,https://ai-control-tower-d9854.web.app,https://ai-control-tower-d9854.firebaseapp.com
PASSWORD_RESET_SECRET=<dedicated-long-random-secret>
CONTROL_TOWER_VAULT_SECRET=<dedicated-long-random-secret>
CSRF_ENFORCED=true
SESSION_COOKIE_SAME_SITE=none
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_PARTITIONED=true
SESSION_COOKIE_NAME=__Host-aict.sid.v2
TRUST_PROXY=true
AUTO_SEED_ON_STARTUP=false
SEED_TEST_USERS=false
RESET_TEST_USER_PASSWORDS=false
ENABLE_TEST_AUTH_ROUTES=false
EXPOSE_INVITE_TOKENS=false
ALLOW_SELF_SIGNUP=false
```

Production database connections now default to certificate-verified TLS when the database URL does not specify an SSL mode. Set `DB_SSL_MODE=disable` only for a deliberately private, non-TLS database network; public database endpoints must keep verified TLS.

The shared backend has one canonical `PUBLIC_APP_URL`. Keep that exact canonical origin plus every enabled Netlify/Firebase preview origin in `CORS_ALLOWED_ORIGINS`; production validation requires the public origin to be present in that union.

## Why these backend settings are required

- `CORS_ALLOWED_ORIGINS` allows browser requests with credentials
- `PUBLIC_APP_URL` keeps invite and password-reset links pointing at the hosted frontend
- `API_PUBLIC_URL` lets startup validation prove that the Firebase and Render origins require the cross-site cookie profile (Render's automatic `RENDER_EXTERNAL_HOSTNAME` is also recognized)
- `PASSWORD_RESET_SECRET` and `CONTROL_TOWER_VAULT_SECRET` are now required in production startup validation
- `CSRF_ENFORCED=true` is the secure production default
- `SESSION_COOKIE_SAME_SITE=none` allows session cookies to be sent cross-site
- `SESSION_COOKIE_SECURE=true` is required when `SameSite=None`
- `SESSION_COOKIE_PARTITIONED=true` scopes the Render session to the Firebase top-level site so modern browsers can retain it without enabling general third-party tracking
- `SESSION_COOKIE_NAME=__Host-aict.sid.v2` avoids collisions with legacy unpartitioned `connect.sid` cookies during rollout
- `TRUST_PROXY=true` helps secure-cookie behavior behind the hosting/proxy chain

Without these, sign-in will fail even if the frontend deploys correctly.

Apply the schema before deploying this release so the one-time SSO bridge is
available:

```text
PRODUCTION_DB_BACKUP_CONFIRMED=true npm run db:migrate:production
```

Set that process-only confirmation only after verifying a recoverable backup.
In GitHub Actions, the production environment variable must instead equal the
full commit SHA being promoted; the migration checks it again before connecting
to the database.

This creates `sso_login_attempts`, `sso_login_exchanges`, and
`external_auth_identities`. Login attempts and exchange records store only
SHA-256 digests of short-lived browser values; plaintext state and exchange
codes are never written to the database. Provider secrets and the pending OIDC
PKCE verifier/nonce payload are encrypted at rest with
`CONTROL_TOWER_VAULT_SECRET`.

The new cookie name intentionally signs existing preview sessions out once. After the first deployment, close old app tabs and clear site data for the Firebase and Render origins if the browser still presents a legacy session.

## Render release ordering

The repository's production workflow applies the database schema before it triggers the Render deploy hook. To prevent Render's repository integration from racing that workflow, set the service's **Auto-Deploy** setting to **Off** and let the GitHub production workflow own releases. Do not also configure the same migration as an automatic Render pre-deploy command; the workflow serializes production promotions and performs the backup confirmation once.

Keep the start command as `npm run start`. Development-only flags are forced off by the application in production even if a stale provider variable says `true`, but the Render environment should still keep all development-only flags above set to `false` for operational clarity.

If an older Render release stops with `SEED_TEST_USERS must not be enabled in production` or `RESET_TEST_USER_PASSWORDS must not be enabled in production`, open the service's **Environment** settings and delete those variables or set both to `false`, then deploy the current release. The current release also hard-disables them in production so a stale value cannot seed or reset accounts.

## Deploy steps

## 1. Install Firebase CLI

```bash
npm install -g firebase-tools
```

## 2. Log in

```bash
firebase login
```

## 3. Build the frontend

```bash
npm run build:firebase
```

## 4. Deploy Hosting

```bash
firebase deploy --only hosting
```

Or use the combined script:

```bash
npm run deploy:firebase
```

## GitHub Actions deployment

The production workflows build the Firebase-specific frontend, trigger the Render backend, and wait for its readiness response to identify the exact GitHub commit before Firebase Hosting can publish. They then deploy Firebase with a pinned CLI version and run the authenticated cross-site smoke checks.

Configure these production secrets and variables before enabling the workflows:

- `secrets.FIREBASE_SERVICE_ACCOUNT`: a Firebase service-account JSON credential with Hosting deployment access
- `secrets.DATABASE_URL`: the production database used for the pre-deploy schema synchronization
- `secrets.RENDER_DEPLOY_HOOK_URL`
- `secrets.SMOKE_ADMIN_USERNAME`
- `secrets.SMOKE_ADMIN_PASSWORD`
- `vars.PRODUCTION_FRONTEND_URL=https://ai-control-tower-d9854.web.app`
- `vars.PRODUCTION_BACKEND_URL=https://enterprise-ai-governance.onrender.com`
- `vars.PRODUCTION_FRONTEND_TOPOLOGY=cross-site`
- `vars.PRODUCTION_DB_BACKUP_CONFIRMED=<full commit SHA being promoted>`

The backup confirmation is deliberately release-specific; a stale `true` value
or a previous commit SHA is rejected. The workflow fails instead of silently
skipping the primary backend, Firebase, or authenticated smoke stages when
required configuration is missing.

The Render service must remain Git-backed so its automatic `RENDER_GIT_COMMIT` value appears in `/api/ready`. If another backend host is used, inject the deployed Git SHA as `RELEASE_COMMIT_SHA`. Do not remove the exact-release gate: a generic health check can be satisfied by the previous backend while a new deployment is still building or has failed.

Before production evidence uploads, configure durable storage using [Production Evidence Storage](./evidence-storage-production.md).

## 5. Verify

Open the deployed site and test:

1. landing page
2. `/auth/login`
3. successful login
4. refresh the page and confirm the session remains signed in
5. create an AI Registry entry
6. run a Runtime/Telemetry test, then create or update another protected record
7. `/dashboard`
8. `/telemetry-adapter`
9. `/runtime-monitoring`
10. SAML or OIDC sign-in through `/auth/sso/complete`

## Cross-site SSO handoff

This does **not** move your backend into Firebase. Firebase-to-Render remains a cross-site development/preview topology. Partitioned cookies and automatic CSRF recovery make it reliable on modern browsers, but the preferred public-production topology is still one origin.

SAML and OIDC are supported on the split Firebase topology through a one-time
handoff:

1. Render stores the login attempt before leaving for the IdP, so SAML state or
   OIDC state, nonce, and PKCE validation do not depend on a cookie surviving a
   top-level cross-site return. The state is single-use, provider-bound,
   organization-bound, and expires quickly.
2. Render validates the IdP callback and completes organization policy checks.
   JIT provisioning accepts only organization domains that have completed
   domain verification; identities are scoped by organization, provider,
   issuer, and subject.
3. Render stores a two-minute, single-use exchange record containing only a
   digest of a cryptographically random code.
4. The browser is redirected to the public frontend at
   `/auth/sso/complete#sso_exchange=...`. The fragment is not sent in the
   Firebase HTTP request and is removed from browser history before exchange.
5. The frontend posts the code to Render from the Firebase top-level context.
   Render atomically consumes it, regenerates the authenticated session, and
   sets the partitioned cookie in the correct browser partition.
6. The frontend redirects only to the normalized internal path stored with the
   exchange.

The exchange endpoint rejects unknown browser origins, is CSRF-exempt only for
this one bootstrap operation, and is protected by shared global, address, and
code rate limits. Expired or replayed codes fail closed. Keep the IdP callback
URLs pointed at the Render API (`/api/auth/sso/callback` for SAML and
`/api/auth/oidc/callback` for OIDC); the API handles the return to Firebase.

OIDC issuer, authorization, token, and JWKS URLs must use HTTPS. Token and JWKS
requests are DNS-pinned, do not follow redirects, reject private/local network
addresses, and enforce response-size/time limits. Endpoints must share the
issuer origin unless their exact HTTPS origin appears in
`OIDC_TRUSTED_ENDPOINT_ORIGINS`. If the issuer, token URL, or client ID changes,
re-enter (or explicitly clear) the client secret so an encrypted credential
cannot silently move to a different provider destination. The insecure local
provider switch is test-only and must remain disabled in production.

Evidence downloads stay in-page and use the credentialed API client.

Your backend still needs to stay on:

- Render
- Railway
- Cloud Run
- another Node host

If you want a full Firebase-native backend later, that is a separate migration to:

- Firebase App Hosting
- Cloud Run
- or Functions

For production, choose one of these same-origin patterns:

- serve the built client and Express API together on Render or another Node host
- route Firebase `/api/**` to the Express service through Cloud Run or Cloud Functions
- deploy the existing Vercel frontend and serverless API together

Do not disable CSRF enforcement to work around a hosting mismatch.

## Optional: Firebase Analytics

Only add the Firebase JS SDK snippet if you actually want Firebase Analytics in the frontend.

That is optional and unrelated to Hosting deployment.
