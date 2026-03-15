import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { jiraIntegrations, approvalWorkflows, type ApprovalWorkflow, type InsertJiraIntegration } from "@shared/schema";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function buildAuthHeader(userEmail: string, apiToken: string) {
  return `Basic ${Buffer.from(`${userEmail}:${apiToken}`).toString("base64")}`;
}

type JiraSyncInput = {
  organizationId: string;
  workflow: ApprovalWorkflow;
  systemName: string;
  systemRiskLevel: string | null | undefined;
};

export class JiraService {
  async getIntegration(organizationId: string) {
    const [integration] = await db
      .select()
      .from(jiraIntegrations)
      .where(eq(jiraIntegrations.organizationId, organizationId));

    return integration ?? null;
  }

  async upsertIntegration(organizationId: string, input: Omit<InsertJiraIntegration, "organizationId">) {
    const existing = await this.getIntegration(organizationId);
    if (existing) {
      const [updated] = await db
        .update(jiraIntegrations)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(jiraIntegrations.organizationId, organizationId))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(jiraIntegrations)
      .values({ ...input, organizationId })
      .returning();
    return created;
  }

  async testConnection(organizationId: string) {
    const integration = await this.getIntegration(organizationId);
    if (!integration || !integration.enabled || !integration.baseUrl || !integration.projectKey || !integration.userEmail || !integration.apiToken) {
      return { ok: false, message: "Integration is not fully configured" };
    }

    const baseUrl = trimTrailingSlash(integration.baseUrl);
    const response = await fetch(`${baseUrl}/rest/api/3/project/${integration.projectKey}`, {
      headers: {
        Authorization: buildAuthHeader(integration.userEmail, integration.apiToken),
        Accept: "application/json",
      },
    });

    const [updated] = await db
      .update(jiraIntegrations)
      .set({ lastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(jiraIntegrations.organizationId, organizationId))
      .returning();

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText);
      return {
        ok: false,
        message: text || `Jira test failed with status ${response.status}`,
        integration: updated,
      };
    }

    const payload = await response.json().catch(() => ({}));
    return {
      ok: true,
      message: `Connected to project ${payload?.key ?? integration.projectKey}`,
      integration: updated,
    };
  }

  async syncWorkflowIfNeeded(input: JiraSyncInput) {
    const qualifies = input.workflow.priority === "high" || input.systemRiskLevel === "high" || input.systemRiskLevel === "unacceptable";
    if (!qualifies) {
      return { status: "skipped" as const };
    }

    if (input.workflow.jiraIssueKey) {
      return { status: "linked" as const, issueKey: input.workflow.jiraIssueKey, issueUrl: input.workflow.jiraIssueUrl };
    }

    const integration = await this.getIntegration(input.organizationId);
    if (!integration || !integration.enabled || !integration.baseUrl || !integration.projectKey || !integration.userEmail || !integration.apiToken) {
      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraSyncStatus: "not_configured", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, input.organizationId), eq(approvalWorkflows.id, input.workflow.id)))
        .returning();
      return { status: "not_configured" as const, workflow: updated };
    }

    try {
      const baseUrl = trimTrailingSlash(integration.baseUrl);
      const issuePayload = {
        fields: {
          project: { key: integration.projectKey },
          summary: `[AI Control Tower] ${input.workflow.title}`,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: `Workflow ${input.workflow.title} requires attention for system ${input.systemName}. Risk level: ${input.systemRiskLevel ?? "unknown"}. Status: ${input.workflow.status}.`,
                  },
                ],
              },
            ],
          },
          issuetype: { name: integration.issueType || "Task" },
          labels: Array.isArray(integration.labels) ? integration.labels : [],
        },
      };

      const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
        method: "POST",
        headers: {
          Authorization: buildAuthHeader(integration.userEmail, integration.apiToken),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(issuePayload),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => response.statusText);
        const [updated] = await db
          .update(approvalWorkflows)
          .set({ jiraSyncStatus: "error", updatedAt: new Date() })
          .where(and(eq(approvalWorkflows.organizationId, input.organizationId), eq(approvalWorkflows.id, input.workflow.id)))
          .returning();
        return { status: "error" as const, message: text || `Jira sync failed with status ${response.status}`, workflow: updated };
      }

      const payload = await response.json().catch(() => ({}));
      const issueKey = typeof payload?.key === "string" ? payload.key : null;
      const issueUrl = issueKey ? `${baseUrl}/browse/${issueKey}` : null;

      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraIssueKey: issueKey, jiraIssueUrl: issueUrl, jiraSyncStatus: "linked", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, input.organizationId), eq(approvalWorkflows.id, input.workflow.id)))
        .returning();

      await db
        .update(jiraIntegrations)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(jiraIntegrations.organizationId, input.organizationId));

      return { status: "linked" as const, issueKey, issueUrl, workflow: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Jira sync failed";
      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraSyncStatus: "error", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, input.organizationId), eq(approvalWorkflows.id, input.workflow.id)))
        .returning();
      return { status: "error" as const, message, workflow: updated };
    }
  }
}

export const jiraService = new JiraService();
