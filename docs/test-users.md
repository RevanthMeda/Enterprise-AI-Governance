# Baseline Test Users

The app now seeds baseline role users at startup when:
- `NODE_ENV` is not `production`, or
- `SEED_TEST_USERS=true`

Default password:
- `TEST_USER_PASSWORD` env value, or
- `TestUser123!` if not set

Seeded usernames:
- `admin_test`
- `cro_test`
- `ciso_test`
- `compliance_lead_test`
- `reviewer_test`
- `system_owner_test`
- `auditor_test`

## Production note

For hosted environments, enable explicitly:
- `SEED_TEST_USERS=true`
- `TEST_USER_PASSWORD=<strong-temp-password>`

Then restart the backend once so startup seeding runs and creates missing users idempotently.

