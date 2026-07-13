import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  SharedRateLimiter,
  hashRateLimitIdentity,
  type RateLimitBucketMutation,
  type RateLimitBucketResult,
  type RateLimitBucketStore,
} from "../server/services/sharedRateLimitCore";

class MemoryBucketStore implements RateLimitBucketStore {
  readonly buckets = new Map<string, RateLimitBucketResult>();
  cleanupCalls = 0;

  async consume(input: RateLimitBucketMutation): Promise<RateLimitBucketResult> {
    const existing = this.buckets.get(input.keyHash);
    const next = !existing || existing.expiresAt.getTime() <= input.now.getTime()
      ? { attempts: 1, expiresAt: input.expiresAt }
      : { attempts: existing.attempts + 1, expiresAt: existing.expiresAt };
    this.buckets.set(input.keyHash, next);
    return next;
  }

  async reset(keyHash: string): Promise<void> {
    this.buckets.delete(keyHash);
  }

  async cleanup(expiredBefore: Date): Promise<void> {
    this.cleanupCalls += 1;
    for (const [key, bucket] of this.buckets) {
      if (bucket.expiresAt.getTime() < expiredBefore.getTime()) this.buckets.delete(key);
    }
  }
}

test("rate-limit identities are purpose-bound HMACs and never expose raw identifiers", () => {
  const secret = "test-rate-limit-secret-that-is-long-and-private";
  const rawAddress = "203.0.113.71";
  const first = hashRateLimitIdentity({
    secret,
    namespace: "production",
    scope: "auth.login.account",
    identity: [rawAddress, "person@example.test"],
  });
  const same = hashRateLimitIdentity({
    secret,
    namespace: "production",
    scope: "auth.login.account",
    identity: [rawAddress, "person@example.test"],
  });
  const differentScope = hashRateLimitIdentity({
    secret,
    namespace: "production",
    scope: "auth.forgot_password.account",
    identity: [rawAddress, "person@example.test"],
  });

  assert.equal(first, same);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, differentScope);
  assert.doesNotMatch(first, /203\.0\.113\.71|person@example/i);
});

test("shared fixed-window decisions deny over-limit traffic, reset on expiry, and support explicit reset", async () => {
  const store = new MemoryBucketStore();
  const limiter = new SharedRateLimiter(store, "s".repeat(48), "test", 0);
  const policy = { scope: "public.lead.ip", limit: 2, windowMs: 60_000 };
  const startedAt = new Date("2026-07-13T00:00:00.000Z");

  assert.equal((await limiter.consume(policy, ["198.51.100.10"], startedAt)).allowed, true);
  assert.equal((await limiter.consume(policy, ["198.51.100.10"], startedAt)).allowed, true);
  const denied = await limiter.consume(policy, ["198.51.100.10"], startedAt);
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.equal(denied.retryAfterMs, 60_000);

  const nextWindow = await limiter.consume(
    policy,
    ["198.51.100.10"],
    new Date(startedAt.getTime() + 60_001),
  );
  assert.equal(nextWindow.allowed, true);
  assert.equal(nextWindow.remaining, 1);

  await limiter.reset(policy, ["198.51.100.10"]);
  assert.equal(store.buckets.size, 0);
});

test("expired buckets are cleaned at the configured bounded cadence", async () => {
  const store = new MemoryBucketStore();
  const limiter = new SharedRateLimiter(store, "s".repeat(48), "test", 2);
  const policy = { scope: "public.track.ip", limit: 100, windowMs: 1_000 };
  const first = new Date("2026-07-13T00:00:00.000Z");

  await limiter.consume(policy, ["first"], first);
  await limiter.consume(policy, ["second"], new Date(first.getTime() + 2_000));
  assert.equal(store.cleanupCalls, 1);
  assert.equal(store.buckets.size, 1, "Expected the first expired bucket to be removed");
});

test("public write and authentication routes use the shared limiter and the schema stores digests", () => {
  const root = process.cwd();
  const marketing = fs.readFileSync(path.join(root, "server/routes/marketing.ts"), "utf8");
  const health = fs.readFileSync(path.join(root, "server/routes/health.ts"), "utf8");
  const authRoutes = fs.readFileSync(path.join(root, "server/routes/auth.ts"), "utf8");
  const auth = fs.readFileSync(path.join(root, "server/auth.ts"), "utf8");
  const admin = fs.readFileSync(path.join(root, "server/routes/admin.ts"), "utf8");
  const schema = fs.readFileSync(path.join(root, "shared/schema.ts"), "utf8");

  for (const source of [marketing, health, authRoutes, admin]) {
    assert.match(source, /enforceSharedRateLimits/);
  }
  assert.match(auth, /sharedRateLimitService\.consume/);
  assert.doesNotMatch(auth, /loginAttemptsByIpAndAccount|BoundedTtlMap/);
  assert.match(schema, /rateLimitBuckets = pgTable\("rate_limit_buckets"/);
  assert.match(schema, /keyHash: varchar\("key_hash", \{ length: 64 \}\)\.primaryKey\(\)/);
  assert.doesNotMatch(schema, /rate_limit_buckets[\s\S]{0,500}(client_ip|email|token)/i);
});
