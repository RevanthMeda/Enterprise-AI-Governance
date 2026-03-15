import { createHash } from "crypto";
import { asc, desc, eq } from "drizzle-orm";
import type { AuditLogFilters } from "../storage";
import { storage } from "../storage";
import { auditLogs, type InsertAuditLog } from "@shared/schema";
import { db } from "../db";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class AuditService {
  async listLogs(params: { organizationId: string; actor: Actor; filters?: AuditLogFilters }) {
    return storage.getAuditLogsByOrg(params.organizationId, params.filters);
  }

  async listLogsByEntity(params: { organizationId: string; actor: Actor; entityId: string }) {
    return storage.getAuditLogsByEntityForOrg(params.organizationId, params.entityId);
  }

  async createLog(params: {
    organizationId: string;
    actor: Actor;
    input: Omit<InsertAuditLog, "organizationId">;
  }) {
    const [latest] = await db
      .select({ recordHash: auditLogs.recordHash })
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, params.organizationId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    const previousHash = latest?.recordHash ?? null;
    const payload = [
      params.organizationId,
      params.input.entityType,
      params.input.entityId,
      params.input.action,
      params.input.performedBy,
      params.input.details ?? "",
      previousHash ?? "",
    ].join("|");
    const recordHash = createHash("sha256").update(payload).digest("hex");

    return storage.createAuditLogForOrg(params.organizationId, {
      ...params.input,
      previousHash,
      recordHash,
    });
  }

  async verifyChain(params: { organizationId: string; actor: Actor }) {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, params.organizationId))
      .orderBy(asc(auditLogs.createdAt));

    let previousHash: string | null = null;
    for (const row of rows) {
      const expectedHash: string = createHash("sha256")
        .update(
          [
            params.organizationId,
            row.entityType,
            row.entityId,
            row.action,
            row.performedBy,
            row.details ?? "",
            previousHash ?? "",
          ].join("|"),
        )
        .digest("hex");
      if (row.previousHash !== previousHash || row.recordHash !== expectedHash) {
        return {
          ok: false,
          verified: false,
          brokenAt: row.id,
          total: rows.length,
        };
      }
      previousHash = row.recordHash;
    }

    return {
      ok: true,
      verified: true,
      total: rows.length,
      latestHash: previousHash,
    };
  }
}

export const auditService = new AuditService();
