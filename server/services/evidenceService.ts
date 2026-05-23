import { storage, type EvidenceFileFilters } from "../storage";
import { agentGovernanceService } from "./agentGovernanceService";
import {
  compileLawPackRuntimeOverlay,
} from "@shared/law-packs";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export interface CreateEvidenceInput {
  systemId: string;
  controlId?: string | null;
  workflowId?: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  metadata?: Record<string, unknown>;
}

export class EvidenceService {
  async listEvidence(params: {
    organizationId: string;
    actor: Actor;
    filters?: EvidenceFileFilters;
  }) {
    return storage.getEvidenceFilesByOrg(params.organizationId, params.filters);
  }

  async getEvidenceFile(params: { organizationId: string; actor: Actor; evidenceId: string }) {
    return storage.getEvidenceFileByIdForOrg(params.organizationId, params.evidenceId);
  }

  async createEvidence(params: {
    organizationId: string;
    actor: Actor;
    input: CreateEvidenceInput;
  }) {
    const system = await storage.getAiSystemById(params.organizationId, params.input.systemId);
    if (!system) {
      throw new Error("System not found");
    }

    if (params.input.controlId) {
      const linkedControl = await storage.getSystemControlBySystemAndControlForOrg(
        params.organizationId,
        params.input.systemId,
        params.input.controlId,
      );
      if (!linkedControl) {
        throw new Error("Control not linked to this system in the active organization");
      }
    }

    let effectiveGovernanceScope = await agentGovernanceService.resolveEffectiveScope({
      organizationId: params.organizationId,
      system,
      actor: params.actor,
    });

    if (params.input.workflowId) {
      const workflow = await storage.getApprovalWorkflowById(params.organizationId, params.input.workflowId);
      if (!workflow || workflow.systemId !== params.input.systemId) {
        throw new Error("Workflow not found for this system in the active organization");
      }
      effectiveGovernanceScope = await agentGovernanceService.resolveEffectiveScope({
        organizationId: params.organizationId,
        system,
        workflow,
        actor: params.actor,
      });
    }

    const overlay = compileLawPackRuntimeOverlay(effectiveGovernanceScope.lawPackIdsApplied);

    return storage.createEvidenceFileForOrg(params.organizationId, {
      systemId: params.input.systemId,
      controlId: params.input.controlId ?? null,
      workflowId: params.input.workflowId ?? null,
      fileName: params.input.fileName,
      fileSize: params.input.fileSize,
      mimeType: params.input.mimeType,
      filePath: params.input.filePath,
      uploadedBy: params.actor.fullName,
      metadata: {
        ...(params.input.metadata ?? {}),
        legalProfileApplied: effectiveGovernanceScope.legalProfileApplied,
        lawPackIdsApplied: effectiveGovernanceScope.lawPackIdsApplied,
        governanceScopeSource: effectiveGovernanceScope.source,
        lawPackDecisionConstraints: overlay.decisionConstraints,
        lawPackSources: overlay.sourceRefs,
      },
    });
  }

  async deleteEvidence(params: { organizationId: string; actor: Actor; evidenceId: string }) {
    await storage.deleteEvidenceFileForOrg(params.organizationId, params.evidenceId);
  }
}

export const evidenceService = new EvidenceService();
