# Okta OIDC Setup Guide

This guide configures AI Control Tower with Okta using OpenID Connect.

## Before you start

You need:

- organization admin access in AI Control Tower
- access to the Okta admin console
- a verified organization domain
- your production backend URL
- your organization slug

Use the backend domain for OIDC callback and start URLs.

## Okta application

In Okta:

1. go to `Applications`
2. create a new app integration
3. choose `OIDC - OpenID Connect`
4. choose `Web Application`

## Okta values

Recommended redirect URI:

- `https://<backend-domain>/api/auth/oidc/callback`

Recommended sign-in initiation URL:

- `https://<backend-domain>/api/auth/oidc/start?org=<org-slug>&next=/`

Scopes:

- `openid`
- `profile`
- `email`

## AI Control Tower OIDC settings

Use these values in the `Identity` tab:

- OIDC issuer:
  - your Okta issuer URL
- OIDC authorization URL:
  - `https://<okta-domain>/oauth2/v1/authorize`
- OIDC token URL:
  - `https://<okta-domain>/oauth2/v1/token`
- OIDC JWKS URL:
  - `https://<okta-domain>/oauth2/v1/keys`
- OIDC client ID:
  - Okta client ID
- OIDC client secret:
  - Okta client secret
- OIDC callback URL:
  - `https://<backend-domain>/api/auth/oidc/callback`
- OIDC scopes:
  - `openid profile email`

## JIT and domain policy

Recommended policy:

- verify the internal company domain first
- enable JIT only for standard internal users
- keep the default JIT role at `reviewer`
- assign elevated roles manually after first login

## Validation sequence

1. copy the OIDC start URL from Settings
2. open it in a private browser
3. authenticate with an Okta user on the verified domain
4. confirm `/api/auth/user` resolves with the correct `currentOrganizationId`
5. confirm the user lands in the correct org

## Common Okta OIDC issues

Callback mismatch:

- verify the Okta redirect URI exactly matches `/api/auth/oidc/callback`

Audience mismatch:

- verify the configured client ID matches the issued ID token audience

Domain denied:

- verify the user email domain is allowlisted and verified in AI Control Tower
