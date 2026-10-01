import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function read(path: string) {
  return readFile(path, "utf8");
}

test("repository runtime baseline is Node.js 24", async () => {
  const pkg = JSON.parse(await read("package.json")) as { engines?: { node?: string } };
  assert.equal(pkg.engines?.node, "24.x");
  assert.equal((await read(".nvmrc")).trim(), "24");
});

test("Vercel configs rely on the supported package engine for Node.js version selection", async () => {
  for (const path of ["vercel.json", "vercel.production.json"]) {
    const config = JSON.parse(await read(path)) as {
      functions?: Record<string, { runtime?: string; maxDuration?: number }>;
    };
    const fn = config.functions?.["api/[...route].ts"];
    assert.ok(fn, path);
    assert.equal(fn.runtime, undefined, `${path} should not declare a community runtime`);
    assert.equal(fn.maxDuration, 30, path);
  }
});

test("CI and sidecar runtime pins do not regress to Node.js 20", async () => {
  const workflowPaths = [
    ".github/workflows/deploy.yml",
    ".github/workflows/promote-production.yml",
    ".github/workflows/regression-safeguards.yml",
    ".github/workflows/security.yml",
  ];

  for (const path of workflowPaths) {
    const content = await read(path);
    assert.match(content, /node-version:\s*24/);
    assert.doesNotMatch(content, /node-version:\s*20/);
  }

  const dockerfile = await read("deploy/sidecar/Dockerfile");
  assert.match(dockerfile, /FROM node:24-alpine/);
  assert.doesNotMatch(dockerfile, /FROM node:20-alpine/);
});
