import fs from "fs";
import path from "path";
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
  filePath: string;
  fileName: string;
  mimeType: string;
  createdBy: string;
  createdAt: Date;
}

const exportsRoot = getExportsRoot();
const exportRecords = new Map<string, ExportRecord>();

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const body = rows.map((row) => row.map(escapeCsvValue).join(","));
  return [headerLine, ...body].join("\n");
}

function makeExportId() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

export class ExportService {
  private async buildCsv(type: ExportType, organizationId: string): Promise<{ csv: string; filename: string }> {
    if (type === "ai_systems") {
      const systems = await storage.getAiSystemsByOrg(organizationId);
      return {
        filename: "ai-systems.csv",
        csv: toCsv(
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
        csv: toCsv(
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
        csv: toCsv(
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
        csv: toCsv(
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
      csv: toCsv(
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

  async createExport(params: { organizationId: string; actor: Actor; type: ExportType }) {
    const { csv, filename } = await this.buildCsv(params.type, params.organizationId);
    const exportId = makeExportId();
    const orgDir = path.join(exportsRoot, params.organizationId);
    if (!fs.existsSync(orgDir)) {
      fs.mkdirSync(orgDir, { recursive: true });
    }

    const fileName = `${exportId}-${filename}`;
    const filePath = path.join(orgDir, fileName);
    await fs.promises.writeFile(filePath, csv, "utf8");

    const record: ExportRecord = {
      exportId,
      organizationId: params.organizationId,
      filePath,
      fileName,
      mimeType: "text/csv",
      createdBy: params.actor.id,
      createdAt: new Date(),
    };
    exportRecords.set(exportId, record);

    return {
      exportId,
      fileName: record.fileName,
      createdAt: record.createdAt.toISOString(),
      downloadUrl: `/api/exports/${exportId}/download`,
    };
  }

  async getExportForDownload(params: { organizationId: string; exportId: string }) {
    const record = exportRecords.get(params.exportId);
    if (!record) return undefined;
    if (record.organizationId !== params.organizationId) return undefined;
    if (!fs.existsSync(record.filePath)) return undefined;
    return record;
  }
}

export const exportService = new ExportService();
