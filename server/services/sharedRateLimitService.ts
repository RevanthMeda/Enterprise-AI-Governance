import { eq, lt, sql } from "drizzle-orm";
import { rateLimitBuckets } from "@shared/schema";
import { db } from "../db";
import {
  SharedRateLimiter,
  type RateLimitBucketMutation,
  type RateLimitBucketResult,
  type RateLimitBucketStore,
} from "./sharedRateLimitCore";

class PostgresRateLimitBucketStore implements RateLimitBucketStore {
  async consume(input: RateLimitBucketMutation): Promise<RateLimitBucketResult> {
    const [bucket] = await db
      .insert(rateLimitBuckets)
      .values({
        keyHash: input.keyHash,
        scope: input.scope,
        attempts: 1,
        windowStartedAt: input.now,
        expiresAt: input.expiresAt,
        updatedAt: input.now,
      })
      .onConflictDoUpdate({
        target: rateLimitBuckets.keyHash,
        set: {
          scope: input.scope,
          attempts: sql<number>`case
            when ${rateLimitBuckets.expiresAt} <= ${input.now} then 1
            else ${rateLimitBuckets.attempts} + 1
          end`,
          windowStartedAt: sql<Date>`case
            when ${rateLimitBuckets.expiresAt} <= ${input.now} then ${input.now}
            else ${rateLimitBuckets.windowStartedAt}
          end`,
          expiresAt: sql<Date>`case
            when ${rateLimitBuckets.expiresAt} <= ${input.now} then ${input.expiresAt}
            else ${rateLimitBuckets.expiresAt}
          end`,
          updatedAt: input.now,
        },
      })
      .returning({
        attempts: rateLimitBuckets.attempts,
        expiresAt: rateLimitBuckets.expiresAt,
      });

    if (!bucket) {
      throw new Error("Rate-limit bucket update returned no row");
    }
    return bucket;
  }

  async reset(keyHash: string): Promise<void> {
    await db.delete(rateLimitBuckets).where(eq(rateLimitBuckets.keyHash, keyHash));
  }

  async cleanup(expiredBefore: Date): Promise<void> {
    await db.delete(rateLimitBuckets).where(lt(rateLimitBuckets.expiresAt, expiredBefore));
  }
}

function resolveRateLimitSecret(): string {
  const secret =
    process.env.RATE_LIMIT_HMAC_SECRET?.trim() ||
    process.env.CONTROL_TOWER_VAULT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("RATE_LIMIT_HMAC_SECRET, CONTROL_TOWER_VAULT_SECRET, or SESSION_SECRET must be set");
  }
  return secret;
}

function resolveRateLimitNamespace(): string {
  const configured = process.env.RATE_LIMIT_NAMESPACE?.trim();
  if (configured) return configured;

  // Production processes must share stable digests. Non-production processes
  // use a per-process namespace so old development/test counters cannot make a
  // later local run appear rate-limited.
  return process.env.NODE_ENV === "production" ? "production" : `nonproduction:${process.pid}`;
}

export const sharedRateLimitService = new SharedRateLimiter(
  new PostgresRateLimitBucketStore(),
  resolveRateLimitSecret(),
  resolveRateLimitNamespace(),
);
