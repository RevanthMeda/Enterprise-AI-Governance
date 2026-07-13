import { and, eq, sql } from "drizzle-orm";
import { organizationInvites } from "@shared/schema";
import { db } from "../db";
import {
  digestInviteToken,
  inviteTokenDigestSqlPattern,
} from "../invite-token";

const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 1_000;
const DEFAULT_MAX_BATCHES = 10_000;

export type InviteTokenMigrationResult = {
  scanned: number;
  migrated: number;
  batches: number;
  complete: boolean;
};

/**
 * Idempotently replaces legacy plaintext invite tokens with versioned SHA-256
 * digests. Compare-and-set updates make this safe alongside invite resends and
 * lazy request-path migration.
 */
export async function migrateLegacyInviteTokenDigests(options: {
  batchSize?: number;
  maxBatches?: number;
} = {}): Promise<InviteTokenMigrationResult> {
  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.trunc(options.batchSize ?? DEFAULT_BATCH_SIZE)),
  );
  const maxBatches = Math.max(1, Math.trunc(options.maxBatches ?? DEFAULT_MAX_BATCHES));
  let scanned = 0;
  let migrated = 0;
  let batches = 0;

  while (batches < maxBatches) {
    const candidates = await db
      .select({ id: organizationInvites.id, token: organizationInvites.token })
      .from(organizationInvites)
      .where(sql`not (${organizationInvites.token} ~ ${inviteTokenDigestSqlPattern})`)
      .limit(batchSize);

    if (candidates.length === 0) {
      return { scanned, migrated, batches, complete: true };
    }

    batches += 1;
    scanned += candidates.length;
    let migratedThisBatch = 0;

    for (const candidate of candidates) {
      const [updated] = await db
        .update(organizationInvites)
        .set({
          token: digestInviteToken(candidate.token),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(organizationInvites.id, candidate.id),
            eq(organizationInvites.token, candidate.token),
          ),
        )
        .returning({ id: organizationInvites.id });

      if (updated) {
        migrated += 1;
        migratedThisBatch += 1;
      }
    }

    if (migratedThisBatch === 0) {
      // A continuously changing legacy writer or a data conflict should stop
      // deployment instead of allowing an unbounded migration loop.
      return { scanned, migrated, batches, complete: false };
    }
  }

  return { scanned, migrated, batches, complete: false };
}
