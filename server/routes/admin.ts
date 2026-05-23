import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant, requireOrgRole } from "../tenant";
import { backgroundJobService } from "../services/backgroundJobService";
import { inviteService } from "../services/inviteService";
import { db } from "../db";
import { adminAuditEvents, memberships, users, organizationInviteStatuses, userRoles } from "@shared/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { routeParam, recordAdminAuditEvent, getOptionalString } from "./_helpers";

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
  token: z.string().trim().min(20),
  username: z.string().trim().min(3).max(120),
  password: z.string().min(12),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional(),
});

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

      return res.json({ ok: true, job: retried });
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

      const [targetMembership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, req.tenant!.organizationId)))
        .limit(1);

      if (!targetMembership) {
        return res.status(404).json({ message: "Membership not found" });
      }

      if (targetMembership.role === "owner" && req.tenant!.membershipRole !== "owner") {
        return res.status(403).json({ message: "Only organization owners can modify owner memberships" });
      }

      if (parsed.role === "owner" && req.tenant!.membershipRole !== "owner") {
        return res.status(403).json({ message: "Only organization owners can assign owner role" });
      }

      if (parsed.role && !assignableMembershipRoles.has(parsed.role)) {
        return res.status(400).json({ message: "Unsupported membership role" });
      }

      if (targetMembership.userId === req.user!.id && parsed.membershipState && parsed.membershipState !== "active") {
        return res.status(400).json({ message: "Cannot deactivate your own membership" });
      }

      const [updated] = await db
        .update(memberships)
        .set({
          role: parsed.role ?? targetMembership.role,
          membershipState: parsed.membershipState ?? targetMembership.membershipState,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, membershipId))
        .returning();

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
      return res.status(400).json({ message: err.message || "Failed to update membership" });
    }
  });

  app.get("/api/organization/invites", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const invites = await inviteService.listInvites(req.tenant!.organizationId);
    return res.json(invites);
  });

  app.post("/api/organization/invites", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = createInviteSchema.parse(req.body);
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
      const result = await inviteService.resendInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        inviteId: routeParam(req.params.inviteId),
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
    const rawToken = req.query.token;
    const token = getOptionalString(Array.isArray(rawToken) ? rawToken[0] : rawToken);
    if (!token) {
      return res.status(400).json({ message: "Invite token is required" });
    }

    try {
      const preview = await inviteService.previewInvite(token);
      return res.json(preview);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to preview invite" });
    }
  });

  app.post("/api/organization/invites/accept", async (req, res) => {
    try {
      const parsed = acceptInviteSchema.parse(req.body);
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
