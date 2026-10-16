import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Use only the disposable local database already initialized by CI/the operator.
// Never run schema setup or infer credentials from a production configuration.
assert.ok(process.env.DATABASE_URL, "DATABASE_URL must name a disposable local test database");
let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error("DATABASE_URL must be a valid local PostgreSQL URL");
}
assert.ok(["postgres:", "postgresql:"].includes(databaseUrl.protocol), "PostgreSQL URL required");
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname),
  "Container smoke tests accept loopback database hosts only");
assert.ok(databaseUrl.search === "", "Query parameters must not override the local database destination");
assert.equal(process.platform, "linux", "This smoke test uses Linux Docker host networking");

const suffix = randomUUID();
const image = `aict-sidecar-test:${suffix}`;
const container = `aict-sidecar-test-${suffix}`;
const volumes = [`aict-sidecar-uploads-${suffix}`, `aict-sidecar-exports-${suffix}`];

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024, ...options,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const permissionsProbe = `
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  assert.equal(process.getuid(), 1000);
  assert.equal(process.getgid(), 1000);
  for (const file of ['/app', '/app/dist/index.cjs', '/app/package.json', '/app/node_modules']) {
    assert.throws(() => fs.accessSync(file, fs.constants.W_OK));
  }
  for (const dir of ['/app/uploads', '/app/exports']) {
    const file = dir + '/probe';
    fs.writeFileSync(file, 'non-root storage probe');
    assert.equal(fs.readFileSync(file, 'utf8'), 'non-root storage probe');
    fs.unlinkSync(file);
  }
`;

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test("shipped sidecar runs without root and retains working storage/HTTP", { timeout: 1_200_000 }, async t => {
  t.after(() => {
    // Exact random test resources only. No pruning, host data or production resources.
    spawnSync("docker", ["rm", "-f", container], { timeout: 30_000 });
    for (const volume of volumes) {
      spawnSync("docker", ["volume", "rm", volume], { timeout: 30_000 });
    }
    spawnSync("docker", ["image", "rm", image], { timeout: 30_000 });
  });

  docker(["build", "-f", "deploy/sidecar/Dockerfile", "-t", image, "."], { timeout: 900_000 });

  await t.test("default image user is explicitly non-root", () => {
    assert.equal(docker(["image", "inspect", "--format", "{{.Config.User}}", image]), "node:node");
    docker(["run", "--rm", image, "node", "-e", permissionsProbe]);
  });

  await t.test("permission regression rejects a root override", () => {
    const result = spawnSync("docker", ["run", "--rm", "--user", "0:0", image, "node", "-e", permissionsProbe],
      { encoding: "utf8", timeout: 60_000 });
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /AssertionError/);
    assert.match(result.stderr, /0 !== 1000/);
  });

  const mounts = volumes.flatMap((volume, i) => ["--mount",
    `type=volume,src=${volume},dst=/app/${i === 0 ? "uploads" : "exports"}`]);
  await t.test("fresh named volumes retain non-root write access", () => {
    docker(["run", "--rm", ...mounts, image, "node", "-e", permissionsProbe]);
  });

  await t.test("real production entrypoint serves health, readiness and client assets", { timeout: 120_000 }, async () => {
    const env = {
      ...process.env,
      PORT: String(await unusedPort()),
      SESSION_SECRET: randomUUID() + randomUUID(),
      PASSWORD_RESET_SECRET: randomUUID() + randomUUID(),
      CONTROL_TOWER_VAULT_SECRET: randomUUID() + randomUUID(),
      RATE_LIMIT_HMAC_SECRET: randomUUID() + randomUUID(),
      PUBLIC_APP_URL: "https://sidecar-smoke.invalid",
      CORS_ALLOWED_ORIGINS: "https://sidecar-smoke.invalid",
      DB_SSL_MODE: "disable",
    };
    const names = ["DATABASE_URL", "PORT", "SESSION_SECRET", "PASSWORD_RESET_SECRET",
      "CONTROL_TOWER_VAULT_SECRET", "RATE_LIMIT_HMAC_SECRET", "PUBLIC_APP_URL",
      "CORS_ALLOWED_ORIGINS", "DB_SSL_MODE"];
    docker(["run", "-d", "--name", container, "--network", "host", ...mounts,
      ...names.flatMap(name => ["--env", name]), image], { env });

    try {
      let ready = false;
      const base = `http://127.0.0.1:${env.PORT}`;
      const deadline = Date.now() + 90_000;
      while (Date.now() < deadline) {
        assert.equal(docker(["inspect", "--format", "{{.State.Running}}", container]), "true",
          "Sidecar exited before becoming ready");
        try {
          const response = await fetch(`${base}/api/ready`, { signal: AbortSignal.timeout(2000) });
          const body = await response.json();
          ready = response.ok && body.ready === true;
        } catch { /* Startup has not opened the port yet; poll within the bounded deadline. */ }
        if (ready) break;
        await delay(500);
      }
      assert.equal(ready, true, "Sidecar must pass real DB/schema/worker/storage readiness");
      const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      assert.equal(health.status, 200);
      assert.equal((await health.json()).service, "ai-control-grid");
      const client = await fetch(base, { signal: AbortSignal.timeout(5000) });
      assert.equal(client.status, 200);
      assert.match(client.headers.get("content-type"), /text\/html/);
      assert.match(await client.text(), /<html/);
      docker(["exec", container, "node", "-e", permissionsProbe]);
      const pidOne = docker(["exec", container, "cat", "/proc/1/status"]);
      assert.match(pidOne, /^Uid:\s+1000\s+1000\s+1000\s+1000$/m);
    } catch (error) {
      // These are generated CI fixtures; never print the environment or Docker inspect config.
      console.error(docker(["logs", "--tail", "50", container]));
      throw error;
    }
  });
});
