import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scriptUrl = new URL("./prepare-demo-day.ts", import.meta.url).href;
const tsxLoader = import.meta.resolve("tsx");
const pgUrl = import.meta.resolve("pg");
const tsconfigPath = new URL("../tsconfig.json", import.meta.url).pathname;
const confirmation = "--confirm-reset-isolated-demo";

// Stop at database initialization even for confirmed cases. No pool, query,
// truncate, seed or database connection is permitted in this test.
const inspectCommand = `
  import assert from "node:assert/strict";
  import net from "node:net";
  import { randomUUID } from "node:crypto";
  import pg from ${JSON.stringify(pgUrl)};
  net.Socket.prototype.connect = function () {
    throw new Error("NETWORK_ACCESS_FORBIDDEN");
  };
  pg.Pool = class {
    constructor() { throw new Error("DATABASE_INITIALIZATION_BLOCKED_BY_TEST"); }
  };
  process.env.SESSION_SECRET = randomUUID() + randomUUID();
  process.argv = [process.execPath, "prepare-demo-day.ts", ...JSON.parse(process.argv[1])];
  try {
    await import(${JSON.stringify(scriptUrl)});
  } catch (error) {
    console.error(error instanceof Error ? error.message : "import failed");
    process.exitCode = 1;
  }
`;

function runCommand(args: string[], nodeEnv?: string, envContents = "") {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "grid-demo-reset-confirmation-"));
  try {
    fs.writeFileSync(path.join(directory, ".env.local"), envContents);
    const result = spawnSync(process.execPath, [
      "--import", tsxLoader, "--input-type=module", "--eval", inspectCommand, JSON.stringify(args),
    ], {
      cwd: directory,
      // Do not inherit credentials, loader options or a configured database.
      env: {
        DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:1/isolated_demo",
        DB_SSL_MODE: "disable",
        TSX_TSCONFIG_PATH: tsconfigPath,
        TSX_DISABLE_CACHE: "1",
        ...(nodeEnv === undefined ? {} : { NODE_ENV: nodeEnv }),
      },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.ifError(result.error);
    assert.equal(fs.readFileSync(path.join(directory, ".env.local"), "utf8"), envContents);
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.doesNotMatch(result.stderr, /NETWORK_ACCESS_FORBIDDEN/);
    return result.stderr;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

for (const nodeEnv of [undefined, "development", "test"]) {
  test(`demo reset without confirmation rejects before database initialization (${nodeEnv ?? "unset"})`, () => {
    const stderr = runCommand([], nodeEnv);
    assert.match(stderr, /--confirm-reset-isolated-demo/);
    assert.doesNotMatch(stderr, /DATABASE_INITIALIZATION_BLOCKED_BY_TEST/);
  });
}

test("demo reset rejects production mode even with confirmation", () => {
  const stderr = runCommand([confirmation], "production");
  assert.match(stderr, /production/);
  assert.doesNotMatch(stderr, /DATABASE_INITIALIZATION_BLOCKED_BY_TEST/);
});

test("demo reset checks production mode loaded from .env.local", () => {
  const stderr = runCommand([confirmation], undefined, "NODE_ENV=production\n");
  assert.match(stderr, /production/);
  assert.doesNotMatch(stderr, /DATABASE_INITIALIZATION_BLOCKED_BY_TEST/);
});

test("demo reset does not accept a similar flag as confirmation", () => {
  const stderr = runCommand([confirmation + "=false"], "development");
  assert.match(stderr, /--confirm-reset-isolated-demo/);
  assert.doesNotMatch(stderr, /DATABASE_INITIALIZATION_BLOCKED_BY_TEST/);
});

test("explicit confirmation permits a development command to reach the guarded database boundary", () => {
  assert.match(runCommand([confirmation], "development"), /DATABASE_INITIALIZATION_BLOCKED_BY_TEST/);
});
