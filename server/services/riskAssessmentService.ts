import { storage } from "../storage";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export interface CreateRiskAssessmentInput {
  systemId?: string | null;
  systemName: string;
  answers: any;
  riskOutcome: string;
  riskScore: number;
  riskExplanation: string;
  suggestedControls?: unknown;
}

export class RiskAssessmentService {
  async listAssessments(params: { organizationId: string; actor: Actor }) {
    return storage.getRiskAssessmentsByOrg(params.organizationId);
  }

  async listAssessmentsBySystem(params: { organizationId: string; actor: Actor; systemId: string }) {
    return storage.getRiskAssessmentsBySystemForOrg(params.organizationId, params.systemId);
  }

  async createAssessment(params: {
    organizationId: string;
    actor: Actor;
    input: CreateRiskAssessmentInput;
  }) {
    if (params.input.systemId) {
      const system = await storage.getAiSystemById(params.organizationId, params.input.systemId);
      if (!system) {
        throw new Error("System not found");
      }
    }

    return storage.createRiskAssessmentForOrg(params.organizationId, {
      systemId: params.input.systemId ?? null,
      systemName: params.input.systemName,
      answers: params.input.answers,
      riskOutcome: params.input.riskOutcome,
      riskScore: params.input.riskScore,
      riskExplanation: params.input.riskExplanation,
      suggestedControls: params.input.suggestedControls ?? null,
      completedBy: params.actor.fullName,
    });
  }

  async updateLinkedSystemRisk(params: {
    organizationId: string;
    actor: Actor;
    systemId: string;
    riskLevel: string;
  }) {
    return storage.updateAiSystemByOrg(params.organizationId, params.systemId, { riskLevel: params.riskLevel });
  }
}

export const riskAssessmentService = new RiskAssessmentService();
