import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant, requireOrgRole } from "../tenant";
import { backgroundJobService } from "../services/backgroundJobService";
import { backgroundJobClientView } from "../services/backgroundJobPayloadSecurity";
import { inviteService } from "../services/inviteService";
import { db } from "../db";
import {
  adminAuditEvents,
  memberships,
  organizationInvites,
  users,
  organizationInviteStatuses,
  userRoles,
} from "@shared/schema";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { routeParam, recordAdminAuditEvent, getOptionalString } from "./_helpers";
import {
  enforceSharedRateLimits,
  getRateLimitClientAddress,
  globalRateLimitIdentity,
  publicRateLimitPolicies,
} from "../public-rate-limit";
import {
  getInviteTokenFromAuthorizationHeader,
  isPlausibleInviteBearerToken,
} from "../invite-token";

const inviteRoleOptions = ["owner", ...userRoles] as const;
const assignableMembershipRoles = new Set<string>(inviteRoleOptions);

const createInviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(inviteRoleOptions).default("reviewer"),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

const updateMembershipSchema = z
  .object({
    role: z.enum(inviteRoleOptions).optional(),
    membershipState: z.enum(["active", "inactive"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.membershipState !== undefined, {
    message: "At least one field must be provided",
  });

const acceptInviteSchema = z.object({
  token: z.string().trim().min(20).max(512).regex(/^\S+$/),
  username: z.string().trim().min(3).max(120),
  password: z.string().min(12),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional(),
});

function createStatusError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

async function hasActiveOwnerMembership(organizationId: string, membershipId: string) {
  const [membership] = await db
    .select({ role: memberships.role, membershipState: memberships.membershipState })
    .from(memberships)
    .where(
      and(
        eq(memberships.id, membershipId),
        eq(memberships.organizationId, organizationId),
      ),
    )
    .limit(1);
  return membership?.role === "owner" && membership.membershipState === "active";
}

export function registerAdminRoutes(app: Express): void {
  app.get(
    "/api/organization/background-jobs",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const rawStatus = req.query.status;
      const requestedStatus =
        typeof rawStatus === "string"
          ? rawStatus
          : Array.isArray(rawStatus)
            ? rawStatus[0]
            : "failed";
      const status =
        requestedStatus === "pending" ||
        requestedStatus === "processing" ||
        requestedStatus === "succeeded" ||
        requestedStatus === "failed"
          ? requestedStatus
          : "failed";
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;

      const [summary, jobs] = await Promise.all([
        backgroundJobService.getJobSummaryForOrganization(req.tenant!.organizationId),
        backgroundJobService.getJobsForOrganization({
          organizationId: req.tenant!.organizationId,
          status,
          limit,
        }),
      ]);

      return res.json({ summary, jobs });
    },
  );

  app.post(
    "/api/organization/background-jobs/:jobId/retry",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const retried = await backgroundJobService.retryFailedJobForOrganization(
        req.tenant!.organizationId,
        jobId,
      );

      if (!retried) {
        return res.status(404).json({ message: "Background job not found" });
      }

      await db.insert(adminAuditEvents).values({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.fullName || req.user?.username || "Unknown actor",
        action: "background_job.retried",
        targetType: "background_job",
        targetId: retried.id,
        metadata: {
          jobType: retried.type,
          previousStatus: "failed",
        },
      });

      return res.json({ ok: true, job: backgroundJobClientView(retried) });
    },
  );

  app.get("/api/organization/members", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        role: memberships.role,
        membershipState: memberships.membershipState,
        isDefault: memberships.isDefault,
        createdAt: memberships.createdAt,
        updatedAt: memberships.updatedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, req.tenant!.organizationId))
      .orderBy(asc(users.fullName), asc(users.username));

    return res.json(rows);
  });

  app.patch("/api/organization/members/:membershipId", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = updateMembershipSchema.parse(req.body);
      const membershipId = routeParam(req.params.membershipId);
      const { targetMembership, updated } = await db.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`organization-owners:${req.tenant!.organizationId}`}))`,
        );

        const [actorMembership] = await tx
          .select({ role: memberships.role, membershipState: memberships.membershipState })
          .from(memberships)
          .where(
            and(
              eq(memberships.id, req.tenant!.membershipId),
              eq(memberships.organizationId, req.tenant!.organizationId),
            ),
          )
          .limit(1);
        if (
          actorMembership?.membershipState !== "active" ||
          (actorMembership.role !== "owner" && actorMembership.role !== "admin")
        ) {
          throw createStatusError("Insufficient organization permissions", 403);
        }

        const [currentMembership] = await tx
          .select()
          .from(memberships)
          .where(
            and(
              eq(memberships.id, membershipId),
              eq(memberships.organizationId, req.tenant!.organizationId),
            ),
          )
          .limit(1);
        if (!currentMembership) {
          throw createStatusError("Membership not found", 404);
        }

        if (currentMembership.role === "owner" && actorMembership.role !== "owner") {
          throw createStatusError("Only organization owners can modify owner memberships", 403);
        }
        if (parsed.role === "owner" && actorMembership.role !== "owner") {
          throw createStatusError("Only organization owners can assign owner role", 403);
        }
        if (parsed.role && !assignableMembershipRoles.has(parsed.role)) {
          throw createStatusError("Unsupported membership role", 400);
        }
        if (
          currentMembership.userId === req.user!.id &&
          parsed.membershipState &&
          parsed.membershipState !== "active"
        ) {
          throw createStatusError("Cannot deactivate your own membership", 400);
        }

        const nextRole = parsed.role ?? currentMembership.role;
        const nextMembershipState = parsed.membershipState ?? currentMembership.membershipState;
        const removesActiveOwner =
          currentMembership.role === "owner" &&
          currentMembership.membershipState === "active" &&
          (nextRole !== "owner" || nextMembershipState !== "active");
        if (removesActiveOwner) {
          const [ownerCount] = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(memberships)
            .where(
              and(
                eq(memberships.organizationId, req.tenant!.organizationId),
                eq(memberships.role, "owner"),
                eq(memberships.membershipState, "active"),
              ),
            );
          if ((ownerCount?.count ?? 0) <= 1) {
            throw createStatusError("The last active organization owner cannot be removed or demoted", 409);
          }
        }

        const [nextMembership] = await tx
          .update(memberships)
          .set({
            role: nextRole,
            membershipState: nextMembershipState,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(memberships.id, membershipId),
              eq(memberships.organizationId, req.tenant!.organizationId),
            ),
          )
          .returning();
        if (!nextMembership) {
          throw createStatusError("Membership not found", 404);
        }

        return { targetMembership: currentMembership, updated: nextMembership };
      });

      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        action: "membership.updated",
        targetType: "membership",
        targetId: membershipId,
        targetUserId: targetMembership.userId,
        metadata: {
          previousRole: targetMembership.role,
          nextRole: updated.role,
          previousState: targetMembership.membershipState,
          nextState: updated.membershipState,
        },
      });

      return res.json(updated);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to update membership" });
    }
  });

  app.get("/api/organization/invites", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const invites = await inviteService.listInvites(req.tenant!.organizationId);
    return res.json(invites);
  });

  app.post("/api/organization/invites", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = createInviteSchema.parse(req.body);
      if (parsed.role === "owner") {
        const isOwner = await hasActiveOwnerMembership(
          req.tenant!.organizationId,
          req.tenant!.membershipId,
        );
        if (!isOwner) {
          return res.status(403).json({ message: "Only organization owners can invite another owner" });
        }
      }
      const result = await inviteService.createInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        email: parsed.email,
        role: parsed.role,
        expiresInDays: parsed.expiresInDays,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to create invite" });
    }
  });

  app.post("/api/organization/invites/:inviteId/resend", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const inviteId = routeParam(req.params.inviteId);
      const [invite] = await db
        .select({ role: organizationInvites.role })
        .from(organizationInvites)
        .where(
          and(
            eq(organizationInvites.id, inviteId),
            eq(organizationInvites.organizationId, req.tenant!.organizationId),
          ),
        )
        .limit(1);
      if (!invite) {
        return res.status(404).json({ message: "Invite not found" });
      }
      if (invite.role === "owner") {
        const isOwner = await hasActiveOwnerMembership(
          req.tenant!.organizationId,
          req.tenant!.membershipId,
        );
        if (!isOwner) {
          return res.status(403).json({ message: "Only organization owners can resend an owner invite" });
        }
      }
      const result = await inviteService.resendInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        inviteId,
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to resend invite" });
    }
  });

  app.post("/api/organization/invites/:inviteId/revoke", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const result = await inviteService.revokeInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        inviteId: routeParam(req.params.inviteId),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to revoke invite" });
    }
  });

  app.get("/api/organization/invites/preview", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const headerToken = getInviteTokenFromAuthorizationHeader(req.get("authorization"));
    const rawToken = req.query.token;
    const legacyQueryToken = getOptionalString(
      Array.isArray(rawToken) ? rawToken[0] : rawToken,
    );
    const token =
      headerToken ||
      (legacyQueryToken && isPlausibleInviteBearerToken(legacyQueryToken)
        ? legacyQueryToken
        : null);
    if (!token) {
      return res.status(400).json({ message: "Invite token is required" });
    }

    const clientAddress = getRateLimitClientAddress(req);
    if (
      !(await enforceSharedRateLimits(req, res, [
        { policy: publicRateLimitPolicies.invitePreviewGlobal, identity: globalRateLimitIdentity() },
        { policy: publicRateLimitPolicies.invitePreviewIp, identity: [clientAddress] },
      ]))
    ) {
      return;
    }

    try {
      const preview = await inviteService.previewInvite(token);
      return res.json(preview);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to preview invite" });
    }
  });

  app.post("/api/organization/invites/accept", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const parsed = acceptInviteSchema.parse(req.body);
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.inviteAcceptGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.inviteAcceptIp, identity: [clientAddress] },
          { policy: publicRateLimitPolicies.inviteAcceptToken, identity: [parsed.token] },
        ]))
      ) {
        return;
      }
      const result = await inviteService.acceptInvite({
        token: parsed.token,
        username: parsed.username,
        password: parsed.password,
        fullName: parsed.fullName,
        email: parsed.email,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to accept invite" });
    }
  });

  app.get("/api/organization/admin-audit", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const rows = await db
      .select()
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.organizationId, req.tenant!.organizationId))
      .orderBy(desc(adminAuditEvents.createdAt))
      .limit(200);
    return res.json(rows);
  });
}
