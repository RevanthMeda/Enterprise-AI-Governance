import { and, desc, eq, or, sql } from "drizzle-orm";
import { membershipRoles, organizationInviteStatuses, organizationInvites, organizations, users } from "@shared/schema";
import { hashPassword, validatePasswordStrength } from "../auth";
import { adminAuditEvents, memberships } from "@shared/schema";
import { db } from "../db";
import {
  createInviteToken,
  getInviteTokenLookupValues,
} from "../invite-token";
import { backgroundJobService } from "./backgroundJobService";
import { buildInviteAcceptUrl, getInviteDeliveryChannel, shouldExposeInviteSecrets } from "./inviteDeliveryService";

const inviteStatusOptions = new Set<string>(organizationInviteStatuses);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getInviteTokenPredicate(rawToken: string) {
  const lookup = getInviteTokenLookupValues(rawToken);
  return {
    ...lookup,
    predicate: lookup.legacyToken
      ? or(
          eq(organizationInvites.token, lookup.tokenDigest),
          eq(organizationInvites.token, lookup.legacyToken),
        )
      : eq(organizationInvites.token, lookup.tokenDigest),
  };
}

async function recordAdminAuditEvent(input: {
  organizationId: string;
  actorUserId?: string | null;
  actorName: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditEvents).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetUserId: input.targetUserId ?? null,
    metadata: input.metadata ?? {},
  });
}

async function listInvites(organizationId: string) {
  const rows = await db
    .select({
      id: organizationInvites.id,
      email: organizationInvites.email,
      role: organizationInvites.role,
      status: organizationInvites.status,
      invitedBy: organizationInvites.invitedBy,
      invitedByName: users.fullName,
      expiresAt: organizationInvites.expiresAt,
      acceptedAt: organizationInvites.acceptedAt,
      revokedAt: organizationInvites.revokedAt,
      resendCount: organizationInvites.resendCount,
      createdAt: organizationInvites.createdAt,
      updatedAt: organizationInvites.updatedAt,
    })
    .from(organizationInvites)
    .leftJoin(users, eq(organizationInvites.invitedBy, users.id))
    .where(eq(organizationInvites.organizationId, organizationId))
    .orderBy(desc(organizationInvites.createdAt));

  const now = Date.now();
  return rows.map((row) => ({
    ...row,
    status: row.status === "pending" && row.expiresAt && row.expiresAt.getTime() < now ? "expired" : row.status,
  }));
}

async function createInvite(input: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  email: string;
  role: string;
  expiresInDays: number;
}) {
  const email = normalizeEmail(input.email);
  const { rawToken: inviteToken, tokenDigest } = createInviteToken();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const existingMembershipForEmail = await db
    .select({ id: memberships.id })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        sql`lower(${users.email}) = lower(${email})`,
        eq(memberships.organizationId, input.organizationId),
        eq(memberships.membershipState, "active"),
      ),
    )
    .limit(1);

  if (existingMembershipForEmail.length > 0) {
    throw Object.assign(new Error("A member with this email already exists in the organization"), { status: 409 });
  }

  const [invite] = await db
    .insert(organizationInvites)
    .values({
      organizationId: input.organizationId,
      email,
      role: input.role,
      status: "pending",
      token: tokenDigest,
      invitedBy: input.actorUserId,
      expiresAt,
    })
    .returning();

  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  const inviteUrl = buildInviteAcceptUrl(inviteToken);
  const deliveryChannel = getInviteDeliveryChannel();
  const queuedJob =
    deliveryChannel === "none"
      ? null
      : await backgroundJobService.enqueue({
          type: "invite_delivery",
          organizationId: input.organizationId,
          createdBy: input.actorUserId,
          payload: {
            email: invite.email,
            organizationName: organization?.name || "AI CONTROL GRID organization",
            role: invite.role,
            inviteUrl,
            expiresAt: invite.expiresAt.toISOString(),
            invitedByName: input.actorName,
            mode: "created",
          },
        });

  const delivery = queuedJob
    ? {
        status: "queued" as const,
        channel: deliveryChannel,
        message: `Invite queued for ${deliveryChannel} delivery`,
        jobId: queuedJob.id,
      }
    : {
        status: "preview" as const,
        channel: "none" as const,
        message: "No invite delivery adapter configured",
      };

  await recordAdminAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    action: "invite.created",
    targetType: "invite",
    targetId: invite.id,
    metadata: {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      deliveryStatus: delivery.status,
      deliveryChannel: delivery.channel,
    },
  });

  const response: Record<string, unknown> = {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    expiresAt: invite.expiresAt,
    delivery,
  };

  if (shouldExposeInviteSecrets()) {
    response.inviteToken = inviteToken;
    response.inviteUrl = inviteUrl;
  }

  return response;
}

async function resendInvite(input: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  inviteId: string;
}) {
  const [invite] = await db
    .select()
    .from(organizationInvites)
    .where(and(eq(organizationInvites.id, input.inviteId), eq(organizationInvites.organizationId, input.organizationId)))
    .limit(1);

  if (!invite) {
    throw Object.assign(new Error("Invite not found"), { status: 404 });
  }
  if (invite.status === "accepted" || invite.status === "revoked") {
    throw Object.assign(new Error("Invite can no longer be resent"), { status: 400 });
  }

  const { rawToken: inviteToken, tokenDigest } = createInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(organizationInvites)
    .set({
      token: tokenDigest,
      status: "pending",
      expiresAt,
      resendCount: (invite.resendCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(organizationInvites.id, input.inviteId))
    .returning();

  const [organization] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, input.organizationId))
    .limit(1);

  const inviteUrl = buildInviteAcceptUrl(inviteToken);
  const deliveryChannel = getInviteDeliveryChannel();
  const queuedJob =
    deliveryChannel === "none"
      ? null
      : await backgroundJobService.enqueue({
          type: "invite_delivery",
          organizationId: input.organizationId,
          createdBy: input.actorUserId,
          payload: {
            email: updated.email,
            organizationName: organization?.name || "AI CONTROL GRID organization",
            role: updated.role,
            inviteUrl,
            expiresAt: updated.expiresAt.toISOString(),
            invitedByName: input.actorName,
            mode: "resent",
          },
        });

  const delivery = queuedJob
    ? {
        status: "queued" as const,
        channel: deliveryChannel,
        message: `Invite queued for ${deliveryChannel} delivery`,
        jobId: queuedJob.id,
      }
    : {
        status: "preview" as const,
        channel: "none" as const,
        message: "No invite delivery adapter configured",
      };

  await recordAdminAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    action: "invite.resent",
    targetType: "invite",
    targetId: input.inviteId,
    metadata: {
      email: updated.email,
      resendCount: updated.resendCount,
      expiresAt: updated.expiresAt,
      deliveryStatus: delivery.status,
      deliveryChannel: delivery.channel,
    },
  });

  const response: Record<string, unknown> = {
    id: updated.id,
    status: updated.status,
    expiresAt: updated.expiresAt,
    resendCount: updated.resendCount,
    delivery,
  };

  if (shouldExposeInviteSecrets()) {
    response.inviteToken = inviteToken;
    response.inviteUrl = inviteUrl;
  }

  return response;
}

async function revokeInvite(input: {
  organizationId: string;
  actorUserId: string;
  actorName: string;
  inviteId: string;
}) {
  const [invite] = await db
    .select()
    .from(organizationInvites)
    .where(and(eq(organizationInvites.id, input.inviteId), eq(organizationInvites.organizationId, input.organizationId)))
    .limit(1);

  if (!invite) {
    throw Object.assign(new Error("Invite not found"), { status: 404 });
  }
  if (invite.status === "accepted" || invite.status === "revoked") {
    throw Object.assign(new Error("Invite can no longer be revoked"), { status: 400 });
  }

  const [updated] = await db
    .update(organizationInvites)
    .set({
      status: "revoked",
      revokedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizationInvites.id, input.inviteId))
    .returning();

  await recordAdminAuditEvent({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    action: "invite.revoked",
    targetType: "invite",
    targetId: input.inviteId,
    metadata: {
      email: updated.email,
    },
  });

  return { ok: true, id: updated.id, status: updated.status };
}

async function previewInvite(token: string) {
  const tokenLookup = getInviteTokenPredicate(token);
  const matchingInvites = await db
    .select({
      id: organizationInvites.id,
      email: organizationInvites.email,
      role: organizationInvites.role,
      status: organizationInvites.status,
      expiresAt: organizationInvites.expiresAt,
      organizationName: organizations.name,
      storedToken: organizationInvites.token,
    })
    .from(organizationInvites)
    .leftJoin(organizations, eq(organizationInvites.organizationId, organizations.id))
    .where(tokenLookup.predicate)
    .limit(2);

  if (matchingInvites.length !== 1) {
    throw Object.assign(new Error("Invite token is invalid"), { status: 404 });
  }
  const [invite] = matchingInvites;

  if (tokenLookup.legacyToken && invite.storedToken === tokenLookup.legacyToken) {
    await db
      .update(organizationInvites)
      .set({ token: tokenLookup.tokenDigest, updatedAt: new Date() })
      .where(
        and(
          eq(organizationInvites.id, invite.id),
          eq(organizationInvites.token, tokenLookup.legacyToken),
        ),
      );
  }

  if (invite.status !== "pending") {
    throw Object.assign(new Error("Invite is no longer valid"), { status: 400 });
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(organizationInvites)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(organizationInvites.id, invite.id),
          eq(organizationInvites.token, tokenLookup.tokenDigest),
          eq(organizationInvites.status, "pending"),
        ),
      );
    throw Object.assign(new Error("Invite has expired"), { status: 400 });
  }

  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    organizationName: invite.organizationName,
    expiresAt: invite.expiresAt,
    status: invite.status,
  };
}

async function acceptInvite(input: {
  token: string;
  username: string;
  password: string;
  fullName: string;
  email?: string;
}) {
  const tokenLookup = getInviteTokenPredicate(input.token);
  const preflightInvites = await db
    .select()
    .from(organizationInvites)
    .where(tokenLookup.predicate)
    .limit(2);

  if (preflightInvites.length !== 1) {
    throw Object.assign(new Error("Invite token is invalid"), { status: 404 });
  }
  const [preflightInvite] = preflightInvites;
  if (!inviteStatusOptions.has(preflightInvite.status) || preflightInvite.status !== "pending") {
    throw Object.assign(new Error("Invite is no longer valid"), { status: 400 });
  }

  const normalizedInviteEmail = normalizeEmail(preflightInvite.email);
  if (input.email && normalizeEmail(input.email) !== normalizedInviteEmail) {
    throw Object.assign(new Error("Invite email does not match request email"), { status: 400 });
  }

  const passwordValidation = validatePasswordStrength(input.password);
  if (!passwordValidation.valid) {
    throw Object.assign(new Error(passwordValidation.message), { status: 400 });
  }
  const normalizedUsername = input.username.trim().toLowerCase();
  const hashedPassword = await hashPassword(input.password);

  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`invite:${tokenLookup.tokenDigest}`}, 0))`,
      );

      const matchingInvites = await tx
        .select()
        .from(organizationInvites)
        .where(tokenLookup.predicate)
        .limit(2);
      if (matchingInvites.length !== 1) {
        throw Object.assign(new Error("Invite token is invalid"), { status: 404 });
      }
      const [invite] = matchingInvites;

      if (tokenLookup.legacyToken && invite.token === tokenLookup.legacyToken) {
        await tx
          .update(organizationInvites)
          .set({ token: tokenLookup.tokenDigest, updatedAt: new Date() })
          .where(
            and(
              eq(organizationInvites.id, invite.id),
              eq(organizationInvites.token, tokenLookup.legacyToken),
            ),
          );
      }
      if (!inviteStatusOptions.has(invite.status) || invite.status !== "pending") {
        throw Object.assign(new Error("Invite is no longer valid"), { status: 400 });
      }

      if (invite.expiresAt.getTime() < Date.now()) {
        await tx
          .update(organizationInvites)
          .set({ status: "expired", updatedAt: new Date() })
          .where(eq(organizationInvites.id, invite.id));
        return { expired: true as const };
      }

      const lockedInviteEmail = normalizeEmail(invite.email);
      if (input.email && normalizeEmail(input.email) !== lockedInviteEmail) {
        throw Object.assign(new Error("Invite email does not match request email"), { status: 400 });
      }

      const identityLocks = [
        `identity-email:${lockedInviteEmail}`,
        `identity-username:${normalizedUsername}`,
      ].sort();
      for (const lockKey of identityLocks) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
      }

      const [existingUsername] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${normalizedUsername})`)
        .limit(1);
      if (existingUsername) {
        throw Object.assign(new Error("Username already exists"), { status: 409 });
      }

      const [existingEmail] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = lower(${lockedInviteEmail})`)
        .limit(1);
      if (existingEmail) {
        throw Object.assign(new Error("An account with this email already exists"), { status: 409 });
      }

      const userRole = membershipRoles.includes(invite.role as (typeof membershipRoles)[number])
        ? (invite.role === "owner" ? "admin" : invite.role)
        : "reviewer";
      const [newUser] = await tx
        .insert(users)
        .values({
          username: normalizedUsername,
          password: hashedPassword,
          fullName: input.fullName,
          email: lockedInviteEmail,
          role: userRole,
        })
        .returning();
      const [membership] = await tx
        .insert(memberships)
        .values({
          userId: newUser.id,
          organizationId: invite.organizationId,
          role: invite.role,
          membershipState: "active",
          isDefault: true,
          invitedBy: invite.invitedBy,
          provisioningSource: "invite",
        })
        .returning();
      const acceptedAt = new Date();
      await tx
        .update(organizationInvites)
        .set({
          status: "accepted",
          acceptedBy: newUser.id,
          acceptedAt,
          updatedAt: acceptedAt,
        })
        .where(and(eq(organizationInvites.id, invite.id), eq(organizationInvites.status, "pending")));
      await tx.insert(adminAuditEvents).values({
        organizationId: invite.organizationId,
        actorUserId: newUser.id,
        actorName: newUser.fullName || newUser.username,
        action: "invite.accepted",
        targetType: "membership",
        targetId: membership.id,
        targetUserId: newUser.id,
        metadata: {
          inviteId: invite.id,
          role: invite.role,
          email: invite.email,
        },
      });

      return {
        expired: false as const,
        ok: true,
        userId: newUser.id,
        organizationId: invite.organizationId,
        membershipId: membership.id,
      };
    });

    if (result.expired) {
      throw Object.assign(new Error("Invite has expired"), { status: 400 });
    }
    return result;
  } catch (error: any) {
    if (error?.code === "23505") {
      throw Object.assign(new Error("An account with this username or email already exists"), {
        status: 409,
      });
    }
    throw error;
  }
}

export const inviteService = {
  normalizeEmail,
  listInvites,
  createInvite,
  resendInvite,
  revokeInvite,
  previewInvite,
  acceptInvite,
};
