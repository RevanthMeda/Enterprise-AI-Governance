import { randomBytes } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { membershipRoles, organizationInviteStatuses, organizationInvites, organizations, users } from "@shared/schema";
import { hashPassword, validatePasswordStrength } from "../auth";
import { adminAuditEvents, memberships } from "@shared/schema";
import { db } from "../db";
import { storage } from "../storage";
import { backgroundJobService } from "./backgroundJobService";
import { buildInviteAcceptUrl, getInviteDeliveryChannel, shouldExposeInviteSecrets } from "./inviteDeliveryService";

const inviteStatusOptions = new Set<string>(organizationInviteStatuses);

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
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
  const inviteToken = randomBytes(24).toString("hex");
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
      token: inviteToken,
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
            organizationName: organization?.name || "AI Control Tower organization",
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
    inviteUrl,
    delivery,
  };

  if (shouldExposeInviteSecrets()) {
    response.inviteToken = inviteToken;
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

  const inviteToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(organizationInvites)
    .set({
      token: inviteToken,
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
            organizationName: organization?.name || "AI Control Tower organization",
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
    inviteUrl,
    delivery,
  };

  if (shouldExposeInviteSecrets()) {
    response.inviteToken = inviteToken;
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
  const [invite] = await db
    .select({
      id: organizationInvites.id,
      email: organizationInvites.email,
      role: organizationInvites.role,
      status: organizationInvites.status,
      expiresAt: organizationInvites.expiresAt,
      organizationName: organizations.name,
    })
    .from(organizationInvites)
    .leftJoin(organizations, eq(organizationInvites.organizationId, organizations.id))
    .where(eq(organizationInvites.token, token))
    .limit(1);

  if (!invite) {
    throw Object.assign(new Error("Invite token is invalid"), { status: 404 });
  }

  if (invite.status !== "pending") {
    throw Object.assign(new Error("Invite is no longer valid"), { status: 400 });
  }

  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(organizationInvites)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(organizationInvites.id, invite.id));
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
  const [invite] = await db
    .select()
    .from(organizationInvites)
    .where(eq(organizationInvites.token, input.token))
    .limit(1);

  if (!invite) {
    throw Object.assign(new Error("Invite token is invalid"), { status: 404 });
  }
  if (!inviteStatusOptions.has(invite.status) || invite.status !== "pending") {
    throw Object.assign(new Error("Invite is no longer valid"), { status: 400 });
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await db
      .update(organizationInvites)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(organizationInvites.id, invite.id));
    throw Object.assign(new Error("Invite has expired"), { status: 400 });
  }

  const normalizedInviteEmail = normalizeEmail(invite.email);
  if (input.email && normalizeEmail(input.email) !== normalizedInviteEmail) {
    throw Object.assign(new Error("Invite email does not match request email"), { status: 400 });
  }

  const existingUsername = await storage.getUserByUsername(input.username);
  if (existingUsername) {
    throw Object.assign(new Error("Username already exists"), { status: 409 });
  }

  const existingEmail = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = lower(${normalizedInviteEmail})`)
    .limit(1);
  if (existingEmail.length > 0) {
    throw Object.assign(new Error("An account with this email already exists"), { status: 409 });
  }

  const passwordValidation = validatePasswordStrength(input.password);
  if (!passwordValidation.valid) {
    throw Object.assign(new Error(passwordValidation.message), { status: 400 });
  }

  const userRole = membershipRoles.includes(invite.role as (typeof membershipRoles)[number])
    ? (invite.role === "owner" ? "admin" : invite.role)
    : "reviewer";

  const newUser = await storage.createUser({
    username: input.username,
    password: await hashPassword(input.password),
    fullName: input.fullName,
    email: normalizedInviteEmail,
    role: userRole,
  });

  const existingMemberships = await storage.getMembershipsByUserId(newUser.id);
  const membership = await storage.createMembership({
    userId: newUser.id,
    organizationId: invite.organizationId,
    role: invite.role,
    membershipState: "active",
    isDefault: existingMemberships.length === 0,
    invitedBy: invite.invitedBy,
    provisioningSource: "invite",
  });

  await db
    .update(organizationInvites)
    .set({
      status: "accepted",
      acceptedBy: newUser.id,
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(organizationInvites.id, invite.id));

  await recordAdminAuditEvent({
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
    ok: true,
    userId: newUser.id,
    organizationId: invite.organizationId,
    membershipId: membership.id,
  };
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
