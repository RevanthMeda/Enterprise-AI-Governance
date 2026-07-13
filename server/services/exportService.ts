import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { storage } from "../storage";
import { getExportsRoot } from "../runtime-paths";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export type ExportType =
  | "ai_systems"
  | "system_controls"
  | "approval_workflows"
  | "audit_logs"
  | "evidence_files";

interface ExportRecord {
  exportId: string;
  organizationId: string;
  type: ExportType;
  filePath: string;
  fileName: string;
  mimeType: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  claimedAt: Date | null;
}

const exportsRoot = getExportsRoot();
const exportRecords = new Map<string, ExportRecord>();
const DEFAULT_EXPORT_TTL_MS = 15 * 60 * 1_000;
const DOWNLOAD_LEASE_MS = 5 * 60 * 1_000;
const MAX_EXPORT_ROWS = 50_000;
const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
const MAX_ACTIVE_EXPORTS_PER_ORG = 5;
const MAX_ACTIVE_EXPORTS_PER_USER = 3;

const elevatedExportRoles = new Set([
  "owner",
  "admin",
  "cro",
  "ciso",
  "compliance_lead",
  "auditor",
]);

const operationalExportRoles = new Set([
  ...elevatedExportRoles,
  "system_owner",
  "reviewer",
]);

export class ExportRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ExportRequestError";
  }
}

export function canRoleExport(role: string, type: ExportType): boolean {
  if (type === "audit_logs" || type === "evidence_files") {
    return elevatedExportRoles.has(role);
  }
  return operationalExportRoles.has(role);
}

export function escapeCsvValue(value: unknown): string {
  const text = String(value ?? "").replace(/\0/g, "");
  // Spreadsheet applications may execute cells beginning with these
  // characters as formulas, even when the CSV value is quoted. Prefixing an
  // apostrophe makes tenant-controlled text render as text on import.
  const safeText = /^[\u0001-\u0020]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const body = rows.map((row) => row.map(escapeCsvValue).join(","));
  return [headerLine, ...body].join("\n");
}

function makeExportId() {
  return randomUUID();
}

export function assertExportWithinBounds(rowCount: number, csv: string): void {
  if (!Number.isSafeInteger(rowCount) || rowCount < 0 || rowCount > MAX_EXPORT_ROWS) {
    throw new ExportRequestError(
      `Export contains more than ${MAX_EXPORT_ROWS.toLocaleString()} records; narrow the dataset before exporting`,
      413,
      "EXPORT_RECORD_LIMIT_EXCEEDED",
    );
  }
  if (Buffer.byteLength(csv, "utf8") > MAX_EXPORT_BYTES) {
    throw new ExportRequestError(
      "Export exceeds the 25 MiB file limit; narrow the dataset before exporting",
      413,
      "EXPORT_SIZE_LIMIT_EXCEEDED",
    );
  }
}

function toBoundedCsv(headers: string[], rows: unknown[][]): string {
  if (rows.length > MAX_EXPORT_ROWS) {
    assertExportWithinBounds(rows.length, "");
  }
  const csv = toCsv(headers, rows);
  assertExportWithinBounds(rows.length, csv);
  return csv;
}

export class ExportService {
  private async buildCsv(type: ExportType, organizationId: string): Promise<{ csv: string; filename: string }> {
    if (type === "ai_systems") {
      const systems = await storage.getAiSystemsByOrg(organizationId);
      return {
        filename: "ai-systems.csv",
        csv: toBoundedCsv(
          [
            "id",
            "name",
            "owner",
            "department",
            "riskLevel",
            "status",
            "vendor",
            "modelType",
            "createdAt",
          ],
          systems.map((s) => [
            s.id,
            s.name,
            s.owner,
            s.department,
            s.riskLevel,
            s.status,
            s.vendor,
            s.modelType,
            s.createdAt ? new Date(s.createdAt).toISOString() : "",
          ]),
        ),
      };
    }

    if (type === "system_controls") {
      const controls = await storage.getSystemControlsByOrg(organizationId);
      return {
        filename: "system-controls.csv",
        csv: toBoundedCsv(
          ["id", "systemId", "controlId", "status", "assignee", "dueDate", "completedAt"],
          controls.map((c) => [
            c.id,
            c.systemId,
            c.controlId,
            c.status,
            c.assignee,
            c.dueDate ? new Date(c.dueDate).toISOString() : "",
            c.completedAt ? new Date(c.completedAt).toISOString() : "",
          ]),
        ),
      };
    }

    if (type === "approval_workflows") {
      const workflows = await storage.getApprovalWorkflowsByOrg(organizationId);
      return {
        filename: "approval-workflows.csv",
        csv: toBoundedCsv(
          ["id", "systemId", "title", "status", "requestedBy", "reviewer", "priority", "createdAt"],
          workflows.map((w) => [
            w.id,
            w.systemId,
            w.title,
            w.status,
            w.requestedBy,
            w.reviewer,
            w.priority,
            w.createdAt ? new Date(w.createdAt).toISOString() : "",
          ]),
        ),
      };
    }

    if (type === "audit_logs") {
      const logs = await storage.getAuditLogsByOrg(organizationId);
      return {
        filename: "audit-logs.csv",
        csv: toBoundedCsv(
          ["id", "entityType", "entityId", "action", "performedBy", "details", "createdAt"],
          logs.map((l) => [
            l.id,
            l.entityType,
            l.entityId,
            l.action,
            l.performedBy,
            l.details,
            l.createdAt ? new Date(l.createdAt).toISOString() : "",
          ]),
        ),
      };
    }

    const evidence = await storage.getEvidenceFilesByOrg(organizationId);
    return {
      filename: "evidence-files.csv",
      csv: toBoundedCsv(
        ["id", "systemId", "controlId", "workflowId", "fileName", "mimeType", "fileSize", "uploadedBy", "createdAt"],
        evidence.map((e) => [
          e.id,
          e.systemId,
          e.controlId,
          e.workflowId,
          e.fileName,
          e.mimeType,
          e.fileSize,
          e.uploadedBy,
          e.createdAt ? new Date(e.createdAt).toISOString() : "",
        ]),
      ),
    };
  }

  private async unlinkRecord(record: ExportRecord): Promise<void> {
    exportRecords.delete(record.exportId);
    try {
      await fs.promises.unlink(record.filePath);
    } catch (error: any) {
      if (error?.code !== "ENOENT") {
        console.error("Failed to remove expired export file", {
          exportId: record.exportId,
          error: error instanceof Error ? error.message : "Unknown filesystem error",
        });
      }
    }
  }

  private async cleanupExpired(now = new Date()): Promise<void> {
    const expired = [...exportRecords.values()].filter((record) => {
      if (!record.claimedAt) return record.expiresAt <= now;
      return record.claimedAt.getTime() + DOWNLOAD_LEASE_MS <= now.getTime();
    });
    await Promise.all(expired.map((record) => this.unlinkRecord(record)));
  }

  private scheduleExpiry(record: ExportRecord): void {
    const delay = Math.max(1_000, record.expiresAt.getTime() - Date.now());
    const timer = setTimeout(() => {
      void this.cleanupExpired().catch((error) => {
        console.error("Failed to clean expired exports", {
          error: error instanceof Error ? error.message : "Unknown cleanup error",
        });
      });
    }, delay);
    timer.unref?.();
  }

  async createExport(params: {
    organizationId: string;
    actor: Actor;
    membershipRole?: string;
    type: ExportType;
  }) {
    const membershipRole = params.membershipRole ?? params.actor.role;
    if (!canRoleExport(membershipRole, params.type)) {
      throw new ExportRequestError(
        "Insufficient organization permissions for this export",
        403,
        "EXPORT_FORBIDDEN",
      );
    }

    await this.cleanupExpired();
    const activeForOrg = [...exportRecords.values()].filter(
      (record) => record.organizationId === params.organizationId,
    ).length;
    const activeForUser = [...exportRecords.values()].filter(
      (record) => record.organizationId === params.organizationId && record.createdBy === params.actor.id,
    ).length;
    if (activeForOrg >= MAX_ACTIVE_EXPORTS_PER_ORG || activeForUser >= MAX_ACTIVE_EXPORTS_PER_USER) {
      throw new ExportRequestError(
        "Too many exports are awaiting download. Download an existing export or wait for it to expire.",
        409,
        "EXPORT_ACTIVE_LIMIT_EXCEEDED",
      );
    }

    const { csv, filename } = await this.buildCsv(params.type, params.organizationId);
    const exportId = makeExportId();
    const orgDir = path.join(exportsRoot, params.organizationId);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    const fileName = `${exportId}-${filename}`;
    const filePath = path.join(orgDir, fileName);
    await fs.promises.writeFile(filePath, csv, { encoding: "utf8", flag: "wx", mode: 0o600 });

    const createdAt = new Date();

    const record: ExportRecord = {
      exportId,
      organizationId: params.organizationId,
      type: params.type,
      filePath,
      fileName,
      mimeType: "text/csv",
      createdBy: params.actor.id,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + DEFAULT_EXPORT_TTL_MS),
      claimedAt: null,
    };
    exportRecords.set(exportId, record);
    this.scheduleExpiry(record);

    return {
      exportId,
      fileName: record.fileName,
      createdAt: record.createdAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      downloadUrl: `/api/exports/${exportId}/download`,
    };
  }

  async claimExportForDownload(params: {
    organizationId: string;
    exportId: string;
    actorUserId: string;
    membershipRole: string;
  }) {
    await this.cleanupExpired();
    const record = exportRecords.get(params.exportId);
    if (!record) return undefined;
    if (record.organizationId !== params.organizationId) return undefined;
    if (record.createdBy !== params.actorUserId) return undefined;
    if (!canRoleExport(params.membershipRole, record.type)) {
      throw new ExportRequestError(
        "Insufficient organization permissions for this export",
        403,
        "EXPORT_FORBIDDEN",
      );
    }
    if (record.claimedAt) {
      throw new ExportRequestError(
        "Export download is already in progress",
        409,
        "EXPORT_DOWNLOAD_IN_PROGRESS",
      );
    }
    if (!fs.existsSync(record.filePath)) {
      exportRecords.delete(record.exportId);
      return undefined;
    }
    record.claimedAt = new Date();
    return record;
  }

  /** Tenant-scoped metadata lookup retained for internal callers and tests. */
  async getExportForDownload(params: { organizationId: string; exportId: string }) {
    await this.cleanupExpired();
    const record = exportRecords.get(params.exportId);
    if (!record || record.organizationId !== params.organizationId) return undefined;
    if (!fs.existsSync(record.filePath)) {
      exportRecords.delete(record.exportId);
      return undefined;
    }
    return record;
  }

  releaseDownload(exportId: string): void {
    const record = exportRecords.get(exportId);
    if (record) record.claimedAt = null;
  }

  async completeDownload(exportId: string): Promise<void> {
    const record = exportRecords.get(exportId);
    if (record) await this.unlinkRecord(record);
  }
}

export const exportService = new ExportService();
