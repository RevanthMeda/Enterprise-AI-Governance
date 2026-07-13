import test from "node:test";
import assert from "node:assert/strict";
import { getPgPoolConfig } from "../server/db-config";

async function withEnvironment(
  values: Record<string, string | undefined>,
  run: () => void | Promise<void>,
) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production database connections default to verified TLS", async () => {
  await withEnvironment(
    { NODE_ENV: "production", DB_SSL_MODE: undefined, PGSSLMODE: undefined },
    () => {
      const config = getPgPoolConfig("postgresql://user:pass@db.example.com:5432/app");
      assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    },
  );
});

test("development database connections remain compatible with local plaintext Postgres", async () => {
  await withEnvironment(
    { NODE_ENV: "development", DB_SSL_MODE: undefined, PGSSLMODE: undefined },
    () => {
      const config = getPgPoolConfig("postgresql://postgres:postgres@localhost:5432/app");
      assert.equal(config.ssl, undefined);
    },
  );
});

test("production plaintext requires an explicit disable override", async () => {
  await withEnvironment(
    { NODE_ENV: "production", DB_SSL_MODE: "disable", PGSSLMODE: undefined },
    () => {
      const config = getPgPoolConfig("postgresql://user:pass@private-db:5432/app");
      assert.equal(config.ssl, undefined);
    },
  );
});
