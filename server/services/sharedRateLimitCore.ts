import { createHmac } from "crypto";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitBucketMutation {
  keyHash: string;
  scope: string;
  now: Date;
  expiresAt: Date;
}

export interface RateLimitBucketResult {
  attempts: number;
  expiresAt: Date;
}

export interface RateLimitBucketStore {
  consume(input: RateLimitBucketMutation): Promise<RateLimitBucketResult>;
  reset(keyHash: string): Promise<void>;
  cleanup(expiredBefore: Date): Promise<void>;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterMs: number;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;

function assertPolicy(policy: RateLimitPolicy): void {
  if (!policy.scope.trim() || policy.scope.length > 120) {
    throw new Error("Rate-limit scope must contain between 1 and 120 characters");
  }
  if (!Number.isSafeInteger(policy.limit) || policy.limit < 1) {
    throw new Error("Rate-limit attempt count must be a positive integer");
  }
  if (!Number.isSafeInteger(policy.windowMs) || policy.windowMs < 1_000) {
    throw new Error("Rate-limit window must be at least one second");
  }
}

/**
 * Produces a purpose-bound, non-reversible database key. JSON serialization
 * avoids delimiter-collision bugs when a policy uses more than one identity
 * component (for example, client address plus account identifier).
 */
export function hashRateLimitIdentity(input: {
  secret: string;
  namespace: string;
  scope: string;
  identity: readonly string[];
}): string {
  if (!input.secret) {
    throw new Error("A rate-limit HMAC secret is required");
  }
  const serialized = JSON.stringify({
    version: 1,
    namespace: input.namespace,
    scope: input.scope,
    identity: input.identity,
  });
  return createHmac("sha256", input.secret).update(serialized).digest("hex");
}

export class SharedRateLimiter {
  private consumeCount = 0;

  constructor(
    private readonly store: RateLimitBucketStore,
    private readonly secret: string,
    private readonly namespace: string,
    private readonly cleanupEvery = 256,
  ) {}

  private keyHash(policy: RateLimitPolicy, identity: readonly string[]): string {
    assertPolicy(policy);
    return hashRateLimitIdentity({
      secret: this.secret,
      namespace: this.namespace,
      scope: policy.scope,
      identity,
    });
  }

  async consume(
    policy: RateLimitPolicy,
    identity: readonly string[],
    now = new Date(),
  ): Promise<RateLimitDecision> {
    const keyHash = this.keyHash(policy, identity);
    if (!HASH_PATTERN.test(keyHash)) {
      throw new Error("Rate-limit key hashing failed");
    }

    const bucket = await this.store.consume({
      keyHash,
      scope: policy.scope,
      now,
      expiresAt: new Date(now.getTime() + policy.windowMs),
    });

    this.consumeCount += 1;
    if (this.cleanupEvery > 0 && this.consumeCount % this.cleanupEvery === 0) {
      // Cleanup is deliberately awaited: failures are visible to callers and
      // cannot grow the protection table without bound unnoticed.
      await this.store.cleanup(now);
    }

    return {
      allowed: bucket.attempts <= policy.limit,
      limit: policy.limit,
      remaining: Math.max(0, policy.limit - bucket.attempts),
      retryAfterMs: Math.max(1_000, bucket.expiresAt.getTime() - now.getTime()),
    };
  }

  async reset(policy: RateLimitPolicy, identity: readonly string[]): Promise<void> {
    await this.store.reset(this.keyHash(policy, identity));
  }
}
