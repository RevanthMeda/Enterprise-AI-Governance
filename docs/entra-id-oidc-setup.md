# Entra ID OIDC Setup Guide

This guide configures AI Control Tower with Microsoft Entra ID using OpenID Connect.

## Before you start

You need:

- organization admin access in AI Control Tower
- Microsoft Entra admin access
- a verified organization domain
- your production backend URL
- your organization slug

## Entra application registration

In Microsoft Entra:

1. go to `App registrations`
2. create a new registration
3. set the redirect URI to:
   - `https://<backend-domain>/api/auth/oidc/callback`
4. create a client secret if your tenant policy requires it

## AI Control Tower OIDC settings

Use these values:

- OIDC issuer:
  - your Entra issuer URL for the tenant
- OIDC authorization URL:
  - Microsoft authorization endpoint
- OIDC token URL:
  - Microsoft token endpoint
- OIDC JWKS URL:
  - Microsoft keys endpoint
- OIDC client ID:
  - application client ID
- OIDC client secret:
  - client secret if required
- OIDC callback URL:
  - `https://<backend-domain>/api/auth/oidc/callback`
- OIDC scopes:
  - `openid profile email`

## Operational policy

Recommended model:

- internal Entra users: allowlisted verified domain + optional JIT
- external collaborators: invite-only
- privileged roles: assign manually after onboarding

## Validation sequence

1. copy the OIDC start URL from Settings
2. open it in a private browser
3. authenticate through Entra ID
4. confirm `/api/auth/user` shows the correct org context
5. confirm onboarding behaves according to JIT policy

## Common Entra OIDC issues

Email claim missing:

- ensure the token includes a usable email or UPN claim

Issuer mismatch:

- verify the configured issuer matches the token issuer exactly

Domain denied:

- verify the incoming user domain matches the verified org domain
