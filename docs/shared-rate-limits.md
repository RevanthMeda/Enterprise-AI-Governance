# Shared public-endpoint rate limits

Public write and authentication endpoints use fixed-window counters in the
`rate_limit_buckets` PostgreSQL table. This makes enforcement consistent across
multiple backend instances and serverless invocations. The database stores only
purpose-bound HMAC digests; raw client addresses, email/account identifiers,
password-reset tokens, and invite tokens are not persisted in the limiter.

Protected surfaces include marketing events, lead capture, browser error
reporting, registration, login, forgot/reset password, and invite preview or
acceptance. Limits combine a high global safety ceiling with narrower
client/account/token buckets. A database protection failure fails these public
writes closed with `503 ABUSE_PROTECTION_UNAVAILABLE`; exceeded buckets return
`429 RATE_LIMIT_EXCEEDED` and `Retry-After`.

Before deploying this release, run `npm run db:migrate:production` against the
production database after verifying a recoverable backup. Never use forced
schema synchronization against production. The versioned migration creates
`rate_limit_buckets` and its expiry indexes idempotently.

`RATE_LIMIT_HMAC_SECRET` is optional but recommended. It must be a stable,
random value of at least 32 characters shared by every backend instance. When it
is omitted, the already-required `CONTROL_TOWER_VAULT_SECRET` is used. Never
rotate either value casually: rotation creates a new digest namespace and
temporarily resets active limits. `RATE_LIMIT_NAMESPACE` is optional and is
useful only when separate environments intentionally share one database.

Expired rows are deleted at a bounded cadence from normal limiter traffic. The
expiry index keeps this cleanup efficient.
