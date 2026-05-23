# Entra ID SAML Setup Guide

This guide configures AI CONTROL GRID for Microsoft Entra ID SAML-based sign-in.

## Before you start

You need:

- an AI CONTROL GRID organization with admin access
- a verified organization domain
- your production backend URL
- your organization slug
- Microsoft Entra admin access

Use the backend service URL for SAML endpoints.

## Values you need from AI CONTROL GRID

Routes:

- metadata URL: `https://<backend-domain>/api/auth/sso/metadata?org=<org-slug>`
- start URL: `https://<backend-domain>/api/auth/sso/start?org=<org-slug>&next=/`
- callback URL: `https://<backend-domain>/api/auth/sso/callback`

Org settings:

- auth mode: `saml`
- optional JIT provisioning
- low-privilege default JIT role

## Create the enterprise application

In Microsoft Entra:

1. Go to `Enterprise applications`
2. Create a new application
3. Choose `Create your own application`
4. Select SAML as the sign-in method

## Basic SAML configuration

Set:

- Identifier (Entity ID):
  - use the SP entity ID configured in AI CONTROL GRID
- Reply URL (Assertion Consumer Service URL):
  - `https://<backend-domain>/api/auth/sso/callback`
- Sign on URL:
  - optional, but if set, use the SSO start URL for your org

## Claims and attributes

Required claim:

- email address

Recommended claims:

- `emailaddress`
- `name`

AI CONTROL GRID needs a stable email identity. If Entra emits UPN instead of the user email, confirm it matches the org allowlisted domain and your identity policy.

## Certificate and login URL

From Entra, capture:

- Login URL
- Microsoft Entra Identifier
- X.509 Certificate

Enter these in the AI CONTROL GRID `Identity` settings.

## Configure AI CONTROL GRID

In Settings:

1. switch auth mode to `SAML SSO`
2. paste the Entra login URL
3. paste the Entra identifier / issuer
4. paste the signing certificate
5. add and verify your corporate domain
6. enable JIT only when you want automatic internal onboarding
7. keep the default JIT role low privilege

## Test flow

Use a private browser session and:

1. open the copied SSO start URL
2. sign in with a user from the verified corporate domain
3. confirm the login completes
4. confirm the user lands in the correct organization
5. confirm `/api/auth/user` shows the expected `currentOrganizationId`

## Common Entra issues

User is denied by allowlist:

- confirm the incoming email/UPN domain matches the verified org domain

Callback fails with missing email:

- ensure the email claim is sent explicitly

SSO works for some users but not others:

- check assignment in the Entra enterprise application
- verify the users belong to the right corporate domain

Privileged users are over-provisioned:

- do not use JIT for admin roles
- assign elevated roles manually in AI CONTROL GRID

## Recommended operating model

- Entra + JIT for standard internal users
- manual role assignment for privileged users
- invite flow for external third parties
