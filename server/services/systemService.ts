import type { AiSystemFilters } from "../storage";
import { storage } from "../storage";
import type { InsertAiSystem } from "@shared/schema";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class SystemService {
  async listSystems(params: { organizationId: string; actor: Actor; filters?: AiSystemFilters }) {
    return storage.getAiSystemsByOrg(params.organizationId, params.filters);
  }

  async getSystem(params: { organizationId: string; actor: Actor; systemId: string }) {
    return storage.getAiSystemById(params.organizationId, params.systemId);
  }

  async createSystem(params: { organizationId: string; actor: Actor; input: InsertAiSystem }) {
    return storage.createAiSystemForOrg(params.organizationId, params.input);
  }

  async updateSystem(params: {
    organizationId: string;
    actor: Actor;
    systemId: string;
    input: Partial<InsertAiSystem>;
  }) {
    return storage.updateAiSystemByOrg(params.organizationId, params.systemId, params.input);
  }

  async deleteSystem(params: { organizationId: string; actor: Actor; systemId: string }) {
    return storage.deleteAiSystemByOrg(params.organizationId, params.systemId);
  }
}

export const systemService = new SystemService();
