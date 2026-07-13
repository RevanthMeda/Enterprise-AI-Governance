import test from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import {
  markBackgroundJobFailed,
  markBackgroundJobSucceeded,
  reclaimStaleBackgroundJobs,
} from "../server/services/backgroundJobService";
import { backgroundJobs } from "../shared/schema";

test("stale processing leases are retried once and stop at maxAttempts", async () => {
  const now = new Date("2026-07-13T12:00:00.000Z");
  const leaseTimeoutMs = 60_000;
  const originalRunAt = new Date("2026-07-13T11:00:00.000Z");
  const createdIds: string[] = [];

  try {
    const created = await db
      .insert(backgroundJobs)
      .values([
        {
          type: "monitoring_webhook",
          status: "processing",
          payload: {},
          result: {},
          attempts: 0,
          maxAttempts: 3,
          runAt: originalRunAt,
          lockedAt: new Date(now.getTime() - leaseTimeoutMs),
          lockedBy: "stale-worker",
          updatedAt: originalRunAt,
        },
        {
          type: "monitoring_webhook",
          status: "processing",
          payload: {},
          result: {},
          attempts: 2,
          maxAttempts: 3,
          runAt: originalRunAt,
          lockedAt: new Date(now.getTime() - leaseTimeoutMs - 1),
          lockedBy: "exhausted-worker",
          updatedAt: originalRunAt,
        },
        {
          type: "monitoring_webhook",
          status: "processing",
          payload: {},
          result: {},
          attempts: 0,
          maxAttempts: 3,
          runAt: originalRunAt,
          lockedAt: null,
          lockedBy: null,
          updatedAt: originalRunAt,
        },
        {
          type: "monitoring_webhook",
          status: "processing",
          payload: {},
          result: {},
          attempts: 0,
          maxAttempts: 3,
          runAt: originalRunAt,
          lockedAt: new Date(now.getTime() - leaseTimeoutMs + 1),
          lockedBy: "fresh-worker",
          updatedAt: originalRunAt,
        },
      ])
      .returning();
    createdIds.push(...created.map((job) => job.id));

    const recovery = await reclaimStaleBackgroundJobs(10, { leaseTimeoutMs, now });
    assert.deepEqual(recovery, { failed: 1, requeued: 2 });

    const rows = await db.select().from(backgroundJobs).where(inArray(backgroundJobs.id, createdIds));
    const pendingRows = rows.filter((job) => job.status === "pending");
    assert.equal(pendingRows.length, 2);
    for (const pending of pendingRows) {
      assert.equal(pending.attempts, 1);
      assert.equal(pending.runAt.getTime(), now.getTime() + 5_000);
      assert.equal(pending.lockedAt, null);
      assert.equal(pending.lockedBy, null);
      assert.equal(pending.lastError, `Processing lease expired after ${leaseTimeoutMs}ms`);
    }

    const terminal = rows.find((job) => job.status === "failed");
    assert.ok(terminal);
    assert.equal(terminal.attempts, 3);
    assert.equal(terminal.runAt.getTime(), originalRunAt.getTime());
    assert.equal(terminal.lockedAt, null);
    assert.equal(terminal.lockedBy, null);

    const fresh = rows.find((job) => job.lockedBy === "fresh-worker");
    assert.ok(fresh);
    assert.equal(fresh.status, "processing");
    assert.equal(fresh.attempts, 0);
  } finally {
    if (createdIds.length > 0) {
      await db.delete(backgroundJobs).where(inArray(backgroundJobs.id, createdIds));
    }
  }
});

test("only the worker holding the exact lease can complete a processing job", async () => {
  const originalLeaseAt = new Date("2026-07-13T12:00:00.000Z");
  const replacementLeaseAt = new Date("2026-07-13T12:05:00.000Z");
  let jobId: string | undefined;

  try {
    const [originalClaim] = await db
      .insert(backgroundJobs)
      .values({
        type: "monitoring_webhook",
        status: "processing",
        payload: {},
        result: {},
        attempts: 0,
        maxAttempts: 3,
        runAt: originalLeaseAt,
        lockedAt: originalLeaseAt,
        lockedBy: "worker-a",
        updatedAt: originalLeaseAt,
      })
      .returning();
    jobId = originalClaim.id;

    const [replacementClaim] = await db
      .update(backgroundJobs)
      .set({
        lockedAt: replacementLeaseAt,
        lockedBy: "worker-b",
        updatedAt: replacementLeaseAt,
      })
      .where(eq(backgroundJobs.id, originalClaim.id))
      .returning();

    assert.equal(await markBackgroundJobSucceeded(originalClaim, { delivered: true }), false);
    assert.equal(await markBackgroundJobFailed(originalClaim, new Error("stale failure"), replacementLeaseAt), false);
    assert.equal(
      await markBackgroundJobSucceeded(
        { ...replacementClaim, lockedAt: originalLeaseAt },
        { delivered: true },
      ),
      false,
      "the same worker identity must not complete an older lease",
    );

    const [stillProcessing] = await db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, originalClaim.id));
    assert.equal(stillProcessing.status, "processing");
    assert.equal(stillProcessing.lockedBy, "worker-b");
    assert.equal(stillProcessing.lockedAt?.getTime(), replacementLeaseAt.getTime());
    assert.equal(stillProcessing.attempts, 0);

    assert.equal(await markBackgroundJobSucceeded(replacementClaim, { delivered: true }), true);
    const [succeeded] = await db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, originalClaim.id));
    assert.equal(succeeded.status, "succeeded");
    assert.deepEqual(succeeded.result, { delivered: true });
    assert.equal(succeeded.lockedAt, null);
    assert.equal(succeeded.lockedBy, null);
  } finally {
    if (jobId) {
      await db.delete(backgroundJobs).where(eq(backgroundJobs.id, jobId));
    }
  }
});

test("an exact-lease failure increments once and becomes terminal at maxAttempts", async () => {
  const claimedAt = new Date("2026-07-13T12:00:00.000Z");
  const failedAt = new Date("2026-07-13T12:00:10.000Z");
  let jobId: string | undefined;

  try {
    const [claim] = await db
      .insert(backgroundJobs)
      .values({
        type: "monitoring_webhook",
        status: "processing",
        payload: {},
        result: {},
        attempts: 2,
        maxAttempts: 3,
        runAt: claimedAt,
        lockedAt: claimedAt,
        lockedBy: "terminal-worker",
        updatedAt: claimedAt,
      })
      .returning();
    jobId = claim.id;

    assert.equal(await markBackgroundJobFailed(claim, new Error("terminal failure"), failedAt), true);
    assert.equal(await markBackgroundJobFailed(claim, new Error("duplicate failure"), failedAt), false);

    const [failed] = await db.select().from(backgroundJobs).where(eq(backgroundJobs.id, claim.id));
    assert.equal(failed.status, "failed");
    assert.equal(failed.attempts, 3);
    assert.equal(failed.runAt.getTime(), claimedAt.getTime());
    assert.equal(failed.lastError, "terminal failure");
    assert.equal(failed.lockedAt, null);
    assert.equal(failed.lockedBy, null);
  } finally {
    if (jobId) {
      await db.delete(backgroundJobs).where(eq(backgroundJobs.id, jobId));
    }
  }
});
