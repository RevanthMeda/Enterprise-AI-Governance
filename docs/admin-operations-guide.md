# AI Control Tower Admin Operations Guide

This guide is for organization admins and operators responsible for keeping the tenant configured and healthy.

## 1. Core admin responsibilities

An organization admin is responsible for:
- managing organization access
- configuring identity
- managing domains and SSO posture
- inviting and managing members
- enabling MFA and reviewing security posture
- reviewing admin activity and failed background jobs
- maintaining telemetry thresholds and adapter access
- managing retention and legal hold
- configuring integrations
- maintaining billing/subscription data

## 2. Daily operating pages

Primary admin pages:
- `/dashboard`
- `/settings`
- `/integrations`
- `/billing`
- `/telemetry-policy`
- `/telemetry-adapter`
- `/retention-control`
- `/exit-readiness`
- `/portfolio-control` if applicable

## 3. Settings operations

## 3.1 Access tab
Use for:
- sending invites
- resending invites
- revoking invites
- viewing members
- changing member state/role

Typical admin workflow:
1. Open `/settings`
2. Go to `Access`
3. Send invite
4. Track status in invite table
5. Review members and update roles if needed

## 3.2 Identity tab
Use for:
- auth mode selection
- SAML/OIDC setup
- JIT default role
- enforce-SSO behavior
- domain management
- DNS verification

Typical admin workflow:
1. Select auth mode
2. Configure SAML or OIDC fields
3. Add corporate domain
4. Publish DNS TXT record
5. Verify domain
6. Set primary domain
7. Enable JIT if desired

## 3.3 Security tab
Use for:
- MFA enrollment
- recovery code management
- MFA disable when required

Current scope:
- this tab is mainly MFA
- broader enterprise controls are signposted but handled elsewhere or through infrastructure

## 3.4 Activity tab
Use for:
- reviewing admin activity
- filtering/searching activity
- exporting activity CSV
- checking background job health
- retrying failed jobs

Operational habit:
- check this tab after identity changes, invite delivery issues, or queue-backed failures

## 3.5 Governance tab
Use for:
- viewing framework posture
- reviewing org scope and deadlines

## 4. Identity administration

## 4.1 Local auth
Use only if your organization supports local credentials.

## 4.2 SAML
Admin enters:
- IdP SSO URL
- SP entity ID
- expected issuer
- callback URL
- certificate

## 4.3 OIDC
Admin enters:
- issuer
- authorization URL
- token URL
- JWKS URL
- client ID
- client secret
- scopes
- callback URL

## 4.4 Domain administration
Managed domains control:
- SSO/JIT routing
- primary domain selection
- domain verification state

Important operations:
- add domain
- copy TXT record
- verify DNS
- set primary
- delete domain

## 4.5 JIT provisioning
When enabled:
- allowlisted SSO users can be created automatically
- default role is applied at first access

When disabled:
- users must be invited or otherwise provisioned

## 5. Invite and membership administration

Invite lifecycle:
- create
- resend
- revoke
- accept

Membership administration:
- search/filter users
- inspect state
- change role if allowed by UI/backend policy

## 6. Telemetry administration

## 6.1 Telemetry policy
Use `/telemetry-policy` for threshold tuning.

Key fields:
- drift warning/critical
- bias threshold
- safety threshold
- override rate thresholds
- error rate thresholds
- warning notifications
- critical auto-escalation

If your org belongs to a portfolio:
- the org may inherit defaults
- explicit org override can be reset to inherited values

## 6.2 Telemetry adapter
Use `/telemetry-adapter` for gateway/SDK onboarding.

Steps:
1. enable adapter
2. define allowed gateways
3. rotate key
4. store plaintext key securely
5. hand endpoint and example to gateway team

Important note:
- plaintext key is shown once
- treat it like a secret

## 7. Incident operations

Use `/incidents` to:
- open incidents
- classify category and severity
- move through incident states
- track postmortem completion
- record regulatory notifications

Good admin practice:
- review critical incidents daily
- ensure postmortems are completed
- verify affected decision traces are linked

## 8. Retention operations

Use `/retention-control` to:
- review retention counts
- inspect due-for-archive traces
- apply legal hold
- release legal hold
- run retention manually if needed

Important rules:
- archived traces are immutable
- legal hold requires a reason
- retention/legal-hold actions are audit logged

## 9. Integration operations

Use `/integrations` to manage Jira.

Admin tasks:
1. set base URL
2. set project key
3. set user email
4. set API token
5. choose issue type
6. test connection

After that:
- qualifying workflows can create/sync Jira issues

## 10. Billing operations

Use `/billing` to maintain:
- subscription tier
- status
- billing email
- seat limit
- usage summary

This is administrative and commercial, not a full payments UI.

## 11. Operational checks and routines

## Daily
- review dashboard watchlist
- review settings activity tab
- check background job failures
- check incidents if telemetry is active

## Weekly
- review exit readiness
- review telemetry thresholds
- review domain and SSO settings after identity changes

## Monthly
- review billing and seat limits
- review retention status
- review integration status

## Before go-live or after deploy
- verify `/api/health`
- verify `/api/ready`
- verify login
- verify settings
- verify trust center and API docs
- verify decision trace, incidents, billing, and telemetry pages

## 12. What admins should do first in a new org

1. open `/settings`
2. configure auth mode
3. configure domains
4. verify domain DNS
5. set JIT/default role if desired
6. invite team members
7. register first systems in `/registry`
8. review `/dashboard`
9. configure telemetry if needed
10. review `/exit-readiness`

## 13. Known current limitation

The login page now has visible recovery guidance, but there is still no full self-service reset-token/email password reset flow.
