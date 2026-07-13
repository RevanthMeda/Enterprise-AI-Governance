import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { BackgroundJob } from "../shared/schema";
import {
  backgroundJobClientView,
  isEncryptedBackgroundJobPayload,
  protectBackgroundJobPayload,
  resolveBackgroundJobPayload,
} from "../server/services/backgroundJobPayloadSecurity";

const OPTIONS = { vaultSecret: "background-job-test-vault-secret-with-sufficient-entropy" };

test("background job payloads encrypt credentials, invite links, and event bodies at rest", () => {
  const jobId = "job-security-test";
  const plaintext = {
    destination: { kind: "organization_connector", connectorId: "connector-1" },
    token: "sentinel-bearer-token-never-store-me",
    inviteUrl: "https://app.example.test/invite/accept?token=single-use-invite-token",
    body: {
      source: "governance_event",
      email: "private-user@example.test",
    },
  };

  const stored = protectBackgroundJobPayload(jobId, plaintext, OPTIONS);
  assert.equal(isEncryptedBackgroundJobPayload(stored), true);
  const serialized = JSON.stringify(stored);
  assert.doesNotMatch(serialized, /sentinel-bearer|single-use-invite|private-user/i);
  assert.match(serialized, /governance_event/);
  assert.deepEqual(resolveBackgroundJobPayload(jobId, stored, OPTIONS), plaintext);
  assert.throws(
    () => resolveBackgroundJobPayload("different-job", stored, OPTIONS),
    /Stored credential could not be processed/,
  );
});

test("organization job views never expose payloads, results, locks, or raw provider errors", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const payload = protectBackgroundJobPayload(
    "job-client-view",
    { token: "client-visible-sentinel", body: { source: "governance_event" } },
    OPTIONS,
  );
  const job: BackgroundJob = {
    id: "job-client-view",
    type: "monitoring_webhook",
    status: "failed",
    organizationId: "org-a",
    createdBy: "user-a",
    payload,
    result: { echoedAuthorization: "client-visible-sentinel" },
    attempts: 3,
    maxAttempts: 3,
    runAt: now,
    lockedAt: now,
    lockedBy: "worker-secret-name",
    lastError: "Bearer client-visible-sentinel failed at https://secret.example.test",
    createdAt: now,
    updatedAt: now,
  };

  const view = backgroundJobClientView(job);
  const serialized = JSON.stringify(view);
  assert.equal(view.source, "governance_event");
  assert.doesNotMatch(serialized, /client-visible-sentinel|worker-secret-name|secret\.example/i);
  assert.equal("payload" in view, false);
  assert.equal("result" in view, false);
  assert.equal("lockedAt" in view, false);
  assert.equal("lockedBy" in view, false);
});

test("new webhook jobs persist only destination references before payload encryption", async () => {
  const [monitoringSource, governanceSource] = await Promise.all([
    readFile("server/services/monitoringService.ts", "utf8"),
    readFile("server/services/governanceEventService.ts", "utf8"),
  ]);
  assert.match(monitoringSource, /destination:\s*\{ kind: "monitoring_environment" \}/);
  assert.doesNotMatch(monitoringSource, /payload:\s*\{[^}]*MONITORING_WEBHOOK_TOKEN/s);
  assert.match(governanceSource, /kind: "organization_connector"/);
  assert.match(governanceSource, /kind: "governance_environment"/);
  assert.doesNotMatch(governanceSource, /payload:\s*\{[^}]*authToken/s);
});
