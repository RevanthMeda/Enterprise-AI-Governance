import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { decisionAudits } from "@shared/schema";
import { auditService } from "./auditService";

const POLL_MS = Math.max(60_000, Number(process.env.RETENTION_ENFORCEMENT_POLL_MS || 15 * 60_000));

const systemActor = {
  id: "system-retention",
  username: "system-retention",
  fullName: "System Retention Policy",
  email: null,
  role: "system",
};

export class RetentionService {
  private timer: NodeJS.Timeout | null = null;
  private draining = false;

  start() {
    if (
      process.env.RETENTION_ENFORCEMENT_DISABLED === "true" ||
      process.env.VERCEL === "1" ||
      this.timer
    ) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_MS);

    this.timer.unref?.();
    void this.tick();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async getSummaryForOrg(organizationId: string) {
    const [summary] = await db
      .select({
        total: sql<number>`count(*)::int`,
        archived: sql<number>`count(*) filter (where ${decisionAudits.archivedAt} is not null)::int`,
        dueForArchive: sql<number>`count(*) filter (where ${decisionAudits.retentionUntil} <= now() and ${decisionAudits.archivedAt} is null and ${decisionAudits.legalHold} = false)::int`,
        underLegalHold: sql<number>`count(*) filter (where ${decisionAudits.legalHold} = true)::int`,
      })
      .from(decisionAudits)
      .where(eq(decisionAudits.organizationId, organizationId));

    const total = summary?.total ?? 0;
    const archived = summary?.archived ?? 0;

    return {
      total,
      active: Math.max(0, total - archived),
      archived,
      dueForArchive: summary?.dueForArchive ?? 0,
      underLegalHold: summary?.underLegalHold ?? 0,
      workerEnabled:
        process.env.RETENTION_ENFORCEMENT_DISABLED !== "true" &&
        process.env.VERCEL !== "1",
    };
  }

  async setLegalHold(params: {
    organizationId: string;
    decisionAuditId: string;
    enabled: boolean;
    reason?: string | null;
    actorName?: string;
  }) {
    const [current] = await db
      .select()
      .from(decisionAudits)
      .where(
        and(
          eq(decisionAudits.organizationId, params.organizationId),
          eq(decisionAudits.id, params.decisionAuditId),
        ),
      )
      .limit(1);

    if (!current) {
      return undefined;
    }

    if (params.enabled && !(params.reason ?? "").trim()) {
      const error = new Error("Legal hold reason is required");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const [updated] = await db
      .update(decisionAudits)
      .set({
        legalHold: params.enabled,
        legalHoldReason: params.enabled ? (params.reason ?? "").trim() : null,
        legalHoldAppliedAt: params.enabled ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(decisionAudits.organizationId, params.organizationId),
          eq(decisionAudits.id, params.decisionAuditId),
        ),
      )
      .returning();

    await auditService.createLog({
      organizationId: params.organizationId,
      actor: {
        ...systemActor,
        fullName: params.actorName ?? systemActor.fullName,
      },
      input: {
        entityType: "decision_audit",
        entityId: params.decisionAuditId,
        action: params.enabled ? "legal_hold_applied" : "legal_hold_released",
        performedBy: params.actorName ?? systemActor.fullName,
        details: params.enabled
          ? `Legal hold applied to decision trace "${updated.title}"${updated.legalHoldReason ? `: ${updated.legalHoldReason}` : ""}`
          : `Legal hold released for decision trace "${updated.title}"`,
      },
    });

    return updated;
  }

  async enforceDueRetention(params?: { organizationId?: string; actorName?: string }) {
    const dueRows = await db
      .select()
      .from(decisionAudits)
      .where(
        and(
          params?.organizationId ? eq(decisionAudits.organizationId, params.organizationId) : undefined,
          lte(decisionAudits.retentionUntil, new Date()),
          isNull(decisionAudits.archivedAt),
          eq(decisionAudits.legalHold, false),
        ),
      )
      .limit(250);

    const archivedAt = new Date();

    for (const row of dueRows) {
      await db
        .update(decisionAudits)
        .set({
          documentationStatus: "archived",
          archivedAt,
          lastRetentionCheckAt: archivedAt,
          updatedAt: archivedAt,
        })
        .where(eq(decisionAudits.id, row.id));

      await auditService.createLog({
        organizationId: row.organizationId,
        actor: {
          ...systemActor,
          fullName: params?.actorName ?? systemActor.fullName,
        },
        input: {
          entityType: "decision_audit",
          entityId: row.id,
          action: "retention_archived",
          performedBy: params?.actorName ?? systemActor.fullName,
          details: `Decision trace "${row.title}" archived by retention policy`,
        },
      });
    }

    return {
      archived: dueRows.length,
      checkedAt: archivedAt.toISOString(),
    };
  }

  private async tick() {
    if (this.draining) {
      return;
    }

    this.draining = true;
    try {
      await this.enforceDueRetention();
    } finally {
      this.draining = false;
    }
  }
}

export const retentionService = new RetentionService();
