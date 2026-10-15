import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type VercelConfig = Record<string, unknown> & {
  crons?: Array<{ path?: string; schedule?: string }>;
  git?: { deploymentEnabled?: boolean | Record<string, boolean> };
};

async function loadConfig(path: string): Promise<VercelConfig> {
  return JSON.parse(await readFile(path, "utf8")) as VercelConfig;
}

for (const path of ["vercel.json", "vercel.production.json"]) {
  test(`${path} disables Git deployments from main while preserving branch previews`, async () => {
    const config = await loadConfig(path);

    // Vercel enables unspecified branches by default. An exact main-only deny
    // also prevents a wildcard allow rule from overriding the production gate.
    assert.deepEqual(config.git?.deploymentEnabled, { main: false });
  });
}

test("default Vercel config stays cron-free for portable preview deployments", async () => {
  const config = await loadConfig("vercel.json");

  assert.equal(
    Object.prototype.hasOwnProperty.call(config, "crons"),
    false,
    "vercel.json must not register production-frequency cron jobs",
  );
});

test("production Vercel config preserves required job schedules", async () => {
  const config = await loadConfig("vercel.production.json");

  assert.deepEqual(config.crons, [
    {
      path: "/api/cron/background-jobs",
      schedule: "*/5 * * * *",
    },
    {
      path: "/api/cron/retention",
      schedule: "*/15 * * * *",
    },
  ]);
});

test("portable and production Vercel configs differ only by cron registration", async () => {
  const portable = await loadConfig("vercel.json");
  const production = await loadConfig("vercel.production.json");

  const { crons: _portableCrons, ...portableBase } = portable;
  const { crons: _productionCrons, ...productionBase } = production;

  assert.deepEqual(productionBase, portableBase);
});
