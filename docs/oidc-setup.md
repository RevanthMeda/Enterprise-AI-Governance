# OIDC Setup Guide

This guide configures AI Control Tower for OpenID Connect using the current explicit-endpoint model.

## Before you start

You need:

- organization admin access
- a verified organization domain
- your production backend URL
- your organization slug
- OIDC provider admin access

## Required OIDC values

AI Control Tower currently expects explicit provider endpoints:

- issuer
- authorization URL
- token URL
- JWKS URL
- client ID
- optional client secret
- callback URL
- scopes

Recommended scopes:

- `openid profile email`

Recommended callback URL:

- `https://<backend-domain>/api/auth/oidc/callback`

Recommended start URL:

- `https://<backend-domain>/api/auth/oidc/start?org=<org-slug>&next=/`

## AI Control Tower configuration

In the `Identity` tab:

1. set auth mode to `OIDC / OpenID Connect`
2. enter the issuer URL
3. enter the authorization URL
4. enter the token URL
5. enter the JWKS URL
6. enter the client ID
7. enter the client secret if your provider requires it
8. enter the callback URL
9. keep scopes at `openid profile email` unless your provider requires more
10. add and verify the organization domain
11. enable JIT only if you want internal users onboarded automatically

## Security model

The current OIDC implementation uses:

- authorization code flow
- PKCE
- ID token signature verification through the configured JWKS URL
- issuer validation
- audience validation against the configured client ID
- nonce validation

This keeps the OIDC flow aligned with the tenant and JIT controls already used by SAML.

## Expected identity claims

Preferred claims:

- `sub`
- `email`
- `name`

Fallback email claims:

- `preferred_username`
- `upn`

If the provider does not include a usable email claim, login is rejected.

## Onboarding model

- verified internal domain + JIT enabled -> automatic onboarding with the default role
- verified internal domain + JIT disabled -> only existing members can sign in
- external users -> invite-only

## Validation checklist

1. open the copied OIDC start URL in a private browser
2. complete the provider login
3. confirm the callback succeeds
4. confirm `/api/auth/user` returns the correct `currentOrganizationId`
5. confirm the user has the expected org membership

## Common failure cases

OIDC start redirects back to the login page:

- verify the org auth mode is `oidc`
- verify all required endpoints are configured

Token exchange fails:

- verify the token URL
- verify the client ID and client secret
- verify the callback URL registered with the provider

JWT validation fails:

- verify issuer matches the configured issuer
- verify JWKS URL is correct
- verify the client ID matches the OIDC audience

Email domain is rejected:

- verify the org domain is allowlisted and verified

## Recommended operating model

- OIDC for internal workforce sign-in
- JIT only for low-privilege default roles
- manual role elevation after onboarding
- invites for external third parties
