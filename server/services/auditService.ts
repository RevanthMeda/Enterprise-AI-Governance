import type { AuditLogFilters } from "../storage";
import { storage } from "../storage";
import type { InsertAuditLog } from "@shared/schema";

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
    return storage.createAuditLogForOrg(params.organizationId, params.input);
  }
}

export const auditService = new AuditService();
