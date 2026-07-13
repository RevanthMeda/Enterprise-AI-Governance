import { createHash } from "crypto";
import { eq, sql, type ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import type { AuditLogFilters } from "../storage";
import { storage } from "../storage";
import { auditLogs, type InsertAuditLog } from "@shared/schema";
import * as schema from "@shared/schema";
import { db } from "../db";

export type AuditActor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export type AuditLogCreateParams = {
  organizationId: string;
  actor: AuditActor;
  input: Omit<InsertAuditLog, "organizationId">;
};

export type AuditLogTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export class AuditService {
  async listLogs(params: { organizationId: string; actor: AuditActor; filters?: AuditLogFilters }) {
    return storage.getAuditLogsByOrg(params.organizationId, params.filters);
  }

  async listLogsByEntity(params: { organizationId: string; actor: AuditActor; entityId: string }) {
    return storage.getAuditLogsByEntityForOrg(params.organizationId, params.entityId);
  }

  async createLogInTransaction(tx: AuditLogTransaction, params: AuditLogCreateParams) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${params.organizationId}, 0))`);

    const headResult = await tx.execute(sql`
      select parent.record_hash as "recordHash"
      from audit_logs parent
      left join audit_logs child
        on child.organization_id = parent.organization_id
        and child.previous_hash = parent.record_hash
      where parent.organization_id = ${params.organizationId}
        and child.id is null
      limit 2
    `);
    const heads = headResult.rows as Array<{ recordHash: string }>;
    if (heads.length > 1) {
      throw Object.assign(new Error("Audit chain has multiple heads and must be repaired before appending"), {
        status: 409,
      });
    }

    const previousHash = heads[0]?.recordHash ?? null;
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
    const [created] = await tx
      .insert(auditLogs)
      .values({
        ...params.input,
        organizationId: params.organizationId,
        previousHash,
        recordHash,
        createdAt: sql`clock_timestamp()`,
      })
      .returning();

    return created;
  }

  async createLog(params: AuditLogCreateParams) {
    return db.transaction((tx) => this.createLogInTransaction(tx, params));
  }

  async verifyChain(params: { organizationId: string; actor: AuditActor }) {
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.organizationId, params.organizationId));

    if (rows.length === 0) {
      return { ok: true, verified: true, total: 0, latestHash: null };
    }

    type AuditLogRow = (typeof rows)[number];
    const childrenByPreviousHash = new Map<string | null, AuditLogRow[]>();
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
            row.previousHash ?? "",
          ].join("|"),
        )
        .digest("hex");
      if (row.recordHash !== expectedHash) {
        return {
          ok: false,
          verified: false,
          brokenAt: row.id,
          total: rows.length,
        };
      }

      const siblings = childrenByPreviousHash.get(row.previousHash) ?? [];
      siblings.push(row);
      childrenByPreviousHash.set(row.previousHash, siblings);
    }

    let previousHash: string | null = null;
    let latestHash: string | null = null;
    const visited = new Set<string>();
    while (true) {
      const children: AuditLogRow[] = childrenByPreviousHash.get(previousHash) ?? [];
      if (children.length === 0) {
        break;
      }
      if (children.length !== 1) {
        return {
          ok: false,
          verified: false,
          brokenAt: children[1]?.id ?? children[0].id,
          total: rows.length,
        };
      }

      const row: AuditLogRow = children[0];
      if (visited.has(row.id)) {
        return { ok: false, verified: false, brokenAt: row.id, total: rows.length };
      }
      visited.add(row.id);
      latestHash = row.recordHash;
      previousHash = row.recordHash;
    }

    if (visited.size !== rows.length) {
      const unvisited = rows.find((row) => !visited.has(row.id));
      return {
        ok: false,
        verified: false,
        brokenAt: unvisited?.id,
        total: rows.length,
      };
    }

    return {
      ok: true,
      verified: true,
      total: rows.length,
      latestHash,
    };
  }
}

export const auditService = new AuditService();
