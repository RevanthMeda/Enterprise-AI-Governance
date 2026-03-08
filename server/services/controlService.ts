import { storage, type SystemControlFilters } from "../storage";
import type { InsertSystemControl } from "@shared/schema";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class ControlService {
  async listControls(params: {
    organizationId: string;
    actor: Actor;
    filters?: SystemControlFilters;
  }) {
    return storage.getSystemControlsByOrg(params.organizationId, params.filters);
  }

  private async ensureSystemInOrg(organizationId: string, systemId: string) {
    const system = await storage.getAiSystemById(organizationId, systemId);
    if (!system) {
      throw new Error("System not found in active organization");
    }
  }

  private async ensureControlDefinitionExists(controlId: string) {
    const control = await storage.getComplianceControl(controlId);
    if (!control) {
      throw new Error("Compliance control not found");
    }
  }

  async createControlAssignment(params: {
    organizationId: string;
    actor: Actor;
    input: InsertSystemControl;
  }) {
    await this.ensureSystemInOrg(params.organizationId, params.input.systemId);
    await this.ensureControlDefinitionExists(params.input.controlId);
    return storage.createSystemControlForOrg(params.organizationId, params.input);
  }

  async updateControlAssignment(params: {
    organizationId: string;
    actor: Actor;
    controlId: string;
    input: Partial<InsertSystemControl>;
  }) {
    if (params.input.systemId) {
      await this.ensureSystemInOrg(params.organizationId, params.input.systemId);
    }
    if (params.input.controlId) {
      await this.ensureControlDefinitionExists(params.input.controlId);
    }
    return storage.updateSystemControlForOrg(params.organizationId, params.controlId, params.input);
  }

  async bulkAssignControls(params: {
    organizationId: string;
    actor: Actor;
    systemIds: string[];
    controlIds: string[];
  }) {
    const systems = await storage.getAiSystemsByOrg(params.organizationId);
    const validSystemIds = new Set(systems.map((s) => s.id));
    const invalidSystems = params.systemIds.filter((id) => !validSystemIds.has(id));
    if (invalidSystems.length > 0) {
      throw new Error(`Invalid systems for organization: ${invalidSystems.join(", ")}`);
    }

    const allControls = await storage.getComplianceControls();
    const validControlIds = new Set(allControls.map((c) => c.id));
    const invalidControls = params.controlIds.filter((id) => !validControlIds.has(id));
    if (invalidControls.length > 0) {
      throw new Error(`Invalid controls: ${invalidControls.join(", ")}`);
    }

    const existingControls = await storage.getSystemControlsByOrg(params.organizationId);
    const existingSet = new Set(existingControls.map((c) => `${c.systemId}:${c.controlId}`));

    const items: { systemId: string; controlId: string }[] = [];
    for (const systemId of params.systemIds) {
      for (const controlId of params.controlIds) {
        const key = `${systemId}:${controlId}`;
        if (!existingSet.has(key)) {
          items.push({ systemId, controlId });
        }
      }
    }

    const created = await storage.bulkCreateSystemControlsForOrg(params.organizationId, items);
    return {
      created,
      total: created.length,
      skipped: params.systemIds.length * params.controlIds.length - created.length,
      invalidSystems,
      invalidControls,
    };
  }
}

export const controlService = new ControlService();
