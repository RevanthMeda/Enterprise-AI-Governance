import { createHash } from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import {
  decisionAudits,
  decisionAuditVersions,
  type ApprovalWorkflow,
  type DecisionAudit,
  type DecisionAuditVersion,
  type InsertDecisionAudit,
} from "@shared/schema";

type DecisionAuditFilters = {
  systemId?: string;
  workflowId?: string;
};

type DecisionAuditUpdateInput = Partial<Omit<InsertDecisionAudit, "organizationId">> & {
  actorName?: string | null;
  versionReason?: string | null;
};

function buildOverrideDiff(aiOutput: string, humanOutput: string | null | undefined) {
  if (!humanOutput || humanOutput === aiOutput) {
    return null;
  }

  const before = aiOutput.split(/\r?\n/);
  const after = humanOutput.split(/\r?\n/);
  const maxLines = Math.max(before.length, after.length);
  const changes: string[] = [];

  for (let index = 0; index < maxLines; index += 1) {
    const prev = before[index] ?? "";
    const next = after[index] ?? "";
    if (prev === next) continue;
    if (prev) {
      changes.push(`- ${prev}`);
    }
    if (next) {
      changes.push(`+ ${next}`);
    }
  }

  return changes.slice(0, 20).join("\n");
}

function buildDecisionRecordHash(input: {
  organizationId: string;
  systemId: string;
  workflowId: string | null;
  title: string;
  businessObjective: string | null;
  decisionContext: string;
  modelName: string | null;
  modelVersion: string | null;
  promptText: string | null;
  inputSources: unknown;
  inputSnapshot: unknown;
  decisionConstraints: unknown;
  aiOutput: string;
  humanOutput: string | null;
  overrideDiff: string | null;
  overrideRationale: string | null;
  confidenceScore: number | null;
  uncertaintyScore: number | null;
  explainabilityFactors: unknown;
  outcome30d: unknown;
  outcome60d: unknown;
  outcome90d: unknown;
  outcomeSummary: string | null;
  createdBy: string;
  reviewedBy: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        organizationId: input.organizationId,
        systemId: input.systemId,
        workflowId: input.workflowId,
        title: input.title,
        businessObjective: input.businessObjective,
        decisionContext: input.decisionContext,
        modelName: input.modelName,
        modelVersion: input.modelVersion,
        promptText: input.promptText,
        inputSources: input.inputSources,
        inputSnapshot: input.inputSnapshot,
        decisionConstraints: input.decisionConstraints,
        aiOutput: input.aiOutput,
        humanOutput: input.humanOutput,
        overrideDiff: input.overrideDiff,
        overrideRationale: input.overrideRationale,
        confidenceScore: input.confidenceScore,
        uncertaintyScore: input.uncertaintyScore,
        explainabilityFactors: input.explainabilityFactors,
        outcome30d: input.outcome30d,
        outcome60d: input.outcome60d,
        outcome90d: input.outcome90d,
        outcomeSummary: input.outcomeSummary,
        createdBy: input.createdBy,
        reviewedBy: input.reviewedBy,
      }),
    )
    .digest("hex");
}

function buildWorkflowDecisionContext(workflow: ApprovalWorkflow, systemRiskLevel: string | null) {
  return [
    `Workflow title: ${workflow.title}`,
    workflow.description ? `Business context: ${workflow.description}` : null,
    `Priority: ${workflow.priority}`,
    `Requested by: ${workflow.requestedBy}`,
    workflow.reviewer ? `Reviewer: ${workflow.reviewer}` : null,
    `Decision tier: ${workflow.decisionTier}`,
    `Committee: ${workflow.committeeType}`,
    `Estimated impact: $${Number(workflow.estimatedFinancialImpact ?? 0).toLocaleString()}`,
    `System risk level: ${systemRiskLevel ?? "unknown"}`,
    workflow.usesPii ? "Uses PII: yes" : "Uses PII: no",
    workflow.customerFacing ? "Customer-facing: yes" : "Customer-facing: no",
    workflow.reversible === false ? "Reversible: no" : "Reversible: yes",
    workflow.strategicImpact ? "Strategic impact: yes" : "Strategic impact: no",
    workflow.safetyCritical ? "Safety-critical: yes" : "Safety-critical: no",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildWorkflowAiOutput(workflow: ApprovalWorkflow) {
  const committee = workflow.committeeType?.replace(/_/g, " ") ?? "technical team";
  const tier = workflow.decisionTier?.replace("_", " ") ?? "tier 1";
  return `Routing engine classified this workflow as ${tier} and assigned it to ${committee}. Current workflow status: ${workflow.status}.`;
}

const VERSIONED_FIELDS: Array<keyof DecisionAudit> = [
  "title",
  "systemId",
  "workflowId",
  "businessObjective",
  "decisionContext",
  "modelName",
  "modelVersion",
  "promptText",
  "inputSources",
  "inputSnapshot",
  "decisionConstraints",
  "aiOutput",
  "humanOutput",
  "overrideDiff",
  "overrideRationale",
  "confidenceScore",
  "uncertaintyScore",
  "explainabilityFactors",
  "documentationStatus",
  "retentionUntil",
  "outcome30d",
  "outcome60d",
  "outcome90d",
  "outcomeSummary",
  "reviewedBy",
];

function serializeComparableValue(value: unknown) {
  return JSON.stringify(value ?? null);
}

function sanitizeStructuredValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeStructuredValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, entry]) => {
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        return acc;
      }
      acc[key] = sanitizeStructuredValue(entry);
      return acc;
    }, {});
  }

  return value;
}

function hasMaterialChanges(current: DecisionAudit, next: DecisionAudit) {
  return VERSIONED_FIELDS.some((field) => serializeComparableValue(current[field]) !== serializeComparableValue(next[field]));
}

export class DecisionAuditService {
  private async ensureLinkedEntitiesExist(
    organizationId: string,
    input: { systemId: string; workflowId?: string | null },
  ) {
    const system = await storage.getAiSystemById(organizationId, input.systemId);
    if (!system) {
      const error = new Error("Linked system not found in active organization") as Error & { status?: number };
      error.status = 404;
      throw error;
    }

    if (input.workflowId) {
      const workflow = await storage.getApprovalWorkflowById(organizationId, input.workflowId);
      if (!workflow) {
        const error = new Error("Linked workflow not found in active organization") as Error & { status?: number };
        error.status = 404;
        throw error;
      }
      if (workflow.systemId !== input.systemId) {
        const error = new Error("Linked workflow does not belong to the selected system") as Error & { status?: number };
        error.status = 409;
        throw error;
      }
    }
  }

  async listForOrg(organizationId: string, filters?: DecisionAuditFilters) {
    const conditions = [eq(decisionAudits.organizationId, organizationId)];
    if (filters?.systemId) {
      conditions.push(eq(decisionAudits.systemId, filters.systemId));
    }
    if (filters?.workflowId) {
      conditions.push(eq(decisionAudits.workflowId, filters.workflowId));
    }

    return db
      .select()
      .from(decisionAudits)
      .where(and(...conditions))
      .orderBy(desc(decisionAudits.createdAt));
  }

  async getSummaryForOrg(organizationId: string) {
    const [totals] = await db
      .select({
        total: sql<number>`count(*)::int`,
        overrides: sql<number>`count(*) filter (where ${decisionAudits.humanOutput} is not null and ${decisionAudits.humanOutput} <> ${decisionAudits.aiOutput})::int`,
        outcomesTracked: sql<number>`count(*) filter (where ${decisionAudits.outcome30d} <> '{}'::jsonb or ${decisionAudits.outcome60d} <> '{}'::jsonb or ${decisionAudits.outcome90d} <> '{}'::jsonb)::int`,
        rationaleCaptured: sql<number>`count(*) filter (where ${decisionAudits.overrideRationale} is not null and ${decisionAudits.overrideRationale} <> '')::int`,
        documented: sql<number>`count(*) filter (where ${decisionAudits.documentationStatus} = 'sealed')::int`,
        archived: sql<number>`count(*) filter (where ${decisionAudits.archivedAt} is not null)::int`,
        legalHolds: sql<number>`count(*) filter (where ${decisionAudits.legalHold} = true)::int`,
      })
      .from(decisionAudits)
      .where(eq(decisionAudits.organizationId, organizationId));

    const total = totals?.total ?? 0;
    const overrides = totals?.overrides ?? 0;

    return {
      total,
      overrides,
      overrideRate: total > 0 ? Math.round((overrides / total) * 100) : 0,
      outcomesTracked: totals?.outcomesTracked ?? 0,
      rationaleCaptureRate:
        overrides > 0 ? Math.round(((totals?.rationaleCaptured ?? 0) / overrides) * 100) : 0,
      documentationRate:
        total > 0 ? Math.round(((totals?.documented ?? 0) / total) * 100) : 0,
      archived: totals?.archived ?? 0,
      legalHolds: totals?.legalHolds ?? 0,
    };
  }

  async createForOrg(organizationId: string, input: Omit<InsertDecisionAudit, "organizationId">): Promise<DecisionAudit> {
    await this.ensureLinkedEntitiesExist(organizationId, {
      systemId: input.systemId,
      workflowId: input.workflowId ?? null,
    });

    const payloadBase = {
      organizationId,
      systemId: input.systemId,
      workflowId: input.workflowId ?? null,
      title: input.title,
      businessObjective: input.businessObjective ?? null,
      decisionContext: input.decisionContext,
      modelName: input.modelName ?? null,
      modelVersion: input.modelVersion ?? null,
      promptText: input.promptText ?? null,
      inputSources: input.inputSources ?? [],
      inputSnapshot: sanitizeStructuredValue(input.inputSnapshot ?? {}),
      decisionConstraints: input.decisionConstraints ?? [],
      aiOutput: input.aiOutput,
      humanOutput: input.humanOutput ?? null,
      overrideDiff: input.overrideDiff ?? buildOverrideDiff(input.aiOutput, input.humanOutput ?? null),
      overrideRationale: input.overrideRationale ?? null,
      confidenceScore: input.confidenceScore ?? null,
      uncertaintyScore: input.uncertaintyScore ?? null,
      explainabilityFactors: input.explainabilityFactors ?? [],
      documentationStatus: input.documentationStatus ?? "sealed",
      retentionUntil: input.retentionUntil ?? new Date(Date.now() + 7 * 365 * 24 * 60 * 60 * 1000),
      legalHold: false,
      legalHoldReason: null,
      legalHoldAppliedAt: null,
      archivedAt: null,
      lastRetentionCheckAt: null,
      currentVersionNumber: 1,
      lastVersionedAt: null,
      outcome30d: sanitizeStructuredValue(input.outcome30d ?? {}),
      outcome60d: sanitizeStructuredValue(input.outcome60d ?? {}),
      outcome90d: sanitizeStructuredValue(input.outcome90d ?? {}),
      outcomeSummary: input.outcomeSummary ?? null,
      createdBy: input.createdBy,
      reviewedBy: input.reviewedBy ?? null,
      updatedAt: new Date(),
    } satisfies Omit<DecisionAudit, "id" | "createdAt" | "sealedRecordHash"> & { createdAt?: Date };

    const payload = {
      ...payloadBase,
      sealedRecordHash: buildDecisionRecordHash(payloadBase),
    };

    const [created] = await db.insert(decisionAudits).values(payload).returning();
    return created;
  }

  async listVersionsForOrg(organizationId: string, decisionAuditId: string): Promise<DecisionAuditVersion[]> {
    return db
      .select()
      .from(decisionAuditVersions)
      .where(
        and(
          eq(decisionAuditVersions.organizationId, organizationId),
          eq(decisionAuditVersions.decisionAuditId, decisionAuditId),
        ),
      )
      .orderBy(desc(decisionAuditVersions.versionNumber), desc(decisionAuditVersions.createdAt));
  }

  async updateForOrg(
    organizationId: string,
    decisionAuditId: string,
    input: DecisionAuditUpdateInput,
  ): Promise<DecisionAudit | undefined> {
    const { actorName, versionReason, ...changes } = input;
    const [current] = await db
      .select()
      .from(decisionAudits)
      .where(and(eq(decisionAudits.organizationId, organizationId), eq(decisionAudits.id, decisionAuditId)));
    if (!current) {
      return undefined;
    }

    if (current.archivedAt) {
      const error = new Error("Archived decision traces are immutable");
      (error as Error & { status?: number }).status = 409;
      throw error;
    }

    await this.ensureLinkedEntitiesExist(organizationId, {
      systemId: changes.systemId ?? current.systemId,
      workflowId:
        changes.workflowId !== undefined
          ? (changes.workflowId ?? null)
          : (current.workflowId ?? null),
    });

    const merged = {
      ...current,
      ...changes,
      workflowId: changes.workflowId !== undefined ? changes.workflowId : current.workflowId,
      businessObjective: changes.businessObjective !== undefined ? changes.businessObjective : current.businessObjective,
      modelName: changes.modelName !== undefined ? changes.modelName : current.modelName,
      modelVersion: changes.modelVersion !== undefined ? changes.modelVersion : current.modelVersion,
      promptText: changes.promptText !== undefined ? changes.promptText : current.promptText,
      inputSources: changes.inputSources !== undefined ? changes.inputSources : current.inputSources,
      inputSnapshot:
        changes.inputSnapshot !== undefined
          ? sanitizeStructuredValue(changes.inputSnapshot)
          : current.inputSnapshot,
      decisionConstraints: changes.decisionConstraints !== undefined ? changes.decisionConstraints : current.decisionConstraints,
      humanOutput: changes.humanOutput !== undefined ? changes.humanOutput : current.humanOutput,
      overrideRationale: changes.overrideRationale !== undefined ? changes.overrideRationale : current.overrideRationale,
      confidenceScore: changes.confidenceScore !== undefined ? changes.confidenceScore : current.confidenceScore,
      uncertaintyScore: changes.uncertaintyScore !== undefined ? changes.uncertaintyScore : current.uncertaintyScore,
      explainabilityFactors: changes.explainabilityFactors !== undefined ? changes.explainabilityFactors : current.explainabilityFactors,
      documentationStatus: changes.documentationStatus !== undefined ? changes.documentationStatus : current.documentationStatus,
      retentionUntil: changes.retentionUntil !== undefined ? changes.retentionUntil : current.retentionUntil,
      outcome30d:
        changes.outcome30d !== undefined ? sanitizeStructuredValue(changes.outcome30d) : current.outcome30d,
      outcome60d:
        changes.outcome60d !== undefined ? sanitizeStructuredValue(changes.outcome60d) : current.outcome60d,
      outcome90d:
        changes.outcome90d !== undefined ? sanitizeStructuredValue(changes.outcome90d) : current.outcome90d,
      outcomeSummary: changes.outcomeSummary !== undefined ? changes.outcomeSummary : current.outcomeSummary,
      reviewedBy: changes.reviewedBy !== undefined ? changes.reviewedBy : current.reviewedBy,
    };

    const computedDiff =
      changes.overrideDiff !== undefined
        ? changes.overrideDiff
        : buildOverrideDiff(merged.aiOutput, merged.humanOutput ?? null);

    const comparableMerged = {
      ...merged,
      overrideDiff: computedDiff ?? null,
    } satisfies DecisionAudit;

    const shouldVersion = current.documentationStatus === "sealed" && hasMaterialChanges(current, comparableMerged);

    if (shouldVersion) {
      await db.insert(decisionAuditVersions).values({
        organizationId,
        decisionAuditId: current.id,
        versionNumber: current.currentVersionNumber,
        snapshot: current,
        sealedRecordHash: current.sealedRecordHash ?? null,
        reason: versionReason?.trim() || null,
        createdBy: actorName ?? current.reviewedBy ?? current.createdBy,
      });
    }

    const sealedRecordHash = buildDecisionRecordHash({
      organizationId,
      systemId: merged.systemId,
      workflowId: merged.workflowId ?? null,
      title: merged.title,
      businessObjective: merged.businessObjective ?? null,
      decisionContext: merged.decisionContext,
      modelName: merged.modelName ?? null,
      modelVersion: merged.modelVersion ?? null,
      promptText: merged.promptText ?? null,
      inputSources: merged.inputSources ?? [],
      inputSnapshot: merged.inputSnapshot ?? {},
      decisionConstraints: merged.decisionConstraints ?? [],
      aiOutput: merged.aiOutput,
      humanOutput: merged.humanOutput ?? null,
      overrideDiff: computedDiff ?? null,
      overrideRationale: merged.overrideRationale ?? null,
      confidenceScore: merged.confidenceScore ?? null,
      uncertaintyScore: merged.uncertaintyScore ?? null,
      explainabilityFactors: merged.explainabilityFactors ?? [],
      outcome30d: merged.outcome30d ?? {},
      outcome60d: merged.outcome60d ?? {},
      outcome90d: merged.outcome90d ?? {},
      outcomeSummary: merged.outcomeSummary ?? null,
      createdBy: merged.createdBy,
      reviewedBy: merged.reviewedBy ?? null,
    });

    const [updated] = await db
      .update(decisionAudits)
      .set({
        ...changes,
        ...(computedDiff !== undefined ? { overrideDiff: computedDiff } : {}),
        ...(shouldVersion
          ? {
              currentVersionNumber: current.currentVersionNumber + 1,
              lastVersionedAt: new Date(),
            }
          : {}),
        sealedRecordHash,
        updatedAt: new Date(),
      })
      .where(and(eq(decisionAudits.organizationId, organizationId), eq(decisionAudits.id, decisionAuditId)))
      .returning();

    return updated;
  }

  async syncWorkflowTrace(params: {
    organizationId: string;
    workflow: ApprovalWorkflow;
    actorName: string;
    systemRiskLevel: string | null;
  }): Promise<DecisionAudit> {
    const [existing] = await db
      .select()
      .from(decisionAudits)
      .where(
        and(
          eq(decisionAudits.organizationId, params.organizationId),
          eq(decisionAudits.workflowId, params.workflow.id),
        ),
      )
      .limit(1);

    const documentationStatus =
      params.workflow.status === "approved" ||
      params.workflow.status === "rejected" ||
      params.workflow.status === "escalated"
        ? "sealed"
        : params.workflow.status === "in_review"
          ? "reviewed"
          : "draft";

    const humanOutput =
      existing &&
      (params.workflow.status === "approved" ||
        params.workflow.status === "rejected" ||
        params.workflow.status === "in_review")
        ? `Human workflow action recorded: ${params.workflow.status} by ${params.actorName}.`
        : existing?.humanOutput ?? null;

    const basePayload = {
      systemId: params.workflow.systemId,
      workflowId: params.workflow.id,
      title: `${params.workflow.title} trace`,
      businessObjective: params.workflow.description ?? null,
      modelName: "workflow-routing-engine",
      modelVersion: "v1",
      promptText: null,
      inputSources: [`workflow:${params.workflow.id}`, `system:${params.workflow.systemId}`],
      inputSnapshot: {
        priority: params.workflow.priority,
        requestedBy: params.workflow.requestedBy,
        reviewer: params.workflow.reviewer,
        status: params.workflow.status,
        estimatedFinancialImpact: params.workflow.estimatedFinancialImpact ?? 0,
      },
      decisionConstraints: [
        params.workflow.usesPii ? "PII handling required" : "No PII handling required",
        params.workflow.reversible === false ? "Irreversible outcome" : "Reversible outcome",
        params.workflow.customerFacing ? "Customer-facing decision" : "Internal decision",
        params.workflow.safetyCritical ? "Safety and compliance escalation" : "Standard safety profile",
      ],
      confidenceScore: null,
      uncertaintyScore: null,
      explainabilityFactors: [
        `tier:${params.workflow.decisionTier ?? "tier_1"}`,
        `committee:${params.workflow.committeeType ?? "technical_team"}`,
        `risk:${params.systemRiskLevel ?? "unknown"}`,
      ],
      documentationStatus,
      decisionContext: buildWorkflowDecisionContext(params.workflow, params.systemRiskLevel),
      aiOutput: buildWorkflowAiOutput(params.workflow),
      humanOutput,
      overrideRationale:
        params.workflow.status === "rejected"
          ? "Workflow rejected during human review."
          : params.workflow.blockedReason ?? existing?.overrideRationale ?? null,
      outcome30d: existing?.outcome30d ?? {},
      outcome60d: existing?.outcome60d ?? {},
      outcome90d: existing?.outcome90d ?? {},
      outcomeSummary: `Current workflow status: ${params.workflow.status}. Committee path: ${params.workflow.committeeType ?? "technical_team"}.`,
      reviewedBy: humanOutput ? params.actorName : existing?.reviewedBy ?? null,
    };

    if (!existing) {
      return this.createForOrg(params.organizationId, {
        ...basePayload,
        createdBy: params.actorName,
      });
    }

    const updated = await this.updateForOrg(params.organizationId, existing.id, basePayload);
    if (!updated) {
      throw new Error("Failed to sync workflow decision trace");
    }
    return updated;
  }
}

export const decisionAuditService = new DecisionAuditService();
