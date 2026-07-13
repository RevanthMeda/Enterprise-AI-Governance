import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { auditLogs, organizations, users } from "../shared/schema";
import { db } from "../server/db";
import { storage } from "../server/storage";
import { auditService } from "../server/services/auditService";

test("concurrent audit writes remain a single verifiable chain", async () => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const organization = await storage.createOrganization({
    slug: `audit-chain-${suffix}`,
    name: `Audit Chain ${suffix}`,
    status: "active",
    plan: "starter",
    settings: {},
  });
  const actor = await storage.createUser({
    username: `audit_actor_${suffix}`,
    password: "not-used-in-this-test",
    fullName: "Audit Concurrency Actor",
    email: `audit-${suffix}@example.com`,
    role: "admin",
  });

  try {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        auditService.createLog({
          organizationId: organization.id,
          actor,
          input: {
            entityType: "concurrency_test",
            entityId: `event-${index}`,
            action: "created",
            performedBy: actor.fullName,
            details: `Concurrent event ${index}`,
          },
        }),
      ),
    );

    const verification = await auditService.verifyChain({ organizationId: organization.id, actor });
    assert.equal(verification.ok, true);
    assert.equal(verification.verified, true);
    assert.equal(verification.total, 20);

    const rows = await db.select().from(auditLogs).where(eq(auditLogs.organizationId, organization.id));
    assert.equal(rows.filter((row) => row.previousHash === null).length, 1, "Expected exactly one chain root");
    assert.equal(new Set(rows.map((row) => row.previousHash).filter(Boolean)).size, 19);
  } finally {
    await db.delete(auditLogs).where(eq(auditLogs.organizationId, organization.id));
    await db.delete(users).where(eq(users.id, actor.id));
    await db.delete(organizations).where(eq(organizations.id, organization.id));
  }
});
