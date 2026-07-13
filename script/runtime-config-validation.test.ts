import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import session from "express-session";
import {
  areMockAuthRoutesEnabled,
  getSmtpEnvironmentConfig,
  getRuntimeConfig,
  isSelfSignupEnabled,
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
  assert.equal(config.sessionCookieName, "connect.sid");
  assert.equal(config.sessionCookieSameSite, "strict");
  assert.equal(config.sessionCookiePartitioned, false);
  assert.equal(config.sessionCookieSecure, true);
});

test("cross-site session cookies enable partitioning by default", () => {
  const config = getRuntimeConfig(
    makeProductionEnv({
      SESSION_COOKIE_SAME_SITE: "none",
    }),
  );

  assert.equal(config.sessionCookieSameSite, "none");
  assert.equal(config.sessionCookieName, "__Host-aict.sid.v2");
  assert.equal(config.sessionCookiePartitioned, true);
  assert.equal(config.sessionCookieSecure, true);
});

test("production rejects a same-site cookie profile for a split frontend and API", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          PUBLIC_APP_URL: "https://app.example.net",
          API_PUBLIC_URL: "https://api.example.net",
          CORS_ALLOWED_ORIGINS: "https://app.example.net",
          SESSION_COOKIE_SAME_SITE: "strict",
          SESSION_COOKIE_PARTITIONED: "false",
          SESSION_COOKIE_NAME: "connect.sid",
        }),
      ),
    /Cross-origin frontend\/API deployments require SESSION_COOKIE_SAME_SITE=none/,
  );

  assert.doesNotThrow(() =>
    validateRuntimeEnvironment(
      makeProductionEnv({
        PUBLIC_APP_URL: "https://app.example.net",
        API_PUBLIC_URL: "https://api.example.net",
        CORS_ALLOWED_ORIGINS: "https://app.example.net",
        SESSION_COOKIE_SAME_SITE: "none",
        SESSION_COOKIE_SECURE: "true",
        SESSION_COOKIE_PARTITIONED: "true",
        SESSION_COOKIE_NAME: "__Host-aict.sid.v2",
      }),
    ),
  );
});

test("session middleware serializes the secure partitioned cookie attributes", () => {
  const cookie = new session.Cookie({
    httpOnly: true,
    secure: true,
    sameSite: "none",
    partitioned: true,
  });
  const serialized = cookie.serialize("connect.sid", "test-session-id");

  assert.match(serialized, /HttpOnly/);
  assert.match(serialized, /Secure/);
  assert.match(serialized, /Partitioned/);
  assert.match(serialized, /SameSite=None/);
});

test("cross-site session cookie partitioning can be explicitly disabled", () => {
  const config = getRuntimeConfig(
    makeProductionEnv({
      SESSION_COOKIE_SAME_SITE: "none",
      SESSION_COOKIE_PARTITIONED: "false",
    }),
  );

  assert.equal(config.sessionCookiePartitioned, false);
});

test("runtime validation rejects partitioned cookies without Secure", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/enterprise_ai_governance",
        SESSION_SECRET: "dev-session-secret",
        SESSION_COOKIE_PARTITIONED: "true",
        SESSION_COOKIE_SECURE: "false",
      }),
    /SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_PARTITIONED=true/,
  );
});

test("runtime validation rejects an invalid session cookie name", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/enterprise_ai_governance",
        SESSION_SECRET: "dev-session-secret",
        SESSION_COOKIE_NAME: "invalid cookie name",
      }),
    /SESSION_COOKIE_NAME may contain only/,
  );
});

test("runtime validation requires Secure for a __Host- cookie name", () => {
  assert.throws(
    () =>
      validateRuntimeEnvironment({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/enterprise_ai_governance",
        SESSION_SECRET: "dev-session-secret",
        SESSION_COOKIE_NAME: "__Host-aict.sid.v2",
        SESSION_COOKIE_SECURE: "false",
      }),
    /SESSION_COOKIE_SECURE must be true when SESSION_COOKIE_NAME uses the __Host- prefix/,
  );
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

test("runtime validation accepts a dedicated rate-limit HMAC secret and rejects unsafe values", () => {
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment(
      makeProductionEnv({
        RATE_LIMIT_HMAC_SECRET: "l".repeat(48),
      }),
    ),
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          RATE_LIMIT_HMAC_SECRET: "<set-a-rate-limit-secret>",
        }),
      ),
    /RATE_LIMIT_HMAC_SECRET/,
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({
          RATE_LIMIT_HMAC_SECRET: "v".repeat(48),
        }),
      ),
    /RATE_LIMIT_HMAC_SECRET must be different from CONTROL_TOWER_VAULT_SECRET/,
  );
});

test("production break-glass access is optional but must use a strong independent secret", () => {
  assert.doesNotThrow(() => validateRuntimeEnvironment(makeProductionEnv()));
  assert.throws(
    () => validateRuntimeEnvironment(makeProductionEnv({ BREAK_GLASS_TOKEN: "weak" })),
    /BREAK_GLASS_TOKEN must be at least 32 characters long/,
  );
  assert.throws(
    () =>
      validateRuntimeEnvironment(
        makeProductionEnv({ BREAK_GLASS_TOKEN: "s".repeat(48) }),
      ),
    /BREAK_GLASS_TOKEN must be different from the related application secret/,
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
  assert.equal(config.sessionCookiePartitioned, false);
  assert.equal(config.sessionCookieSecure, false);
});

test("development-only flags are ignored safely in production", () => {
  assert.equal(areMockAuthRoutesEnabled(makeProductionEnv()), false);
  assert.equal(
    areMockAuthRoutesEnabled(makeProductionEnv({ ENABLE_TEST_AUTH_ROUTES: "true" })),
    false,
  );
  assert.equal(
    areMockAuthRoutesEnabled(makeProductionEnv({ ENABLE_TEST_AUTH_ROUTES: "1" })),
    false,
  );
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment(
      makeProductionEnv({
        AUTO_SEED_ON_STARTUP: "true",
        SEED_TEST_USERS: "true",
        RESET_TEST_USER_PASSWORDS: "true",
        ENABLE_TEST_AUTH_ROUTES: "true",
        EXPOSE_INVITE_TOKENS: "true",
      }),
    ),
  );
  assert.equal(
    areMockAuthRoutesEnabled({
      NODE_ENV: "development",
    }),
    true,
  );
  assert.equal(isSelfSignupEnabled(makeProductionEnv({ ALLOW_SELF_SIGNUP: "true" })), false);
  assert.equal(isSelfSignupEnabled({ NODE_ENV: "development", ALLOW_SELF_SIGNUP: "true" }), true);
  assert.equal(isSelfSignupEnabled({ NODE_ENV: "development", ALLOW_SELF_SIGNUP: "false" }), false);
});

test("the application source hard-disables database seeding in production", async () => {
  const { readFile } = await import("node:fs/promises");
  const seedSource = await readFile(new URL("../server/seed.ts", import.meta.url), "utf8");
  assert.match(seedSource, /if \(isProductionEnvironment\(\)\) \{\s*throw new Error\("Database seeding is disabled in production"\)/);
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

test("runtime validation accepts legacy SMTP environment variable names", () => {
  const env = makeProductionEnv({
    SMTP_SERVER: "smtp.mail.test",
    SMTP_USERNAME: "mailer",
    SMTP_PASSWORD: "app-password",
    DEFAULT_SENDER: "alerts@controltower.test",
  });

  assert.doesNotThrow(() => validateRuntimeEnvironment(env));

  const smtpConfig = getSmtpEnvironmentConfig(env);
  assert.equal(smtpConfig.host, "smtp.mail.test");
  assert.equal(smtpConfig.user, "mailer");
  assert.equal(smtpConfig.from, "alerts@controltower.test");
});

test("runtime validation allows partial SMTP settings and disables mail delivery instead of aborting startup", () => {
  assert.doesNotThrow(() =>
    validateRuntimeEnvironment(
      makeProductionEnv({
        SMTP_FROM: "alerts@controltower.test",
        SMTP_PORT: "587",
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
