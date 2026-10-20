import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const configUrl = new URL("../drizzle.config.ts", import.meta.url).href;
const tsxLoader = import.meta.resolve("tsx");
const baseUrl = "postgresql://fixture:fixture@127.0.0.1:1/base";
const localUrl = "postgresql://fixture:fixture@127.0.0.1:1/local";
const shellUrl = "postgresql://fixture:fixture@127.0.0.1:1/shell";

// Import the real config in a fresh process: dotenv/module memoization must not
// leak between cases. Do not invoke drizzle-kit push or contact any database.
const inspectConfig = `
  import assert from "node:assert/strict";
  import net from "node:net";
  let connections = 0;
  net.Socket.prototype.connect = function () {
    connections++;
    throw new Error("Database/network access is forbidden in config tests");
  };
  const { default: config } = await import(process.argv[1]);
  assert.equal(connections, 0);
  assert.equal(config.dialect, "postgresql");
  assert.equal(config.schema, "./shared/schema.ts");
  assert.equal(config.out, "./migrations");
  console.log(JSON.stringify(config.dbCredentials));
`;

function readConfig(
  files: Record<string, string>,
  shell: Record<string, string> = {},
) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "grid-drizzle-env-"));
  try {
    for (const [name, contents] of Object.entries(files)) {
      fs.writeFileSync(path.join(directory, name), contents);
    }
    return spawnSync(process.execPath, [
      "--import", tsxLoader, "--input-type=module", "--eval", inspectConfig, configUrl,
    ], {
      cwd: directory,
      // Deliberately do not inherit credentials, NODE_OPTIONS or dotenv options.
      env: { NODE_ENV: "test", ...shell },
      encoding: "utf8",
      timeout: 10_000,
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function credentials(result: ReturnType<typeof readConfig>) {
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim());
}

test("Drizzle loads a DATABASE_URL configured only in .env.local", () => {
  assert.deepEqual(credentials(readConfig({
    ".env.local": `DATABASE_URL=${localUrl}\nDB_SSL_MODE=verify-full\n`,
  })), { url: localUrl, ssl: { rejectUnauthorized: true } });
});

test("Drizzle lets .env.local override .env database and TLS settings", () => {
  assert.deepEqual(credentials(readConfig({
    ".env": `DATABASE_URL=${baseUrl}\nDB_SSL_MODE=no-verify\n`,
    ".env.local": `DATABASE_URL=${localUrl}\nDB_SSL_MODE=verify-full\n`,
  })), { url: localUrl, ssl: { rejectUnauthorized: true } });
});

test("Drizzle preserves shell database and TLS settings over both env files", () => {
  assert.deepEqual(credentials(readConfig({
    ".env": `DATABASE_URL=${baseUrl}\nDB_SSL_MODE=no-verify\n`,
    ".env.local": `DATABASE_URL=${localUrl}\nDB_SSL_MODE=no-verify\n`,
  }, { DATABASE_URL: shellUrl, DB_SSL_MODE: "verify-full" })), {
    url: shellUrl, ssl: { rejectUnauthorized: true },
  });
});

test("Drizzle remains compatible with a database configured only in .env", () => {
  assert.deepEqual(credentials(readConfig({
    ".env": `DATABASE_URL=${baseUrl}\nDB_SSL_MODE=verify-full\n`,
  })), { url: baseUrl, ssl: { rejectUnauthorized: true } });
});

test("Drizzle still rejects a missing DATABASE_URL before any connection", () => {
  const result = readConfig({});
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL, ensure the database is provisioned/);
  assert.doesNotMatch(result.stderr, /Database\/network access is forbidden/);
});
