# Enterprise Identity API Notes

This document is the implementation-facing API reference until a full OpenAPI refresh is published.

Checked-in OpenAPI artifact:

- [openapi.enterprise-identity.yaml](/mnt/d/Personal/Enterprise-AI-Governance/docs/openapi.enterprise-identity.yaml)
- [openapi.platform.yaml](/mnt/d/Personal/Enterprise-AI-Governance/docs/openapi.platform.yaml)

## Organization context

Active organization can be resolved from:

- `req.session.currentOrganizationId`
- `X-Organization-Id` request header

Use `X-Organization-Id` only for users who already have multiple valid memberships.

## Auth/session payload

Canonical auth payload:

- `GET /api/auth/user`

Expected payload fields include:

- `id`
- `username`
- `email`
- `role`
- `currentOrganizationId`
- `organizations[]`

## SSO routes

Metadata:

- `GET /api/auth/sso/metadata`

Start:

- `GET /api/auth/sso/start?org=<org-slug>&next=/desired-path`

Callback:

- `POST /api/auth/sso/callback`

Mock callback for regression coverage:

- `POST /api/auth/sso/mock-callback`
- available only outside production, or when `ENABLE_TEST_AUTH_ROUTES=true`

Behavior notes:

- external `next` values are sanitized
- session `currentOrganizationId` is set after successful completion
- JIT provisioning is org-scoped and domain-gated

OIDC start:

- `GET /api/auth/oidc/start?org=<org-slug>&next=/desired-path`

OIDC callback:

- `GET /api/auth/oidc/callback`

OIDC mock callback for regression coverage:

- `POST /api/auth/oidc/mock-callback`
- available only outside production, or when `ENABLE_TEST_AUTH_ROUTES=true`

OIDC config currently uses explicit provider endpoints:

- issuer
- authorization URL
- token URL
- JWKS URL
- client ID
- optional client secret
- callback URL
- scopes

## Organization auth settings

Read:

- `GET /api/organization/auth-settings`

Write:

- `PATCH /api/organization/auth-settings`

Current settings include:

- auth mode
- SSO configuration
- JIT toggle
- default JIT role
- allowed domains

Allowed domains are mirrored into first-class `organization_domains`.

## Organization domains

List:

- `GET /api/organization/domains`

Replace:

- `PUT /api/organization/domains`

Update domain metadata:

- `PATCH /api/organization/domains/:domainId`

Verify DNS:

- `POST /api/organization/domains/:domainId/verify`

Delete:

- `DELETE /api/organization/domains/:domainId`

Current domain payload fields include:

- `id`
- `domain`
- `isVerified`
- `isPrimary`
- `verificationToken`
- `verifiedAt`

## Organization invites

List:

- `GET /api/organization/invites`

Create:

- `POST /api/organization/invites`

Resend:

- `POST /api/organization/invites/:inviteId/resend`

Revoke:

- `POST /api/organization/invites/:inviteId/revoke`

Preview:

- `GET /api/organization/invites/preview`

Accept:

- `POST /api/organization/invites/accept`

Behavior notes:

- invite acceptance is org-scoped
- invite acceptance bypasses domain allowlisting intentionally
- invite-created memberships use `provisioningSource = "invite"`

## Organization and user settings

Read current user/org settings:

- `GET /api/settings`

Update current user/org settings:

- `PATCH /api/settings`

## Role and tenant enforcement expectations

Protected org-admin areas should use:

- `requireAuth`
- `requireTenant`
- `requireOrgRole("owner", "admin")`

Protected tenant data routes should use:

- `requireAuth`
- `requireTenant`

## Migration note

If you are maintaining a formal OpenAPI document, update it to include:

- `X-Organization-Id` header semantics
- enterprise SSO routes
- domain verification routes
- invite lifecycle routes
- auth payload fields carrying `currentOrganizationId`
