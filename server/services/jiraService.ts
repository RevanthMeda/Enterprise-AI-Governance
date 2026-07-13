import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  jiraIntegrations,
  approvalWorkflows,
  type ApprovalWorkflow,
  type InsertJiraIntegration,
  type JiraIntegration,
} from "@shared/schema";
import { getSanitizedOutboundErrorMessage, safeOutboundFetch } from "../safe-outbound-http";
import {
  PersistedSecretError,
  encryptPersistedSecret,
  integrationSecretPurpose,
  mergePersistedSecret,
  resolvePersistedSecret,
  hasPersistedCredential,
} from "../persisted-secret";
import { assertCredentialOriginPreserved } from "../credential-origin";
import {
  jiraIntegrationClientView,
  type JiraIntegrationClientView,
} from "../integration-credential-views";

const JIRA_REQUEST_TIMEOUT_MS = 10_000;
const JIRA_MAX_RESPONSE_BYTES = 512 * 1024;

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

type JiraRemoteStatus = {
  name: string | null;
  category: string | null;
};

type JiraIntegrationPatch = Omit<InsertJiraIntegration, "organizationId" | "apiToken"> & {
  apiToken?: string | null;
  clearApiToken?: boolean;
};

export class JiraService {
  private async getStoredIntegration(organizationId: string) {
    const [integration] = await db
      .select()
      .from(jiraIntegrations)
      .where(eq(jiraIntegrations.organizationId, organizationId));

    return integration ?? null;
  }

  private async tryMigrateLegacyToken(integration: JiraIntegration): Promise<void> {
    const purpose = integrationSecretPurpose.jiraApiToken(integration.organizationId);
    const resolved = resolvePersistedSecret(integration.apiToken, purpose);
    const legacyValue = integration.apiToken;
    if (!resolved.isLegacyPlaintext || !resolved.plaintext || !legacyValue) return;

    let encrypted: string;
    try {
      encrypted = encryptPersistedSecret(resolved.plaintext, purpose);
    } catch (error) {
      if (error instanceof PersistedSecretError) return;
      throw error;
    }

    await db
      .update(jiraIntegrations)
      .set({ apiToken: encrypted, updatedAt: new Date() })
      .where(and(eq(jiraIntegrations.id, integration.id), eq(jiraIntegrations.apiToken, legacyValue)));
  }

  private async getResolvedIntegration(organizationId: string): Promise<JiraIntegration | null> {
    const integration = await this.getStoredIntegration(organizationId);
    if (!integration) return null;
    const resolved = resolvePersistedSecret(
      integration.apiToken,
      integrationSecretPurpose.jiraApiToken(organizationId),
    );
    if (resolved.isLegacyPlaintext) await this.tryMigrateLegacyToken(integration);
    return { ...integration, apiToken: resolved.plaintext };
  }

  async getIntegration(organizationId: string): Promise<JiraIntegrationClientView | null> {
    const integration = await this.getStoredIntegration(organizationId);
    if (!integration) return null;
    await this.tryMigrateLegacyToken(integration);
    return jiraIntegrationClientView(integration);
  }

  async upsertIntegration(organizationId: string, input: JiraIntegrationPatch) {
    const existing = await this.getStoredIntegration(organizationId);
    assertCredentialOriginPreserved({
      label: "Jira API",
      currentUrl: existing?.baseUrl,
      nextUrl: input.baseUrl,
      hasCurrentCredential: hasPersistedCredential(existing?.apiToken),
      replacementCredential: input.apiToken,
      clearCredential: input.clearApiToken,
    });
    const apiToken = mergePersistedSecret({
      currentValue: existing?.apiToken,
      nextValue: input.apiToken,
      clear: input.clearApiToken,
      purpose: integrationSecretPurpose.jiraApiToken(organizationId),
    });
    const { clearApiToken: _clearApiToken, apiToken: _incomingApiToken, ...nonSecretInput } = input;
    if (existing) {
      const [updated] = await db
        .update(jiraIntegrations)
        .set({ ...nonSecretInput, apiToken, updatedAt: new Date() })
        .where(eq(jiraIntegrations.organizationId, organizationId))
        .returning();
      return jiraIntegrationClientView(updated);
    }

    const [created] = await db
      .insert(jiraIntegrations)
      .values({ ...nonSecretInput, apiToken, organizationId })
      .returning();
    return jiraIntegrationClientView(created);
  }

  async testConnection(organizationId: string) {
    const integration = await this.getResolvedIntegration(organizationId);
    if (!integration || !integration.enabled || !integration.baseUrl || !integration.projectKey || !integration.userEmail || !integration.apiToken) {
      return { ok: false, message: "Integration is not fully configured" };
    }

    try {
      const baseUrl = trimTrailingSlash(integration.baseUrl);
      const response = await safeOutboundFetch(`${baseUrl}/rest/api/3/project/${integration.projectKey}`, {
        timeoutMs: JIRA_REQUEST_TIMEOUT_MS,
        maxResponseBytes: JIRA_MAX_RESPONSE_BYTES,
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
        return {
          ok: false,
          message: `Jira test failed with status ${response.status}`,
          integration: jiraIntegrationClientView(updated),
        };
      }

      await response.json().catch(() => ({}));
      return {
        ok: true,
        message: `Connected to project ${integration.projectKey}`,
        integration: jiraIntegrationClientView(updated),
      };
    } catch (error) {
      return {
        ok: false,
        message: getSanitizedOutboundErrorMessage(error, "Jira connection test failed"),
      };
    }
  }

  async syncWorkflowIfNeeded(input: JiraSyncInput) {
    const qualifies =
      input.workflow.priority === "high" ||
      input.workflow.priority === "critical" ||
      input.systemRiskLevel === "high" ||
      input.systemRiskLevel === "unacceptable";
    if (!qualifies) {
      return { status: "skipped" as const };
    }

    if (input.workflow.jiraIssueKey) {
      return { status: "linked" as const, issueKey: input.workflow.jiraIssueKey, issueUrl: input.workflow.jiraIssueUrl };
    }

    const integration = await this.getResolvedIntegration(input.organizationId);
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
          summary: `[AI CONTROL GRID] ${input.workflow.title}`,
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

      const response = await safeOutboundFetch(`${baseUrl}/rest/api/3/issue`, {
        method: "POST",
        timeoutMs: JIRA_REQUEST_TIMEOUT_MS,
        maxResponseBytes: JIRA_MAX_RESPONSE_BYTES,
        headers: {
          Authorization: buildAuthHeader(integration.userEmail, integration.apiToken),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(issuePayload),
      });

      if (!response.ok) {
        const [updated] = await db
          .update(approvalWorkflows)
          .set({ jiraSyncStatus: "error", updatedAt: new Date() })
          .where(and(eq(approvalWorkflows.organizationId, input.organizationId), eq(approvalWorkflows.id, input.workflow.id)))
          .returning();
        return { status: "error" as const, message: `Jira sync failed with status ${response.status}`, workflow: updated };
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
      const message = getSanitizedOutboundErrorMessage(error, "Jira sync failed");
      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraSyncStatus: "error", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, input.organizationId), eq(approvalWorkflows.id, input.workflow.id)))
        .returning();
      return { status: "error" as const, message, workflow: updated };
    }
  }

  async refreshWorkflowIssueStatus(organizationId: string, workflow: ApprovalWorkflow) {
    if (!workflow.jiraIssueKey) {
      return {
        status: "not_linked" as const,
        message: "Workflow does not have a linked Jira issue",
        workflow,
      };
    }

    const integration = await this.getResolvedIntegration(organizationId);
    if (!integration || !integration.enabled || !integration.baseUrl || !integration.userEmail || !integration.apiToken) {
      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraSyncStatus: "not_configured", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, organizationId), eq(approvalWorkflows.id, workflow.id)))
        .returning();
      return {
        status: "not_configured" as const,
        message: "Jira integration is not fully configured",
        workflow: updated,
      };
    }

    try {
      const baseUrl = trimTrailingSlash(integration.baseUrl);
      const response = await safeOutboundFetch(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(workflow.jiraIssueKey)}?fields=status`,
        {
          timeoutMs: JIRA_REQUEST_TIMEOUT_MS,
          maxResponseBytes: JIRA_MAX_RESPONSE_BYTES,
          headers: {
            Authorization: buildAuthHeader(integration.userEmail, integration.apiToken),
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        const [updated] = await db
          .update(approvalWorkflows)
          .set({ jiraSyncStatus: "error", updatedAt: new Date() })
          .where(and(eq(approvalWorkflows.organizationId, organizationId), eq(approvalWorkflows.id, workflow.id)))
          .returning();
        return {
          status: "error" as const,
          message: `Jira status refresh failed with status ${response.status}`,
          workflow: updated,
        };
      }

      const payload = await response.json().catch(() => ({}));
      const remoteStatus: JiraRemoteStatus = {
        name: typeof payload?.fields?.status?.name === "string" ? payload.fields.status.name : null,
        category:
          typeof payload?.fields?.status?.statusCategory?.name === "string"
            ? payload.fields.status.statusCategory.name
            : null,
      };

      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraSyncStatus: "linked", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, organizationId), eq(approvalWorkflows.id, workflow.id)))
        .returning();

      await db
        .update(jiraIntegrations)
        .set({ lastSyncAt: new Date(), updatedAt: new Date() })
        .where(eq(jiraIntegrations.organizationId, organizationId));

      return {
        status: "linked" as const,
        issueKey: workflow.jiraIssueKey,
        issueUrl: workflow.jiraIssueUrl,
        remoteStatus,
        workflow: updated,
      };
    } catch (error) {
      const message = getSanitizedOutboundErrorMessage(error, "Jira status refresh failed");
      const [updated] = await db
        .update(approvalWorkflows)
        .set({ jiraSyncStatus: "error", updatedAt: new Date() })
        .where(and(eq(approvalWorkflows.organizationId, organizationId), eq(approvalWorkflows.id, workflow.id)))
        .returning();
      return { status: "error" as const, message, workflow: updated };
    }
  }
}

export const jiraService = new JiraService();
