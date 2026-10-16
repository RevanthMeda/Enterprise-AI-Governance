import test from "node:test";
import assert from "node:assert/strict";
import { getPgPoolConfig } from "../server/db-config";
import pg from "pg";

function driverParameters(connectionString: string) {
  const client = new pg.Client(getPgPoolConfig(connectionString));
  return (client as unknown as {
    connectionParameters: { ssl: unknown; host: string; database: string; application_name: string };
  }).connectionParameters;
}

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

test("verified TLS survives driver parsing of empty-host URLs and conflicting SSL parameters", async () => {
  await withEnvironment(
    { NODE_ENV: "production", DB_SSL_MODE: "verify-full", PGSSLMODE: "no-verify" },
    () => {
      for (const authority of ["db.example.test", ""]) {
        for (const query of [
          "sslmode=no-verify",
          "sslmode=disable&ssl=false",
          "sslmode=no-verify&sslmode=disable&sslaccept=accept_invalid_certs",
          "ssl%6dode=no-verify&ssl=0",
          "sslrootcert=/nonexistent/test-only-ca&sslkey=/nonexistent/test-only-key&sslcert=/nonexistent/test-only-cert",
        ]) {
          const parameters = driverParameters(
            `postgresql://test:synthetic@${authority}/app?host=db.example.test&application_name=tls-regression&${query}`,
          );
          assert.deepEqual(parameters.ssl, { rejectUnauthorized: true });
          assert.equal(parameters.host, "db.example.test");
          assert.equal(parameters.database, "app");
          assert.equal(parameters.application_name, "tls-regression");
        }
      }
    },
  );
});

test("empty-host URLs preserve their configured SSL mode without an environment override", async () => {
  await withEnvironment(
    { NODE_ENV: "production", DB_SSL_MODE: undefined, PGSSLMODE: undefined },
    () => {
      assert.equal(driverParameters("postgresql://test:synthetic@/app?host=db.example.test&sslmode=disable").ssl, false);
      assert.deepEqual(
        driverParameters("postgresql://test:synthetic@/app?host=db.example.test&sslmode=verify-full").ssl,
        { rejectUnauthorized: true },
      );
    },
  );
});

test("explicit plaintext mode is not replaced by the driver's PGSSLMODE fallback", async () => {
  await withEnvironment(
    { NODE_ENV: "production", DB_SSL_MODE: "disable", PGSSLMODE: "no-verify" },
    () => {
      assert.equal(driverParameters("postgresql://test:synthetic@db.example.test/app?sslmode=require").ssl, false);
    },
  );
});

test("empty-host URLs retain Unix socket destinations and encoded credentials", async () => {
  await withEnvironment(
    { NODE_ENV: "development", DB_SSL_MODE: "disable", PGSSLMODE: undefined },
    () => {
      const client = new pg.Client(getPgPoolConfig(
        "postgresql://test:p%40ss%3Fword@/app?host=%2Ftmp%2Ftest-pg-socket&sslmode=no-verify",
      ));
      const parameters = (client as unknown as {
        connectionParameters: { host: string; password: string; ssl: unknown };
      }).connectionParameters;
      assert.equal(parameters.host, "/tmp/test-pg-socket");
      assert.equal(parameters.password, "p@ss?word");
      assert.equal(parameters.ssl, false);
    },
  );
});

test("unparseable connection strings fail without exposing credentials", () => {
  assert.throws(
    () => getPgPoolConfig("postgresql://test:synthetic-secret@[invalid/app?sslmode=no-verify"),
    { message: "DATABASE_URL must be a valid PostgreSQL connection URL" },
  );
});

test("production plaintext requires an explicit disable override", async () => {
  await withEnvironment(
    { NODE_ENV: "production", DB_SSL_MODE: "disable", PGSSLMODE: undefined },
    () => {
      const config = getPgPoolConfig("postgresql://user:pass@private-db:5432/app");
      assert.equal(config.ssl, false);
    },
  );
});
