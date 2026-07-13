import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS,
  MIN_BACKGROUND_JOB_LEASE_TIMEOUT_MS,
  getBackgroundJobFailureTransition,
  getBackgroundJobLease,
  getBackgroundJobLeaseCutoff,
  isBackgroundJobLeaseStale,
  resolveBackgroundJobLeaseTimeoutMs,
} from "../server/services/backgroundJobState";
import { isInviteDeliverySuccessful } from "../server/services/inviteDeliveryService";

test("background job lease timeout uses a safe default and minimum", () => {
  assert.equal(resolveBackgroundJobLeaseTimeoutMs(undefined), DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS);
  assert.equal(resolveBackgroundJobLeaseTimeoutMs(""), DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS);
  assert.equal(resolveBackgroundJobLeaseTimeoutMs("not-a-number"), DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS);
  assert.equal(resolveBackgroundJobLeaseTimeoutMs("-1"), DEFAULT_BACKGROUND_JOB_LEASE_TIMEOUT_MS);
  assert.equal(resolveBackgroundJobLeaseTimeoutMs("1000"), MIN_BACKGROUND_JOB_LEASE_TIMEOUT_MS);
  assert.equal(resolveBackgroundJobLeaseTimeoutMs("90000"), 90_000);
});

test("missing and expired leases are reclaimable at the timeout boundary", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const timeoutMs = 60_000;
  const cutoff = getBackgroundJobLeaseCutoff(now, timeoutMs);

  assert.equal(cutoff.toISOString(), "2026-07-13T11:59:00.000Z");
  assert.equal(isBackgroundJobLeaseStale(null, now, timeoutMs), true);
  assert.equal(isBackgroundJobLeaseStale(new Date("2026-07-13T11:58:59.999Z"), now, timeoutMs), true);
  assert.equal(isBackgroundJobLeaseStale(cutoff, now, timeoutMs), true);
  assert.equal(isBackgroundJobLeaseStale(new Date("2026-07-13T11:59:00.001Z"), now, timeoutMs), false);
});

test("abandoned executions consume one attempt and retain retry backoff and limits", () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const originalRunAt = new Date("2026-07-13T11:00:00.000Z");

  assert.deepEqual(
    getBackgroundJobFailureTransition({ attempts: 0, maxAttempts: 3, runAt: originalRunAt }, now),
    {
      attempts: 1,
      runAt: new Date("2026-07-13T12:00:05.000Z"),
      status: "pending",
    },
  );
  assert.deepEqual(
    getBackgroundJobFailureTransition({ attempts: 1, maxAttempts: 3, runAt: originalRunAt }, now),
    {
      attempts: 2,
      runAt: new Date("2026-07-13T12:00:10.000Z"),
      status: "pending",
    },
  );
  assert.deepEqual(
    getBackgroundJobFailureTransition({ attempts: 2, maxAttempts: 3, runAt: originalRunAt }, now),
    {
      attempts: 3,
      runAt: originalRunAt,
      status: "failed",
    },
  );
});

test("state transitions require a complete lease identity", () => {
  const lockedAt = new Date("2026-07-13T12:00:00.000Z");

  assert.equal(getBackgroundJobLease({ lockedAt: null, lockedBy: "worker-a" }), null);
  assert.equal(getBackgroundJobLease({ lockedAt, lockedBy: null }), null);
  assert.deepEqual(getBackgroundJobLease({ lockedAt, lockedBy: "worker-a" }), {
    lockedAt,
    lockedBy: "worker-a",
  });
});

test("failed or undeliverable production invitations remain retryable jobs", () => {
  assert.equal(
    isInviteDeliverySuccessful(
      { status: "failed", channel: "smtp", message: "SMTP unavailable" },
      false,
    ),
    false,
  );
  assert.equal(
    isInviteDeliverySuccessful(
      { status: "preview", channel: "none", message: "No adapter configured" },
      true,
    ),
    false,
  );
  assert.equal(
    isInviteDeliverySuccessful(
      { status: "preview", channel: "none", message: "Development preview" },
      false,
    ),
    true,
  );
  assert.equal(
    isInviteDeliverySuccessful(
      { status: "webhook_sent", channel: "webhook", message: "Delivered" },
      true,
    ),
    true,
  );
});

test("the worker recovers stale leases before claiming and uses lease-guarded outcomes", async () => {
  const source = await readFile("server/services/backgroundJobService.ts", "utf8");
  const recoveryIndex = source.indexOf("await reclaimStaleBackgroundJobs(BATCH_SIZE)");
  const claimIndex = source.indexOf("await claimNextJobs(BATCH_SIZE)");
  assert.ok(recoveryIndex >= 0, "the worker must run stale lease recovery");
  assert.ok(claimIndex > recoveryIndex, "stale leases must be recovered before pending jobs are claimed");

  for (const functionName of ["markBackgroundJobSucceeded", "markBackgroundJobFailed"] as const) {
    const start = source.indexOf(`export async function ${functionName}`);
    const end = source.indexOf("\n}\n", start);
    const functionSource = source.slice(start, end);
    assert.match(functionSource, /eq\(backgroundJobs\.status, "processing"\)/);
    assert.match(functionSource, /eq\(backgroundJobs\.lockedBy, lease\.lockedBy\)/);
    assert.match(functionSource, /eq\(backgroundJobs\.lockedAt, lease\.lockedAt\)/);
  }
});
