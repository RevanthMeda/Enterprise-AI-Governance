import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  areMockAuthRoutesEnabled,
  getRuntimeConfig,
  validateRuntimeEnvironment,
} from "../server/env";
import { loadProjectEnv } from "../server/load-env";

function makeProductionEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:postgres@db.example.com:5432/enterprise_ai_governance",
    SESSION_SECRET: "s".repeat(48),
    PASSWORD_RESET_SECRET: "r".repeat(48),
    CONTROL_TOWER_VAULT_SECRET: "v".repeat(48),
    PUBLIC_APP_URL: "https://app.example.com",
    CORS_ALLOWED_ORIGINS: "https://app.example.com",
    ...overrides,
  };
}

test("runtime config defaults to secure production behavior", () => {
  const config = getRuntimeConfig(makeProductionEnv());
  assert.equal(config.csrfEnforced, true);
  assert.equal(config.trustProxy, true);
  assert.equal(config.sessionCookieSameSite, "strict");
  assert.equal(config.sessionCookieSecure, true);
});

test("runtime validation rejects insecure cross-site cookie configuration", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          SESSION_COOKIE_SAME_SITE: "none",
          SESSION_COOKIE_SECURE: "false",
        }),
      ),
    /SESSION_COOKIE_SECURE cannot be false/,
  );
});

test("runtime validation rejects placeholder production secrets", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          PASSWORD_RESET_SECRET: "<set-a-dedicated-password-reset-secret>",
        }),
      ),
    /PASSWORD_RESET_SECRET must not use a placeholder value/,
  );
});

test("runtime validation rejects missing public app origin in production", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          PUBLIC_APP_URL: "",
        }),
      ),
    /PUBLIC_APP_URL must be set in production/,
  );
});

test("development runtime allows relaxed defaults", () => {
  const config = validateRuntimeEnvironment({
    NODE_ENV: "development",
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/enterprise_ai_governance",
    SESSION_SECRET: "dev-session-secret",
  });

  assert.equal(config.csrfEnforced, false);
  assert.equal(config.trustProxy, false);
  assert.equal(config.sessionCookieSameSite, "lax");
  assert.equal(config.sessionCookieSecure, false);
});

test("mock auth routes are disabled in production unless explicitly enabled", () => {
  assert.equal(areMockAuthRoutesEnabled(makeProductionEnv()), false);
  assert.equal(
    areMockAuthRoutesEnabled(makeProductionEnv({ ENABLE_TEST_AUTH_ROUTES: "true" })),
    true,
  );
  assert.equal(
    areMockAuthRoutesEnabled(makeProductionEnv({ ENABLE_TEST_AUTH_ROUTES: "1" })),
    true,
  );
  assert.equal(
    areMockAuthRoutesEnabled({
      NODE_ENV: "development",
    }),
    true,
  );
});

test("runtime validation recognizes boolean-like Vercel flags", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          VERCEL: "true",
        }),
      ),
    /CRON_SECRET must be set/,
  );

  assert.doesNotThrow(() =>
    validateRuntimeEnvironment(
      makeProductionEnv({
        VERCEL: "true",
        CRON_SECRET: "cron-secret-value",
      }),
    ),
  );
});

test("project env loader prefers shell variables and lets .env.local override .env", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aict-env-loader-"));

  try {
    fs.writeFileSync(
      path.join(tempDir, ".env"),
      [
        "SESSION_SECRET=env-file-value",
        "PUBLIC_APP_URL=http://localhost:5000",
        "SMTP_HOST=smtp.from-env.test",
      ].join("\n"),
    );
    fs.writeFileSync(
      path.join(tempDir, ".env.local"),
      [
        "PUBLIC_APP_URL=https://local-override.example.com",
        "SMTP_HOST=smtp.from-local.test",
      ].join("\n"),
    );

    const targetEnv: NodeJS.ProcessEnv = {
      SESSION_SECRET: "shell-value-wins",
    };

    loadProjectEnv({
      rootDir: tempDir,
      targetEnv,
    });

    assert.equal(targetEnv.SESSION_SECRET, "shell-value-wins");
    assert.equal(targetEnv.PUBLIC_APP_URL, "https://local-override.example.com");
    assert.equal(targetEnv.SMTP_HOST, "smtp.from-local.test");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
