import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { aiIncidents, type AiIncident, type InsertAiIncident } from "@shared/schema";
import { storage } from "../storage";
import { assertTenantAttribution } from "./tenantAttribution";

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

const incidentAssignmentRoleOrder = [
  "reviewer",
  "compliance_lead",
  "ciso",
  "cro",
  "system_owner",
  "admin",
  "owner",
] as const;

const incidentCategoryRolePreferences: Record<string, readonly string[]> = {
  bias: ["compliance_lead", "cro", "reviewer", "system_owner", "admin", "owner"],
  privacy: ["compliance_lead", "ciso", "reviewer", "system_owner", "admin", "owner"],
  security: ["ciso", "reviewer", "system_owner", "admin", "owner"],
  reliability: ["system_owner", "reviewer", "admin", "owner"],
  compliance: ["compliance_lead", "reviewer", "cro", "admin", "owner"],
  safety: ["reviewer", "cro", "compliance_lead", "system_owner", "admin", "owner"],
};

export type IncidentAssigneeCandidate = {
  userId: string;
  fullName: string;
  email: string | null;
  membershipRole: string;
  label: string;
};

type ResolvedIncidentAssignment = {
  owner: string;
  ownerUserId: string;
  ownerRole: string;
  escalatedTo: string;
};

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function formatMembershipRoleLabel(value: string) {
  return value.replace(/_/g, " ");
}

function normalizeComparableValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

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

  private normalizeRegulatoryNotifications(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as AiIncident["regulatoryNotifications"];
    }

    return value
      .map((entry) => {
        const record = getObjectRecord(entry);
        if (!record) return null;
        const authority = getStringValue(record.authority);
        if (!authority) return null;
        return {
          authority,
          status: getStringValue(record.status) ?? "planned",
          notes: getStringValue(record.notes),
          completedAt: getStringValue(record.completedAt),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }

  private normalizeIncidentRow(row: AiIncident): AiIncident {
    const playbook = getObjectRecord(row.playbook) ?? {};
    const postIncidentReview = getObjectRecord(row.postIncidentReview) ?? {};
    return {
      ...row,
      playbook,
      postIncidentReview,
      affectedDecisionTraceIds: getStringArray(row.affectedDecisionTraceIds),
      regulatoryNotifications: this.normalizeRegulatoryNotifications(row.regulatoryNotifications),
    };
  }

  private async getAssignableOwnerPool(organizationId: string): Promise<IncidentAssigneeCandidate[]> {
    const grouped = await Promise.all(
      incidentAssignmentRoleOrder.map(async (membershipRole) => ({
        membershipRole,
        users: await storage.getUsersByOrganizationRoles(organizationId, [membershipRole]),
      })),
    );

    const seen = new Set<string>();
    const candidates: IncidentAssigneeCandidate[] = [];

    for (const group of grouped) {
      for (const user of group.users) {
        if (seen.has(user.id)) {
          continue;
        }

        seen.add(user.id);
        const fullName = getStringValue(user.fullName) ?? user.username;
        candidates.push({
          userId: user.id,
          fullName,
          email: user.email ?? null,
          membershipRole: group.membershipRole,
          label: `${fullName} · ${formatMembershipRoleLabel(group.membershipRole)}`,
        });
      }
    }

    return candidates;
  }

  getAssignmentMetadata(playbook: unknown) {
    const playbookRecord = getObjectRecord(playbook);
    const assignment = getObjectRecord(playbookRecord?.assignment);
    if (!assignment) {
      return null;
    }

    return {
      ownerUserId: getStringValue(assignment.ownerUserId),
      owner: getStringValue(assignment.owner),
      ownerRole: getStringValue(assignment.ownerRole),
      assignedAt: getStringValue(assignment.assignedAt),
      autoAssigned: Boolean(assignment.autoAssigned),
    };
  }

  async listAssignableOwnersForOrg(organizationId: string) {
    const pool = await this.getAssignableOwnerPool(organizationId);
    return [...pool].sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async resolveDefaultAssignmentForOrg(
    organizationId: string,
    category: string,
    systemId?: string | null,
  ): Promise<ResolvedIncidentAssignment | null> {
    const pool = await this.getAssignableOwnerPool(organizationId);
    if (pool.length === 0) {
      return null;
    }

    const system = systemId ? await storage.getAiSystemById(organizationId, systemId) : null;
    const normalizedSystemOwner = normalizeComparableValue(system?.owner);
    if (normalizedSystemOwner) {
      const systemOwnerMatch = pool.find((candidate) => {
        const comparableValues = [
          normalizeComparableValue(candidate.fullName),
          normalizeComparableValue(candidate.email),
        ];
        return comparableValues.includes(normalizedSystemOwner);
      });

      if (systemOwnerMatch) {
        return {
          owner: systemOwnerMatch.fullName,
          ownerUserId: systemOwnerMatch.userId,
          ownerRole: systemOwnerMatch.membershipRole,
          escalatedTo: pool
            .filter((candidate) => candidate.userId !== systemOwnerMatch.userId)
            .slice(0, 3)
            .map((candidate) => candidate.fullName)
            .join(", ") || systemOwnerMatch.fullName,
        };
      }
    }

    const preferredRoles = incidentCategoryRolePreferences[category] ?? incidentAssignmentRoleOrder;
    const preferredCandidate =
      preferredRoles.flatMap((role) => pool.filter((candidate) => candidate.membershipRole === role))[0] ?? pool[0];
    const escalationAudience = [
      preferredCandidate.fullName,
      ...preferredRoles
        .flatMap((role) => pool.filter((candidate) => candidate.membershipRole === role))
        .map((candidate) => candidate.fullName),
    ];

    return {
      owner: preferredCandidate.fullName,
      ownerUserId: preferredCandidate.userId,
      ownerRole: preferredCandidate.membershipRole,
      escalatedTo: Array.from(new Set(escalationAudience)).slice(0, 3).join(", "),
    };
  }

  async listForOrg(organizationId: string, filters?: IncidentFilters) {
    const conditions = [eq(aiIncidents.organizationId, organizationId)];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(aiIncidents.status, filters.status));
    }
    if (filters?.severity && filters.severity !== "all") {
      conditions.push(eq(aiIncidents.severity, filters.severity));
    }

    const rows = await db
      .select()
      .from(aiIncidents)
      .where(and(...conditions))
      .orderBy(desc(aiIncidents.updatedAt), desc(aiIncidents.detectedAt));

    return rows.map((row) => this.normalizeIncidentRow(row));
  }

  async getForOrg(organizationId: string, incidentId: string) {
    const [row] = await db
      .select()
      .from(aiIncidents)
      .where(and(eq(aiIncidents.organizationId, organizationId), eq(aiIncidents.id, incidentId)))
      .limit(1);

    return row ? this.normalizeIncidentRow(row) : null;
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
    const [system, workflow] = await Promise.all([
      input.systemId ? storage.getAiSystemById(organizationId, input.systemId) : Promise.resolve(undefined),
      input.workflowId
        ? storage.getApprovalWorkflowById(organizationId, input.workflowId)
        : Promise.resolve(undefined),
    ]);
    assertTenantAttribution({
      subject: "Incident",
      requestedSystemId: input.systemId,
      requestedWorkflowId: input.workflowId,
      system,
      workflow,
    });

    const playbookTemplate = defaultPlaybooks[input.category] ?? defaultPlaybooks.reliability;
    const detectedAt = input.detectedAt ?? new Date();
    const dueAt = input.dueAt ?? new Date(detectedAt.getTime() + playbookTemplate.targetContainmentHours * 60 * 60 * 1000);
    const inputPlaybook = getObjectRecord(input.playbook) ?? {};
    const existingAssignment = getObjectRecord(inputPlaybook.assignment);
    const resolvedAssignment =
      existingAssignment || input.owner
        ? null
        : await this.resolveDefaultAssignmentForOrg(organizationId, input.category, input.systemId ?? null);

    const mergedPlaybook = {
      ...playbookTemplate,
      ...inputPlaybook,
      ...(existingAssignment
        ? { assignment: existingAssignment }
        : resolvedAssignment
          ? {
              assignment: {
                autoAssigned: true,
                ownerUserId: resolvedAssignment.ownerUserId,
                owner: resolvedAssignment.owner,
                ownerRole: resolvedAssignment.ownerRole,
                assignedAt: new Date().toISOString(),
              },
            }
          : {}),
    };

    const [created] = await db
      .insert(aiIncidents)
      .values({
        ...input,
        organizationId,
        detectedAt,
        dueAt,
        playbook: mergedPlaybook,
        rootCause: input.rootCause ?? null,
        postIncidentReview: input.postIncidentReview ?? {},
        affectedDecisionTraceIds: input.affectedDecisionTraceIds ?? [],
        regulatoryNotifications: input.regulatoryNotifications ?? [],
        owner: input.owner ?? resolvedAssignment?.owner ?? null,
        escalatedTo: input.escalatedTo ?? resolvedAssignment?.escalatedTo ?? null,
        updatedAt: new Date(),
      })
      .returning();

    return this.normalizeIncidentRow(created);
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

    return updated ? this.normalizeIncidentRow(updated) : undefined;
  }
}

export const incidentService = new IncidentService();
