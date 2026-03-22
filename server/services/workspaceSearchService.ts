import { decisionAuditService } from "./decisionAuditService";
import { incidentService } from "./incidentService";
import { storage } from "../storage";
import type { WorkspaceSearchResult } from "@shared/workspace-search";

type SearchParams = {
  organizationId: string;
  membershipRole: string;
  query: string;
};

const REGISTRY_ROLES = new Set(["owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"]);
const GOVERNANCE_ROLES = new Set(["owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"]);

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function includesQuery(query: string, ...parts: Array<string | null | undefined>) {
  const haystack = parts.map((part) => normalizeSearchText(part)).join(" ");
  return haystack.includes(query);
}

function limitResults<T>(items: T[], max = 5) {
  return items.slice(0, max);
}

export class WorkspaceSearchService {
  async search(params: SearchParams): Promise<WorkspaceSearchResult[]> {
    const normalizedQuery = normalizeSearchText(params.query);
    if (normalizedQuery.length < 2) {
      return [];
    }

    const results: WorkspaceSearchResult[] = [];

    if (REGISTRY_ROLES.has(params.membershipRole)) {
      const systems = await storage.getAiSystemsByOrg(params.organizationId, { search: normalizedQuery });
      results.push(
        ...limitResults(systems).map((system) => ({
          kind: "system" as const,
          id: system.id,
          title: system.name,
          subtitle: `System · ${system.department} · ${system.owner}`,
          href: `/systems/${system.id}`,
          meta: `${system.riskLevel} risk`,
        })),
      );
    }

    if (GOVERNANCE_ROLES.has(params.membershipRole)) {
      const [workflows, incidents, traces] = await Promise.all([
        storage.getApprovalWorkflowsByOrg(params.organizationId),
        incidentService.listForOrg(params.organizationId, { status: "all" }),
        decisionAuditService.listForOrg(params.organizationId),
      ]);

      results.push(
        ...limitResults(
          workflows.filter((workflow) =>
            includesQuery(
              normalizedQuery,
              workflow.title,
              workflow.description,
              workflow.requestedBy,
              workflow.reviewer,
              workflow.status,
              workflow.priority,
            ),
          ),
        ).map((workflow) => ({
          kind: "workflow" as const,
          id: workflow.id,
          title: workflow.title,
          subtitle: `Workflow · ${workflow.status.replace(/_/g, " ")} · requested by ${workflow.requestedBy}`,
          href: "/approvals",
          meta: workflow.priority ? `${workflow.priority} priority` : null,
        })),
      );

      results.push(
        ...limitResults(
          incidents.filter((incident) =>
            includesQuery(
              normalizedQuery,
              incident.title,
              incident.description,
              incident.category,
              incident.severity,
              incident.owner,
              incident.escalatedTo,
              incident.status,
            ),
          ),
        ).map((incident) => ({
          kind: "incident" as const,
          id: incident.id,
          title: incident.title,
          subtitle: `Incident · ${incident.severity} · ${incident.category}`,
          href: "/incidents",
          meta: incident.status,
        })),
      );

      results.push(
        ...limitResults(
          traces.filter((trace) =>
            includesQuery(
              normalizedQuery,
              trace.title,
              trace.businessObjective,
              trace.modelName,
              trace.outcomeSummary,
              trace.reviewedBy,
              trace.createdBy,
            ),
          ),
        ).map((trace) => ({
          kind: "decision_trace" as const,
          id: trace.id,
          title: trace.title,
          subtitle: `Decision trace · ${trace.modelName ?? "model unspecified"} · ${trace.documentationStatus}`,
          href: "/decision-trace",
          meta: trace.reviewedBy ? `Reviewed by ${trace.reviewedBy}` : null,
        })),
      );
    }

    return results.slice(0, 16);
  }
}

export const workspaceSearchService = new WorkspaceSearchService();
