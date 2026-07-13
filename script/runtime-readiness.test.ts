import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  getEvidenceStorageReadiness,
  getReleaseIdentity,
} from "../server/runtime-readiness";

test("release identity prefers Render's immutable Git commit", () => {
  const renderCommit = "a".repeat(40);
  const fallbackCommit = "b".repeat(40);

  assert.deepEqual(
    getReleaseIdentity({
      RENDER_GIT_COMMIT: renderCommit.toUpperCase(),
      RELEASE_COMMIT_SHA: fallbackCommit,
    }),
    { commit: renderCommit },
  );
  assert.deepEqual(getReleaseIdentity({ RENDER_GIT_COMMIT: "not-a-commit" }), {
    commit: null,
  });
});

test("durable evidence readiness requires an explicit absolute mounted root attestation", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".evidence-readiness-"));
  try {
    const status = getEvidenceStorageReadiness({
      NODE_ENV: "production",
      UPLOAD_ROOT: root,
      EVIDENCE_STORAGE_DURABLE: "true",
      REQUIRE_DURABLE_EVIDENCE_STORAGE: "true",
    });

    assert.equal(status.configured, true);
    assert.equal(status.writable, true);
    assert.equal(status.durable, true);
    assert.equal(status.required, true);
    assert.equal(status.ready, true);
    assert.equal(status.code, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("strict readiness rejects unattested and known temporary evidence roots", () => {
  const root = path.join(os.tmpdir(), `aict-evidence-${Date.now()}`);
  try {
    const status = getEvidenceStorageReadiness({
      NODE_ENV: "production",
      UPLOAD_ROOT: root,
      EVIDENCE_STORAGE_DURABLE: "true",
      REQUIRE_DURABLE_EVIDENCE_STORAGE: "true",
    });

    assert.equal(status.writable, true);
    assert.equal(status.durable, false);
    assert.equal(status.ready, false);
    assert.equal(status.code, "EVIDENCE_STORAGE_NOT_DURABLE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production can surface a durability warning before strict readiness is enabled", () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".evidence-readiness-"));
  try {
    const status = getEvidenceStorageReadiness({
      NODE_ENV: "production",
      UPLOAD_ROOT: root,
      EVIDENCE_STORAGE_DURABLE: "false",
      REQUIRE_DURABLE_EVIDENCE_STORAGE: "false",
    });

    assert.equal(status.durable, false);
    assert.equal(status.ready, true);
    assert.equal(status.code, "EVIDENCE_STORAGE_NOT_DURABLE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("production workflows gate frontend publication on the exact backend release", () => {
  for (const workflowName of ["deploy.yml", "promote-production.yml"]) {
    const workflow = fs.readFileSync(
      path.join(process.cwd(), ".github", "workflows", workflowName),
      "utf8",
    );
    const triggerIndex = workflow.indexOf("Trigger Render deploy hook");
    const releaseGateIndex = workflow.indexOf("Wait for the new Render release to be ready");
    const firebaseIndex = workflow.indexOf("Deploy Firebase Hosting");

    assert.ok(triggerIndex >= 0, `${workflowName} must trigger Render`);
    assert.ok(releaseGateIndex > triggerIndex, `${workflowName} must wait after the trigger`);
    assert.ok(firebaseIndex > releaseGateIndex, `${workflowName} must gate Firebase publication`);
    assert.match(workflow, /SMOKE_EXPECTED_RELEASE_COMMIT: \$\{\{ github\.sha \}\}/);
  }
});

test("readiness fails closed when the background worker is disabled or not running", () => {
  const healthSource = fs.readFileSync(
    path.join(process.cwd(), "server", "routes", "health.ts"),
    "utf8",
  );
  const workerSource = fs.readFileSync(
    path.join(process.cwd(), "server", "services", "backgroundJobService.ts"),
    "utf8",
  );
  assert.match(healthSource, /queue\.workerHealthy/);
  assert.match(healthSource, /BACKGROUND_JOBS_NOT_READY/);
  assert.match(workerSource, /const workerRunning = this\.timer !== null/);
  assert.match(workerSource, /lastSuccessfulRunAt/);
  assert.match(workerSource, /lastFailedRunAt/);
  assert.match(workerSource, /lastSuccessAgeMs <= healthStaleAfterMs/);
});
