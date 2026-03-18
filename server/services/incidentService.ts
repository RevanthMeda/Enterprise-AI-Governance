import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { aiIncidents, type AiIncident, type InsertAiIncident } from "@shared/schema";

type IncidentFilters = {
  status?: string;
  severity?: string;
};

const defaultPlaybooks: Record<string, { targetContainmentHours: number; steps: string[] }> = {
  bias: {
    targetContainmentHours: 4,
    steps: [
      "Freeze impacted workflow and preserve prompt/output evidence.",
      "Assign reviewer and affected business owner.",
      "Run bias review across impacted cohorts and decision samples.",
      "Approve containment and remediation before resuming automation.",
    ],
  },
  security: {
    targetContainmentHours: 4,
    steps: [
      "Disable affected connector, model endpoint, or secret.",
      "Preserve logs and scope impacted records.",
      "Escalate to security lead and incident commander.",
      "Document eradication and recovery actions before reopening.",
    ],
  },
  privacy: {
    targetContainmentHours: 4,
    steps: [
      "Pause impacted processing path.",
      "Identify exposed records and downstream copies.",
      "Escalate to privacy and security owners.",
      "Document notification obligations and remediation path.",
    ],
  },
  reliability: {
    targetContainmentHours: 8,
    steps: [
      "Capture failing prompt/input sequence and model metadata.",
      "Rollback or route traffic to a safe fallback path.",
      "Notify service owners and affected reviewers.",
      "Track fix validation and reopen criteria.",
    ],
  },
  compliance: {
    targetContainmentHours: 12,
    steps: [
      "Quarantine non-compliant decision path.",
      "Confirm control or policy gap with compliance lead.",
      "Issue corrective action and owner.",
      "Record evidence before closing the incident.",
    ],
  },
  safety: {
    targetContainmentHours: 4,
    steps: [
      "Suspend impacted AI-assisted action path.",
      "Escalate to risk, product, and safety owners.",
      "Review human override and user impact evidence.",
      "Require approval for resumption and postmortem follow-up.",
    ],
  },
};

export class IncidentService {
  private hasReviewContent(input: Partial<Omit<InsertAiIncident, "organizationId">>) {
    const review =
      input.postIncidentReview && typeof input.postIncidentReview === "object" && !Array.isArray(input.postIncidentReview)
        ? (input.postIncidentReview as Record<string, unknown>)
        : null;
    return Boolean(
      (typeof input.rootCause === "string" && input.rootCause.trim()) ||
        (review && Object.keys(review).length > 0) ||
        (Array.isArray(input.regulatoryNotifications) && input.regulatoryNotifications.length > 0),
    );
  }

  async listForOrg(organizationId: string, filters?: IncidentFilters) {
    const conditions = [eq(aiIncidents.organizationId, organizationId)];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(aiIncidents.status, filters.status));
    }
    if (filters?.severity && filters.severity !== "all") {
      conditions.push(eq(aiIncidents.severity, filters.severity));
    }

    return db
      .select()
      .from(aiIncidents)
      .where(and(...conditions))
      .orderBy(desc(aiIncidents.updatedAt), desc(aiIncidents.detectedAt));
  }

  async getSummaryForOrg(organizationId: string) {
    const [summary] = await db
      .select({
        total: sql<number>`count(*)::int`,
        open: sql<number>`count(*) filter (where ${aiIncidents.status} = 'open')::int`,
        highSeverity: sql<number>`count(*) filter (where ${aiIncidents.severity} in ('critical', 'high'))::int`,
        breached: sql<number>`count(*) filter (where ${aiIncidents.status} not in ('resolved', 'postmortem') and ${aiIncidents.dueAt} is not null and ${aiIncidents.dueAt} < now())::int`,
        postmortemPending: sql<number>`count(*) filter (where ${aiIncidents.status} = 'resolved' and ${aiIncidents.postmortemCompletedAt} is null)::int`,
      })
      .from(aiIncidents)
      .where(eq(aiIncidents.organizationId, organizationId));

    return {
      total: summary?.total ?? 0,
      open: summary?.open ?? 0,
      highSeverity: summary?.highSeverity ?? 0,
      breached: summary?.breached ?? 0,
      postmortemPending: summary?.postmortemPending ?? 0,
    };
  }

  async createForOrg(organizationId: string, input: Omit<InsertAiIncident, "organizationId">): Promise<AiIncident> {
    const playbookTemplate = defaultPlaybooks[input.category] ?? defaultPlaybooks.reliability;
    const detectedAt = input.detectedAt ?? new Date();
    const dueAt = input.dueAt ?? new Date(detectedAt.getTime() + playbookTemplate.targetContainmentHours * 60 * 60 * 1000);

    const [created] = await db
      .insert(aiIncidents)
      .values({
        ...input,
        organizationId,
        detectedAt,
        dueAt,
        playbook: input.playbook ?? playbookTemplate,
        rootCause: input.rootCause ?? null,
        postIncidentReview: input.postIncidentReview ?? {},
        affectedDecisionTraceIds: input.affectedDecisionTraceIds ?? [],
        regulatoryNotifications: input.regulatoryNotifications ?? [],
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  async updateForOrg(
    organizationId: string,
    incidentId: string,
    input: Partial<Omit<InsertAiIncident, "organizationId">>,
  ) {
    if (input.status === "postmortem" && !this.hasReviewContent(input)) {
      const error = new Error("Postmortem completion requires root cause, review notes, or regulatory notification records.") as Error & { status?: number };
      error.status = 400;
      throw error;
    }

    const [updated] = await db
      .update(aiIncidents)
      .set({
        ...input,
        ...(input.status === "contained" && !input.containedAt ? { containedAt: new Date() } : {}),
        ...(input.status === "resolved" && !input.resolvedAt ? { resolvedAt: new Date() } : {}),
        ...(input.status === "postmortem" && !input.postmortemCompletedAt ? { postmortemCompletedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(aiIncidents.organizationId, organizationId), eq(aiIncidents.id, incidentId)))
      .returning();

    return updated;
  }
}

export const incidentService = new IncidentService();
