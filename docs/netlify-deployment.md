# Netlify Deployment (Frontend) + Node Deployment (Backend)

This project is not a static-only app. It has:
- React SPA frontend
- Express API backend
- Session-based auth and cookies

Use two deployments:
- Netlify for frontend
- Render/Railway/Fly (or similar) for backend

## 1) Deploy backend first

Deploy the same repo as a Node web service with:
- Build command: `npm ci && npm run build`
- Start command: `npm run start`

Required backend environment variables:
- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL=<postgres-connection-string>`
- `SESSION_SECRET=<long-random-secret>`
- `TRUST_PROXY=true`
- `CORS_ALLOWED_ORIGINS=https://<your-netlify-site>.netlify.app`
- `SESSION_COOKIE_SAME_SITE=none`
- `SESSION_COOKIE_SECURE=true`

Optional (if used in your flows):
- `LEAD_WEBHOOK_URL=<webhook-url>`
- `ALLOW_SELF_SIGNUP=false`
- `CSRF_ENFORCED=true`

Run database schema sync once backend env is ready:
- `npm run db:push -- --force`

## 2) Deploy frontend on Netlify

The repo now includes:
- `netlify.toml`
- `client/public/_redirects`

These ensure SPA routing works (no Netlify 404 on app routes).

Set this Netlify environment variable:
- `VITE_API_BASE_URL=https://<your-backend-domain>`

Then deploy.

## 3) Post-deploy checks

After deploy, verify:
1. `https://<netlify-domain>/` loads (no Netlify 404 page).
2. Login works from Netlify frontend.
3. API requests go to backend domain (browser network tab).
4. Session cookie is set on backend domain with `Secure` and `SameSite=None`.

## 4) Common failure modes

- Netlify root shows "Page not found":
  - Missing SPA redirect config. This is fixed by `netlify.toml` and `_redirects`.
- Frontend loads but login/API fail:
  - `VITE_API_BASE_URL` missing or wrong.
- Login request succeeds but user is immediately unauthenticated:
  - Cookie policy/CORS mismatch. Recheck:
    - `CORS_ALLOWED_ORIGINS`
    - `SESSION_COOKIE_SAME_SITE=none`
    - `SESSION_COOKIE_SECURE=true`
    - `TRUST_PROXY=true`

