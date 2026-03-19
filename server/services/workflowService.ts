import type { ApprovalWorkflowFilters } from "../storage";
import { storage } from "../storage";
import type { InsertApprovalWorkflow } from "@shared/schema";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class WorkflowService {
  private normalizeIdentity(value: string | null | undefined) {
    return (value ?? "").trim().toLowerCase();
  }

  private actorMatchesReviewer(actor: Actor, reviewer: string | null | undefined) {
    const normalizedReviewer = this.normalizeIdentity(reviewer);
    if (!normalizedReviewer) {
      return false;
    }

    return (
      this.normalizeIdentity(actor.fullName) === normalizedReviewer ||
      this.normalizeIdentity(actor.username) === normalizedReviewer
    );
  }

  private deriveRouting(input: InsertApprovalWorkflow, systemRiskLevel?: string | null) {
    const estimatedFinancialImpact = input.estimatedFinancialImpact ?? 0;
    const usesPii = Boolean(input.usesPii);
    const customerFacing = Boolean(input.customerFacing);
    const reversible = input.reversible ?? true;
    const strategicImpact = Boolean(input.strategicImpact);
    const safetyCritical = Boolean(input.safetyCritical);

    const normalizedRiskLevel = (systemRiskLevel ?? "").toLowerCase();
    const isHighRiskSystem = normalizedRiskLevel === "high";
    const isUnacceptableRiskSystem = normalizedRiskLevel === "unacceptable";

    if (
      estimatedFinancialImpact > 100000 ||
      strategicImpact ||
      safetyCritical ||
      !reversible ||
      isUnacceptableRiskSystem
    ) {
      return {
        decisionTier: "tier_3" as const,
        committeeType: "governance_committee_ceo" as const,
        requiredApprovers: ["governance_committee", "ceo"],
        blockedReason:
          "Tier 3 decision: Governance Committee and CEO approval required before execution.",
        status: "escalated" as const,
      };
    }

    if (estimatedFinancialImpact >= 10000 || usesPii || customerFacing || isHighRiskSystem) {
      return {
        decisionTier: "tier_2" as const,
        committeeType: "operations_committee" as const,
        requiredApprovers: ["operations_committee"],
        blockedReason: null,
        status: "pending" as const,
      };
    }

    return {
      decisionTier: "tier_1" as const,
      committeeType: "technical_team" as const,
      requiredApprovers: ["technical_team"],
      blockedReason: null,
      status: "approved" as const,
    };
  }

  async listWorkflows(params: { organizationId: string; actor: Actor; filters?: ApprovalWorkflowFilters }) {
    return storage.getApprovalWorkflowsByOrg(params.organizationId, params.filters);
  }

  async getWorkflow(params: { organizationId: string; actor: Actor; workflowId: string }) {
    return storage.getApprovalWorkflowById(params.organizationId, params.workflowId);
  }

  async getWorkflowsBySystem(params: { organizationId: string; actor: Actor; systemId: string }) {
    return storage.getApprovalWorkflowsBySystemForOrg(params.organizationId, params.systemId);
  }

  private async ensureSystemInOrg(organizationId: string, systemId: string) {
    const system = await storage.getAiSystemById(organizationId, systemId);
    if (!system) {
      throw new Error("Linked system not found in active organization");
    }
    return system;
  }

  private async ensureReviewerInOrg(organizationId: string, reviewer: string | null | undefined) {
    if (!reviewer) return;
    const reviewerUser = await this.findUserByNameOrUsername({ organizationId, identity: reviewer });
    if (!reviewerUser) {
      throw new Error("Reviewer is not an active user in the current organization");
    }
  }

  async createWorkflow(params: { organizationId: string; actor: Actor; input: InsertApprovalWorkflow }) {
    const system = await this.ensureSystemInOrg(params.organizationId, params.input.systemId);
    await this.ensureReviewerInOrg(params.organizationId, params.input.reviewer);
    const routing = this.deriveRouting(params.input, system.riskLevel);
    return storage.createApprovalWorkflowForOrg(params.organizationId, {
      ...params.input,
      decisionTier: routing.decisionTier,
      committeeType: routing.committeeType,
      requiredApprovers: routing.requiredApprovers,
      blockedReason: routing.blockedReason,
      status: params.input.status ?? routing.status,
    });
  }

  async updateWorkflow(params: {
    organizationId: string;
    actor: Actor;
    workflowId: string;
    input: Partial<InsertApprovalWorkflow>;
  }) {
    const existing = await storage.getApprovalWorkflowById(params.organizationId, params.workflowId);
    if (!existing) {
      return null;
    }

    let systemRiskLevel: string | null | undefined = null;
    if (params.input.systemId) {
      const system = await this.ensureSystemInOrg(params.organizationId, params.input.systemId);
      systemRiskLevel = system.riskLevel;
    }
    if (params.input.reviewer !== undefined) {
      await this.ensureReviewerInOrg(params.organizationId, params.input.reviewer);
    }

    const merged = {
      ...existing,
      ...params.input,
      estimatedFinancialImpact:
        params.input.estimatedFinancialImpact ?? existing.estimatedFinancialImpact ?? 0,
      usesPii: params.input.usesPii ?? existing.usesPii ?? false,
      customerFacing: params.input.customerFacing ?? existing.customerFacing ?? false,
      reversible: params.input.reversible ?? existing.reversible ?? true,
      strategicImpact: params.input.strategicImpact ?? existing.strategicImpact ?? false,
      safetyCritical: params.input.safetyCritical ?? existing.safetyCritical ?? false,
    };

    const resolvedSystemRiskLevel =
      systemRiskLevel ??
      (await storage.getAiSystemById(params.organizationId, merged.systemId))?.riskLevel ??
      null;
    const routing = this.deriveRouting(merged as InsertApprovalWorkflow, resolvedSystemRiskLevel);

    const nextStatus = params.input.status ?? existing.status ?? routing.status;
    const statusChanged = params.input.status !== undefined && params.input.status !== existing.status;
    const requiresAssignedReviewerAction =
      statusChanged && ["in_review", "approved", "rejected"].includes(nextStatus);

    if (requiresAssignedReviewerAction) {
      const assignedReviewer = params.input.reviewer ?? existing.reviewer;
      if (!assignedReviewer) {
        const error = new Error(
          "Assign a reviewer before starting review, approving, or rejecting this workflow.",
        ) as Error & { status?: number };
        error.status = 409;
        throw error;
      }

      if (!this.actorMatchesReviewer(params.actor, assignedReviewer)) {
        const error = new Error(
          "Only the assigned reviewer can start review, approve, or reject this workflow.",
        ) as Error & { status?: number };
        error.status = 403;
        throw error;
      }
    }

    if (routing.decisionTier === "tier_3" && nextStatus === "approved") {
      const error = new Error(
        "Tier 3 decisions require Governance Committee + CEO approval and cannot be approved from the standard workflow action.",
      ) as Error & { status?: number };
      error.status = 403;
      throw error;
    }

    return storage.updateApprovalWorkflowByOrg(params.organizationId, params.workflowId, {
      ...params.input,
      decisionTier: routing.decisionTier,
      committeeType: routing.committeeType,
      requiredApprovers: routing.requiredApprovers,
      blockedReason: routing.blockedReason,
      status: nextStatus,
    });
  }

  async deleteWorkflow(params: { organizationId: string; actor: Actor; workflowId: string }) {
    return storage.deleteApprovalWorkflowByOrg(params.organizationId, params.workflowId);
  }

  async findUserByNameOrUsername(params: {
    organizationId: string;
    identity: string;
  }) {
    const users = await storage.getUsersByOrganization(params.organizationId);
    return users.find((u) => u.fullName === params.identity || u.username === params.identity);
  }
}

export const workflowService = new WorkflowService();
