import pg from "pg";
import { getPgPoolConfig } from "../server/db-config";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the production schema migration");
}

const backupConfirmation = process.env.PRODUCTION_DB_BACKUP_CONFIRMED?.trim();
const githubSha = process.env.GITHUB_SHA?.trim().toLowerCase();
if (githubSha) {
  if (backupConfirmation?.toLowerCase() !== githubSha) {
    throw new Error(
      "PRODUCTION_DB_BACKUP_CONFIRMED must equal GITHUB_SHA for this production release",
    );
  }
} else if (backupConfirmation !== "true") {
  throw new Error(
    "Set PRODUCTION_DB_BACKUP_CONFIRMED=true only after verifying a recoverable database backup",
  );
}

const migrationId = "2026-07-13-production-readiness-expand-v1";
const pool = new Pool({
  ...getPgPoolConfig(databaseUrl),
  max: 1,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 10_000,
});
const client = await pool.connect();
let migrationLockAcquired = false;

try {
  const migrationLock = await client.query<{ acquired: boolean }>(
    "select pg_try_advisory_lock(hashtext('aict-production-schema-migration')) as acquired",
  );
  if (!migrationLock.rows[0]?.acquired) {
    throw new Error("Another production schema migration is already running");
  }
  migrationLockAcquired = true;
  await client.query("select set_config('lock_timeout', '30s', false)");
  await client.query("select set_config('statement_timeout', '15min', false)");
  await client.query("begin");
  await client.query(`
    create table if not exists app_schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  const applied = await client.query<{ id: string }>(
    "select id from app_schema_migrations where id = $1",
    [migrationId],
  );
  if (applied.rowCount) {
    await client.query("commit");
    console.log(`Production schema migration already applied: ${migrationId}`);
  } else {
    const duplicateEmail = await client.query(`
      select lower(email) as email
      from users
      where email is not null
      group by lower(email)
      having count(*) > 1
      limit 1
    `);
    if (duplicateEmail.rowCount) {
      throw new Error("Cannot add the case-insensitive user email constraint while duplicate emails exist");
    }
    const duplicateDecisionVersion = await client.query(`
      select decision_audit_id, version_number
      from decision_audit_versions
      group by decision_audit_id, version_number
      having count(*) > 1
      limit 1
    `);
    if (duplicateDecisionVersion.rowCount) {
      throw new Error("Cannot add the decision-version uniqueness constraint while duplicates exist");
    }

    await client.query(`
      alter table users add column if not exists session_version integer not null default 0;
      alter table users add column if not exists mfa_failed_attempts integer not null default 0;
      alter table users add column if not exists mfa_failure_window_started_at timestamptz;
      alter table users add column if not exists mfa_locked_until timestamptz;

      create unique index if not exists users_email_lower_unique on users (lower(email));
      create index if not exists background_jobs_status_locked_at_idx on background_jobs (status, locked_at);

      create table if not exists saml_authn_requests (
        request_id_hash text primary key,
        organization_id varchar not null references organizations(id) on delete cascade,
        relay_state_hash text not null,
        request_created_at text not null,
        expires_at timestamptz not null,
        consumed_at timestamptz,
        created_at timestamptz not null default now()
      );

      create table if not exists sso_login_attempts (
        state_hash text primary key,
        organization_id varchar not null references organizations(id) on delete cascade,
        provider text not null,
        pending_payload text not null,
        expires_at timestamptz not null,
        consumed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create index if not exists sso_login_attempts_expires_at_idx on sso_login_attempts(expires_at);
      create index if not exists sso_login_attempts_organization_id_idx on sso_login_attempts(organization_id);

      create table if not exists sso_login_exchanges (
        code_hash text primary key,
        user_id varchar not null references users(id) on delete cascade,
        organization_id varchar not null references organizations(id) on delete cascade,
        next_path text not null default '/',
        expires_at timestamptz not null,
        consumed_at timestamptz,
        created_at timestamptz not null default now()
      );
      create index if not exists sso_login_exchanges_expires_at_idx on sso_login_exchanges(expires_at);
      create index if not exists sso_login_exchanges_user_id_idx on sso_login_exchanges(user_id);

      create table if not exists external_auth_identities (
        id varchar primary key default gen_random_uuid()::text,
        user_id varchar not null references users(id) on delete cascade,
        organization_id varchar not null references organizations(id) on delete cascade,
        provider text not null,
        issuer text not null,
        subject text not null,
        created_at timestamptz not null default now(),
        last_seen_at timestamptz not null default now()
      );
      create unique index if not exists external_auth_identities_subject_unique
        on external_auth_identities(organization_id, provider, issuer, subject);
      create unique index if not exists external_auth_identities_user_issuer_unique
        on external_auth_identities(user_id, organization_id, provider, issuer);
      create index if not exists external_auth_identities_organization_id_idx
        on external_auth_identities(organization_id);
      create index if not exists external_auth_identities_user_id_idx
        on external_auth_identities(user_id);

      create table if not exists rate_limit_buckets (
        key_hash varchar(64) primary key,
        scope text not null,
        attempts integer not null default 0,
        window_started_at timestamptz not null,
        expires_at timestamptz not null,
        updated_at timestamptz not null default now()
      );
      create index if not exists rate_limit_buckets_expires_at_idx on rate_limit_buckets(expires_at);
      create index if not exists rate_limit_buckets_scope_expires_at_idx on rate_limit_buckets(scope, expires_at);

      create unique index if not exists decision_audit_versions_decision_version_unique_idx
        on decision_audit_versions(decision_audit_id, version_number);
    `);
    await client.query("insert into app_schema_migrations(id) values ($1)", [migrationId]);
    await client.query("commit");
    console.log(`Applied production schema migration: ${migrationId}`);
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  if (migrationLockAcquired) {
    await client.query("select pg_advisory_unlock(hashtext('aict-production-schema-migration'))").catch(() => undefined);
  }
  client.release();
  await pool.end();
}
