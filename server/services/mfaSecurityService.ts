import { eq, sql } from "drizzle-orm";
import { users } from "@shared/schema";
import { db } from "../db";
import { nextMfaFailureState } from "./mfaSecurityState";

export type MfaAttemptState = {
  allowed: boolean;
  failedAttempts: number;
  lockedUntil: Date | null;
};

class MfaSecurityService {
  async getAttemptState(userId: string, now = new Date()): Promise<MfaAttemptState> {
    const [user] = await db
      .select({
        failedAttempts: users.mfaFailedAttempts,
        lockedUntil: users.mfaLockedUntil,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const lockedUntil = user?.lockedUntil ?? null;
    return {
      allowed: !lockedUntil || lockedUntil.getTime() <= now.getTime(),
      failedAttempts: user?.failedAttempts ?? 0,
      lockedUntil,
    };
  }

  async recordFailure(userId: string, now = new Date()): Promise<MfaAttemptState> {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`mfa-attempt:${userId}`}, 0))`,
      );
      const [current] = await tx
        .select({
          failedAttempts: users.mfaFailedAttempts,
          windowStartedAt: users.mfaFailureWindowStartedAt,
          lockedUntil: users.mfaLockedUntil,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!current) return { allowed: false, failedAttempts: 0, lockedUntil: null };

      const next = nextMfaFailureState(current, now);
      await tx
        .update(users)
        .set({
          mfaFailedAttempts: next.failedAttempts,
          mfaFailureWindowStartedAt: next.windowStartedAt,
          mfaLockedUntil: next.lockedUntil,
        })
        .where(eq(users.id, userId));
      return {
        allowed: !next.lockedUntil || next.lockedUntil.getTime() <= now.getTime(),
        failedAttempts: next.failedAttempts,
        lockedUntil: next.lockedUntil,
      };
    });
  }

  async clearFailures(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`mfa-attempt:${userId}`}, 0))`,
      );
      await tx
        .update(users)
        .set({
          mfaFailedAttempts: 0,
          mfaFailureWindowStartedAt: null,
          mfaLockedUntil: null,
        })
        .where(eq(users.id, userId));
    });
  }
}

export const mfaSecurityService = new MfaSecurityService();
