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
  }

  private async ensureReviewerInOrg(organizationId: string, reviewer: string | null | undefined) {
    if (!reviewer) return;
    const reviewerUser = await this.findUserByNameOrUsername({ organizationId, identity: reviewer });
    if (!reviewerUser) {
      throw new Error("Reviewer is not an active user in the current organization");
    }
  }

  async createWorkflow(params: { organizationId: string; actor: Actor; input: InsertApprovalWorkflow }) {
    await this.ensureSystemInOrg(params.organizationId, params.input.systemId);
    await this.ensureReviewerInOrg(params.organizationId, params.input.reviewer);
    return storage.createApprovalWorkflowForOrg(params.organizationId, params.input);
  }

  async updateWorkflow(params: {
    organizationId: string;
    actor: Actor;
    workflowId: string;
    input: Partial<InsertApprovalWorkflow>;
  }) {
    if (params.input.systemId) {
      await this.ensureSystemInOrg(params.organizationId, params.input.systemId);
    }
    if (params.input.reviewer !== undefined) {
      await this.ensureReviewerInOrg(params.organizationId, params.input.reviewer);
    }
    return storage.updateApprovalWorkflowByOrg(params.organizationId, params.workflowId, params.input);
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
