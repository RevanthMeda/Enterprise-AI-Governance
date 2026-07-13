import test from "node:test";
import assert from "node:assert/strict";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../server/db";
import { inviteService } from "../server/services/inviteService";
import { migrateLegacyInviteTokenDigests } from "../server/services/inviteTokenMigrationService";
import { digestInviteToken, isInviteTokenDigest } from "../server/invite-token";
import { storage } from "../server/storage";
import {
  adminAuditEvents,
  memberships,
  organizationInvites,
  organizations,
  users,
} from "../shared/schema";

function makeSuffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

test("an invite can create only one account and membership under concurrent acceptance", async () => {
  const suffix = makeSuffix();
  const email = `concurrent-invite-${suffix}@example.com`;
  const token = `concurrent-invite-token-${suffix}`;
  let organizationId: string | undefined;

  try {
    const organization = await storage.createOrganization({
      slug: `concurrent-invite-${suffix}`,
      name: `Concurrent Invite ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    organizationId = organization.id;
    await db.insert(organizationInvites).values({
      organizationId: organization.id,
      email,
      role: "reviewer",
      status: "pending",
      token,
      expiresAt: new Date(Date.now() + 60_000),
    });

    const attempts = await Promise.allSettled([
      inviteService.acceptInvite({
        token,
        username: `concurrent_invite_${suffix}`,
        password: "Str0ng!Passw0rd",
        fullName: "Concurrent Invite User",
        email,
      }),
      inviteService.acceptInvite({
        token,
        username: `concurrent_invite_${suffix}`,
        password: "Str0ng!Passw0rd",
        fullName: "Concurrent Invite User",
        email,
      }),
    ]);

    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.equal((rejected.reason as { status?: number }).status, 400);

    const createdUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    assert.equal(createdUsers.length, 1);
    const createdMemberships = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organization.id),
          eq(memberships.userId, createdUsers[0].id),
        ),
      );
    assert.equal(createdMemberships.length, 1);
    const [acceptedInvite] = await db
      .select({
        status: organizationInvites.status,
        acceptedBy: organizationInvites.acceptedBy,
        token: organizationInvites.token,
      })
      .from(organizationInvites)
      .where(eq(organizationInvites.token, digestInviteToken(token)));
    assert.equal(acceptedInvite.status, "accepted");
    assert.equal(acceptedInvite.acceptedBy, createdUsers[0].id);
    assert.equal(acceptedInvite.token, digestInviteToken(token));
    assert.notEqual(acceptedInvite.token, token);
    const acceptedEvents = await db
      .select({ id: adminAuditEvents.id })
      .from(adminAuditEvents)
      .where(
        and(
          eq(adminAuditEvents.organizationId, organization.id),
          eq(adminAuditEvents.action, "invite.accepted"),
        ),
      );
    assert.equal(acceptedEvents.length, 1);
  } finally {
    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
    const remainingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = lower(${email})`);
    if (remainingUsers.length > 0) {
      await db.delete(users).where(inArray(users.id, remainingUsers.map((user) => user.id)));
    }
  }
});

test("an expired invite is durably marked expired", async () => {
  const suffix = makeSuffix();
  const token = `expired-invite-token-${suffix}`;
  let organizationId: string | undefined;

  try {
    const organization = await storage.createOrganization({
      slug: `expired-invite-${suffix}`,
      name: `Expired Invite ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    organizationId = organization.id;
    await db.insert(organizationInvites).values({
      organizationId: organization.id,
      email: `expired-invite-${suffix}@example.com`,
      role: "reviewer",
      status: "pending",
      token,
      expiresAt: new Date(Date.now() - 60_000),
    });

    await assert.rejects(
      inviteService.acceptInvite({
        token,
        username: `expired_invite_${suffix}`,
        password: "Str0ng!Passw0rd",
        fullName: "Expired Invite User",
      }),
      (error: Error & { status?: number }) => error.status === 400 && /expired/i.test(error.message),
    );

    const [expiredInvite] = await db
      .select({ status: organizationInvites.status, token: organizationInvites.token })
      .from(organizationInvites)
      .where(eq(organizationInvites.token, digestInviteToken(token)));
    assert.equal(expiredInvite.status, "expired");
    assert.equal(expiredInvite.token, digestInviteToken(token));
  } finally {
    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
  }
});

test("invite preview lazily migrates a legacy token without making the digest a bearer secret", async () => {
  const suffix = makeSuffix();
  const token = `legacy-preview-invite-token-${suffix}`;
  let organizationId: string | undefined;

  try {
    const organization = await storage.createOrganization({
      slug: `legacy-preview-invite-${suffix}`,
      name: `Legacy Preview Invite ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    organizationId = organization.id;
    const [created] = await db
      .insert(organizationInvites)
      .values({
        organizationId: organization.id,
        email: `legacy-preview-${suffix}@example.com`,
        role: "reviewer",
        status: "pending",
        token,
        expiresAt: new Date(Date.now() + 60_000),
      })
      .returning({ id: organizationInvites.id });

    const preview = await inviteService.previewInvite(token);
    assert.equal(preview.id, created.id);

    const [migrated] = await db
      .select({ token: organizationInvites.token })
      .from(organizationInvites)
      .where(eq(organizationInvites.id, created.id));
    assert.equal(migrated.token, digestInviteToken(token));

    await assert.rejects(
      inviteService.previewInvite(migrated.token),
      (error: Error & { status?: number }) => error.status === 404,
    );
    assert.equal((await inviteService.previewInvite(token)).id, created.id);
  } finally {
    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
  }
});

test("the deployment migration digests legacy tokens in every invite state", async () => {
  const suffix = makeSuffix();
  const tokens = [`legacy-pending-${suffix}`, `legacy-revoked-${suffix}`];
  let organizationId: string | undefined;

  try {
    const organization = await storage.createOrganization({
      slug: `legacy-migration-${suffix}`,
      name: `Legacy Migration ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    organizationId = organization.id;
    await db.insert(organizationInvites).values([
      {
        organizationId: organization.id,
        email: `legacy-pending-${suffix}@example.com`,
        role: "reviewer",
        status: "pending",
        token: tokens[0],
        expiresAt: new Date(Date.now() + 60_000),
      },
      {
        organizationId: organization.id,
        email: `legacy-revoked-${suffix}@example.com`,
        role: "reviewer",
        status: "revoked",
        token: tokens[1],
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
      },
    ]);

    const result = await migrateLegacyInviteTokenDigests({ batchSize: 1 });
    assert.equal(result.complete, true);

    const migrated = await db
      .select({ token: organizationInvites.token })
      .from(organizationInvites)
      .where(eq(organizationInvites.organizationId, organization.id));
    assert.equal(migrated.length, 2);
    assert.equal(migrated.every((row) => isInviteTokenDigest(row.token)), true);
    assert.deepEqual(
      new Set(migrated.map((row) => row.token)),
      new Set(tokens.map(digestInviteToken)),
    );
  } finally {
    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
  }
});

test("new and resent invitations persist only digests", async () => {
  const suffix = makeSuffix();
  const email = `new-digest-invite-${suffix}@example.com`;
  let organizationId: string | undefined;
  let actorUserId: string | undefined;

  try {
    const organization = await storage.createOrganization({
      slug: `new-digest-invite-${suffix}`,
      name: `New Digest Invite ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    organizationId = organization.id;
    const actor = await storage.createUser({
      username: `invite_actor_${suffix}`,
      password: "not-used-by-this-test",
      fullName: "Invite Actor",
      email: `invite-actor-${suffix}@example.com`,
      role: "admin",
    });
    actorUserId = actor.id;

    const created = (await inviteService.createInvite({
      organizationId: organization.id,
      actorUserId: actor.id,
      actorName: actor.fullName,
      email,
      role: "reviewer",
      expiresInDays: 7,
    })) as { id: string; inviteToken?: string };

    const [storedAfterCreate] = await db
      .select({ token: organizationInvites.token })
      .from(organizationInvites)
      .where(eq(organizationInvites.id, created.id));
    assert.equal(isInviteTokenDigest(storedAfterCreate.token), true);
    if (created.inviteToken) {
      assert.equal(storedAfterCreate.token, digestInviteToken(created.inviteToken));
      assert.notEqual(storedAfterCreate.token, created.inviteToken);
    }

    const resent = (await inviteService.resendInvite({
      organizationId: organization.id,
      actorUserId: actor.id,
      actorName: actor.fullName,
      inviteId: created.id,
    })) as { inviteToken?: string };
    const [storedAfterResend] = await db
      .select({ token: organizationInvites.token })
      .from(organizationInvites)
      .where(eq(organizationInvites.id, created.id));
    assert.equal(isInviteTokenDigest(storedAfterResend.token), true);
    assert.notEqual(storedAfterResend.token, storedAfterCreate.token);
    if (resent.inviteToken) {
      assert.equal(storedAfterResend.token, digestInviteToken(resent.inviteToken));
      assert.notEqual(storedAfterResend.token, resent.inviteToken);
    }
  } finally {
    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
    if (actorUserId) {
      await db.delete(users).where(eq(users.id, actorUserId));
    }
  }
});
