import "../server/load-env";
import { migrateLegacyInviteTokenDigests } from "../server/services/inviteTokenMigrationService";

async function main() {
  const result = await migrateLegacyInviteTokenDigests();
  if (!result.complete) {
    throw new Error(
      `Invite-token migration stopped before completion after ${result.batches} batches`,
    );
  }

  // Counts are safe operational data. Never print token values or digests.
  console.log(
    `Invite-token migration complete: ${result.migrated} row(s) protected across ${result.batches} batch(es).`,
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    const errorCode =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: unknown }).code ?? "unknown")
        : "unknown";
    console.error(`Invite-token migration failed (code: ${errorCode}).`);
    process.exit(1);
  },
);
