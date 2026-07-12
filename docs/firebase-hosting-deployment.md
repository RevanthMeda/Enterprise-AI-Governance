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
CORS_ALLOWED_ORIGINS=https://aicontrolgrid.com,https://ai-control-grid.netlify.app,https://ai-control-tower-d9854.web.app,https://ai-control-tower-d9854.firebaseapp.com
PASSWORD_RESET_SECRET=<dedicated-long-random-secret>
CONTROL_TOWER_VAULT_SECRET=<dedicated-long-random-secret>
CSRF_ENFORCED=true
SESSION_COOKIE_SAME_SITE=none
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_PARTITIONED=true
SESSION_COOKIE_NAME=__Host-aict.sid.v2
TRUST_PROXY=true
```

The shared backend has one canonical `PUBLIC_APP_URL`. Keep that exact canonical origin plus every enabled Netlify/Firebase preview origin in `CORS_ALLOWED_ORIGINS`; production validation requires the public origin to be present in that union.

## Why these backend settings are required

- `CORS_ALLOWED_ORIGINS` allows browser requests with credentials
- `PUBLIC_APP_URL` keeps invite and password-reset links pointing at the hosted frontend
- `PASSWORD_RESET_SECRET` and `CONTROL_TOWER_VAULT_SECRET` are now required in production startup validation
- `CSRF_ENFORCED=true` is the secure production default
- `SESSION_COOKIE_SAME_SITE=none` allows session cookies to be sent cross-site
- `SESSION_COOKIE_SECURE=true` is required when `SameSite=None`
- `SESSION_COOKIE_PARTITIONED=true` scopes the Render session to the Firebase top-level site so modern browsers can retain it without enabling general third-party tracking
- `SESSION_COOKIE_NAME=__Host-aict.sid.v2` avoids collisions with legacy unpartitioned `connect.sid` cookies during rollout
- `TRUST_PROXY=true` helps secure-cookie behavior behind the hosting/proxy chain

Without these, sign-in will fail even if the frontend deploys correctly.

The new cookie name intentionally signs existing preview sessions out once. After the first deployment, close old app tabs and clear site data for the Firebase and Render origins if the browser still presents a legacy session.

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

## Important limitation

This does **not** move your backend into Firebase. Firebase-to-Render remains a cross-site development/preview topology. Partitioned cookies and automatic CSRF recovery make it reliable on modern browsers, but the preferred public-production topology is still one origin.

Use local username/password authentication for the split Firebase preview. Enterprise SSO callbacks and any future direct backend navigations should be tested on a same-origin deployment because a cookie partitioned under Firebase is not available after a top-level navigation to Render. Evidence downloads stay in-page and use the credentialed API client.

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
