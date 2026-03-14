# Okta SAML Setup Guide

This guide configures AI Control Tower as a SAML service provider for Okta-backed organizations.

## Before you start

You need:

- an AI Control Tower organization with admin access
- a verified organization domain in Settings
- your production backend URL
- your organization slug
- access to the Okta admin console

Use your production backend for SSO endpoints, not the Netlify frontend domain.

## Values you need from AI Control Tower

Backend routes:

- metadata URL: `https://<backend-domain>/api/auth/sso/metadata?org=<org-slug>`
- start URL: `https://<backend-domain>/api/auth/sso/start?org=<org-slug>&next=/`
- callback URL: `https://<backend-domain>/api/auth/sso/callback`

Org configuration in Settings:

- auth mode: `saml`
- JIT provisioning: optional, recommended only after domain verification
- default JIT role: `reviewer`

## Create the Okta application

In Okta:

1. Go to `Applications`
2. Create a new app integration
3. Choose `SAML 2.0`
4. Set an app name such as `AI Control Tower`

## Okta SAML settings

Use these values:

- Single sign-on URL:
  - `https://<backend-domain>/api/auth/sso/callback`
- Audience URI (SP Entity ID):
  - use the value shown in AI Control Tower Settings
  - if you manage it manually, keep it stable and org-aware
- Name ID format:
  - `EmailAddress`
- Application username:
  - `Email`

Recommended attribute statements:

- `email` -> `user.email`
- `fullName` -> `user.firstName + " " + user.lastName`

If your Okta tenant requires first/last name separately, keep `email` mandatory. AI Control Tower can operate with email only, but full name improves audit readability.

## Assign users and groups

Assign:

- internal users or groups who belong to the verified org domain

Do not assign privileged access through Okta group mapping yet unless you implement external-group sync. Use AI Control Tower role management for admin, CRO, CISO, and other elevated roles.

## Configure AI Control Tower

In the `Identity` tab of Settings:

1. Set auth mode to `SAML SSO`
2. Enter the Okta IdP SSO URL
3. Enter the IdP issuer / entity ID
4. Paste the Okta certificate
5. Add the verified corporate domain
6. Enable JIT only if you want automatic onboarding for internal employees
7. Keep the default JIT role at `reviewer`

## Test flow

Run this sequence:

1. Copy the SSO start URL from Settings
2. Open it in a private browser window
3. Authenticate through Okta
4. Confirm `/api/auth/user` resolves with the correct `currentOrganizationId`
5. Confirm the user lands in the expected org

Expected outcomes:

- allowlisted employee + JIT on -> user is created or linked and admitted
- allowlisted employee + JIT off -> user is denied unless already a member
- external email -> denied unless onboarded through invite flow

## Common Okta issues

`Organization not found`:

- confirm the org slug in the SSO start URL

`SAML response did not include a usable email claim`:

- confirm Name ID or `email` attribute is mapped to the user email

`Email domain is not allowed for this organization`:

- verify the domain is claimed and DNS-verified in AI Control Tower

User signs in but lands in the wrong org:

- verify the org slug on the SSO start URL
- verify the user does not have a stale multi-org session

## Recommended operating model

- internal staff: Okta + verified allowlisted domain + optional JIT
- external reviewers: invite-only
- privileged roles: assign manually in AI Control Tower after onboarding
