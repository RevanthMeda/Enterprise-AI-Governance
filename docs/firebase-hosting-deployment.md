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

## Frontend environment variable

Create a production env file for the frontend build:

`client/.env.production`

```env
VITE_API_BASE_URL=https://YOUR_BACKEND_HOST
```

Example:

```env
VITE_API_BASE_URL=https://enterprise-ai-governance.onrender.com
```

## Required backend configuration

Because Firebase Hosting and your API are on different origins, your backend must explicitly allow the Firebase site.

Set these backend env vars:

```env
PUBLIC_APP_URL=https://aicontrolgrid.com
CORS_ALLOWED_ORIGINS=https://aicontrolgrid.com,https://ai-control-grid.web.app,https://ai-control-grid.firebaseapp.com
PASSWORD_RESET_SECRET=<dedicated-long-random-secret>
CONTROL_TOWER_VAULT_SECRET=<dedicated-long-random-secret>
CSRF_ENFORCED=true
SESSION_COOKIE_SAME_SITE=none
SESSION_COOKIE_SECURE=true
TRUST_PROXY=true
```

If you later add a custom domain, add that origin too.

## Why these backend settings are required

- `CORS_ALLOWED_ORIGINS` allows browser requests with credentials
- `PUBLIC_APP_URL` keeps invite and password-reset links pointing at the hosted frontend
- `PASSWORD_RESET_SECRET` and `CONTROL_TOWER_VAULT_SECRET` are now required in production startup validation
- `CSRF_ENFORCED=true` is the secure production default
- `SESSION_COOKIE_SAME_SITE=none` allows session cookies to be sent cross-site
- `SESSION_COOKIE_SECURE=true` is required when `SameSite=None`
- `TRUST_PROXY=true` helps secure-cookie behavior behind the hosting/proxy chain

Without these, sign-in will fail even if the frontend deploys correctly.

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
4. `/dashboard`
5. `/telemetry-adapter`
6. `/runtime-monitoring`

## Important limitation

This does **not** move your backend into Firebase.

Your backend still needs to stay on:

- Render
- Railway
- Cloud Run
- another Node host

If you want a full Firebase-native backend later, that is a separate migration to:

- Firebase App Hosting
- Cloud Run
- or Functions

## Optional: Firebase Analytics

Only add the Firebase JS SDK snippet if you actually want Firebase Analytics in the frontend.

That is optional and unrelated to Hosting deployment.
