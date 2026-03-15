# AI Control Tower Documentation Index

This documentation set is the handoff guide for the current application state.

Use these documents in this order:

1. [Product Overview](./product-overview.md)
2. [Route-by-Route User Manual](./route-by-route-user-manual.md)
3. [Admin Operations Guide](./admin-operations-guide.md)
4. [Role-Based Usage Guide](./role-based-usage-guide.md)
5. [Architecture and Data Flow Summary](./architecture-data-flow-summary.md)

## What each document covers

`product-overview.md`
- what the platform is
- what problems it solves
- major feature areas
- current maturity and important constraints

`route-by-route-user-manual.md`
- every major public and authenticated route
- what users will see
- what each page is for
- how page flows connect to one another

`admin-operations-guide.md`
- organization admin responsibilities
- identity setup
- invites
- domains
- telemetry
- retention
- integrations
- billing
- production operating routines

`role-based-usage-guide.md`
- what each seeded platform role should focus on
- how those roles use the app
- what pages matter most to each one

`architecture-data-flow-summary.md`
- frontend, backend, database, auth, tenancy, jobs, telemetry, audit, portfolio, and deployment flow

## Recommended reading paths

For product review:
- Product Overview
- Route-by-Route User Manual

For admin onboarding:
- Admin Operations Guide
- Route-by-Route User Manual

For internal enablement:
- Role-Based Usage Guide
- Product Overview

For technical handoff:
- Architecture and Data Flow Summary
- Admin Operations Guide

## Important current limitation

The platform has visible password recovery guidance on the login page, but it still does not have a full self-service email/token reset flow. That is the main remaining auth-product gap from a user-experience standpoint.
