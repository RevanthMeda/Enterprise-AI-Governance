import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

test("production workflows use the versioned expand migration and require a backup gate", () => {
  for (const fileName of ["deploy.yml", "promote-production.yml"]) {
    const source = fs.readFileSync(
      path.join(process.cwd(), ".github", "workflows", fileName),
      "utf8",
    );
    const productionSection = source.slice(source.indexOf("environment: production"));
    assert.match(productionSection, /npm run db:migrate:production/);
    assert.match(productionSection, /PRODUCTION_DB_BACKUP_CONFIRMED/);
    assert.match(
      productionSection,
      /test "\$PRODUCTION_DB_BACKUP_CONFIRMED" = "\$GITHUB_SHA"/,
    );
    assert.match(productionSection, /group: production-deploy/);
    assert.match(productionSection, /cancel-in-progress: false/);
    assert.match(productionSection, /refs\/remotes\/origin\/main/);
    assert.doesNotMatch(productionSection, /db:push -- --force/);
    assert.doesNotMatch(productionSection, /if:.*secrets\./);

    const securityGateIndex = source.indexOf("npm run security:sast");
    const migrationIndex = source.indexOf("npm run db:migrate:production");
    const renderIndex = source.indexOf("Trigger Render deploy hook");
    const readinessIndex = source.indexOf("Wait for the new Render release to be ready");
    const inviteMigrationIndex = source.indexOf("npm run db:migrate:invite-token-digests");
    const firebaseIndex = source.indexOf("Deploy Firebase Hosting");
    assert.ok(securityGateIndex >= 0 && securityGateIndex < migrationIndex);
    assert.ok(migrationIndex < renderIndex);
    assert.ok(renderIndex < readinessIndex);
    assert.ok(readinessIndex < inviteMigrationIndex);
    assert.ok(inviteMigrationIndex < firebaseIndex);
  }

  const promotion = fs.readFileSync(
    path.join(process.cwd(), ".github", "workflows", "promote-production.yml"),
    "utf8",
  );
  assert.match(promotion, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(promotion, /npm run test:regression:all/);
});

test("production migration is additive, idempotent, and collision-gated", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "script", "migrate-production-schema.ts"),
    "utf8",
  );
  assert.match(source, /app_schema_migrations/);
  assert.match(source, /PRODUCTION_DB_BACKUP_CONFIRMED/);
  assert.match(source, /pg_try_advisory_lock/);
  assert.match(source, /lock_timeout/);
  assert.match(source, /statement_timeout/);
  assert.match(source, /add column if not exists session_version/);
  assert.match(source, /add column if not exists mfa_failed_attempts/);
  assert.match(source, /add column if not exists mfa_failure_window_started_at/);
  assert.match(source, /add column if not exists mfa_locked_until/);
  assert.match(source, /create table if not exists saml_authn_requests/);
  assert.match(source, /create table if not exists sso_login_attempts/);
  assert.match(source, /create table if not exists sso_login_exchanges/);
  assert.match(source, /create table if not exists external_auth_identities/);
  assert.match(source, /default gen_random_uuid\(\)::text/);
  assert.match(source, /create table if not exists rate_limit_buckets/);
  assert.match(source, /background_jobs_status_locked_at_idx/);
  assert.match(source, /decision_audit_versions_decision_version_unique_idx/);
  assert.match(source, /having count\(\*\) > 1/);
  assert.doesNotMatch(source, /drop table|drop column|drop index|truncate/i);
});
