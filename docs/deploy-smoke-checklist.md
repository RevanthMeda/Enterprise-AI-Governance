# Deploy Smoke Checklist

Run the automated smoke script after each deploy:

```bash
npm run smoke:deploy -- https://ai-control-tower.netlify.app https://enterprise-ai-governance.onrender.com
```

Environment variable form:

```bash
SMOKE_FRONTEND_URL=https://ai-control-tower.netlify.app \
SMOKE_BACKEND_URL=https://enterprise-ai-governance.onrender.com \
npm run smoke:deploy
```

The script checks:

- backend `/api/health`
- backend `/api/ready`
- frontend `/`
- frontend `/auth/login`
- frontend `/api-docs`
- frontend `/book-demo/thank-you`

The script retries automatically to absorb deploy propagation and cold starts.

GitHub Actions production promotion uses:

- `vars.PRODUCTION_FRONTEND_URL`
- `vars.PRODUCTION_BACKEND_URL`

and runs the same smoke script after triggering the Render and Netlify deploy hooks.

Manual spot checks after the script passes:

1. Sign in with `admin_test`
2. Open `/settings`
3. Open `/api-docs/identity.html`
4. Submit `/book-demo`
5. Open one registry card and confirm detail navigation
