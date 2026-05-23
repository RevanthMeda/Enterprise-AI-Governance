# Administrator IdP Setup Guide

This guide is for organization administrators configuring enterprise identity in AI CONTROL GRID.

Provider-specific guides:

- [okta-saml-setup.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/okta-saml-setup.md)
- [entra-id-saml-setup.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/entra-id-saml-setup.md)
- [oidc-setup.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/oidc-setup.md)
- [okta-oidc-setup.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/okta-oidc-setup.md)
- [entra-id-oidc-setup.md](/mnt/d/Personal/Enterprise-AI-Governance/docs/entra-id-oidc-setup.md)

## Prerequisites

You need:

- organization admin access
- access to your IdP admin console
- control of the corporate DNS zone for each claimed domain

Supported deployment pattern:

- frontend on Netlify
- backend on Render or another Node host
- backend reachable over HTTPS

## Identity modes

Current supported organization modes:

- local username/password
- SAML-based enterprise SSO
- OIDC / OpenID Connect enterprise SSO

Recommended policy:

- use SSO + JIT for internal employees
- use invites for external auditors, advisors, and contractors

## Settings area

Open [settings.tsx](/mnt/d/Personal/Enterprise-AI-Governance/client/src/pages/settings.tsx) and go to the `Identity` tab.

Admin capabilities include:

- set auth mode
- configure SAML or OIDC fields
- manage claimed domains
- verify domains via DNS TXT record
- enable or disable JIT provisioning
- choose the default JIT role
- copy the provider start URL

## Identity configuration fields

Configure these org settings:

- auth mode
- SAML IdP entrypoint / SSO URL
- SAML issuer / entity ID
- SAML certificate
- OIDC issuer
- OIDC authorization URL
- OIDC token URL
- OIDC JWKS URL
- OIDC client ID and optional client secret
- callback URL
- JIT provisioning toggle
- JIT default role

Current app routes:

- metadata: `GET /api/auth/sso/metadata`
- SAML start: `GET /api/auth/sso/start?org=<org-slug>&next=/`
- SAML callback: `POST /api/auth/sso/callback`
- OIDC start: `GET /api/auth/oidc/start?org=<org-slug>&next=/`
- OIDC callback: `GET /api/auth/oidc/callback`

## Domain allowlisting

Add managed domains for internal user routing.

Examples:

- `example.com`
- `subsidiary.example.com`

Do not include:

- `https://example.com`
- `@example.com`
- paths or query strings

Behavior:

- domains are normalized to lowercase
- duplicates are rejected after normalization
- first-class `organization_domains` are the source of truth

## DNS verification flow

Each managed domain includes a generated TXT verification record.

Record name:

- `_aicontrolgrid.<domain>`

Record value:

- `aicontrolgrid-verification=<token>`

Steps:

1. add the TXT record in your DNS provider
2. wait for propagation
3. use `Verify DNS` or `Re-check DNS` in Settings
4. confirm the domain becomes `Verified`

Recommended policy:

- keep only verified domains as active enterprise claims
- set one verified domain as `Primary`

## JIT provisioning

JIT provisioning allows new internal users to be created automatically during SSO login.

Rules:

- JIT must be enabled for the organization
- the user domain must match the org allowlist
- the user gets the default JIT role
- JIT actions are audited

Recommended default role:

- `reviewer`

Do not use `admin` as the default JIT role.

## Invites

Invites are intended for users who should access the org but should not be admitted through the org allowlist.

Typical use cases:

- external auditors
- outside counsel
- consultants
- temporary reviewers

Supported invite actions:

- create
- resend
- revoke
- preview
- accept

Invite lifecycle is visible in the `Access` tab of Settings.

## Org switching

Users with multiple active memberships can switch organizations.

Behavior:

- the session `currentOrganizationId` changes
- frontend cache is invalidated by org context
- subsequent API requests resolve against the new active org

## Validation checklist

After setup, validate:

1. `/api/auth/sso/metadata` returns org-aware metadata
2. the copied SSO start URL redirects correctly
3. the claimed domain verifies through DNS TXT
4. a user from the allowlisted domain can sign in through SSO
5. JIT creates a membership only when allowed
6. an invited external user can accept the invite without allowlisting
7. `/api/auth/user` returns the correct `currentOrganizationId`

## Common failure cases

Local login still appears enabled when SSO is expected:

- check org auth mode
- confirm the frontend is pointed at the correct backend

JIT user is denied:

- verify the org has JIT enabled
- verify the email domain is allowlisted
- verify the domain is entered in normalized form

OIDC callback fails:

- verify issuer, token URL, and JWKS URL
- verify the client ID matches the provider-issued audience
- verify the callback URL matches the app registration exactly

SSO start URL returns org not found:

- verify the org slug
- verify the route uses the correct backend

Domain verification does not succeed:

- confirm TXT record name and value exactly match
- wait for DNS propagation
- re-run verification from the Settings page

## Recommended admin operating model

- internal employees: SSO + verified allowlisted domain + JIT
- external collaborators: invite-only
- privileged roles: assign manually after onboarding

This keeps identity onboarding low-friction while avoiding unsafe automatic privilege escalation.
