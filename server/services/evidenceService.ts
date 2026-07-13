import { storage, type EvidenceFileFilters } from "../storage";
import { agentGovernanceService } from "./agentGovernanceService";
import {
  compileLawPackRuntimeOverlay,
} from "@shared/law-packs";
import { db } from "../db";
import { evidenceFiles } from "@shared/schema";
import { and, eq, gte, sql } from "drizzle-orm";

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

export interface EvidenceQuotaLimits {
  organizationBytes: number;
  organizationFiles: number;
  userRollingDayBytes: number;
  userRollingDayFiles: number;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const evidenceQuotaLimits: EvidenceQuotaLimits = {
  organizationBytes: readPositiveIntegerEnv("EVIDENCE_ORG_MAX_BYTES", 10 * 1024 * 1024 * 1024),
  organizationFiles: readPositiveIntegerEnv("EVIDENCE_ORG_MAX_FILES", 50_000),
  userRollingDayBytes: readPositiveIntegerEnv("EVIDENCE_USER_DAILY_MAX_BYTES", 1024 * 1024 * 1024),
  userRollingDayFiles: readPositiveIntegerEnv("EVIDENCE_USER_DAILY_MAX_FILES", 500),
};

export class EvidenceQuotaError extends Error {
  readonly status = 413;
  readonly code = "EVIDENCE_QUOTA_EXCEEDED";

  constructor(message: string) {
    super(message);
    this.name = "EvidenceQuotaError";
  }
}

export class EvidenceRequestError extends Error {
  readonly code = "INVALID_EVIDENCE_REQUEST";

  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "EvidenceRequestError";
  }
}

export function assertEvidenceQuota(params: {
  nextFileBytes: number;
  organizationBytesUsed: number;
  organizationFilesUsed: number;
  userRollingDayBytesUsed: number;
  userRollingDayFilesUsed: number;
  limits?: EvidenceQuotaLimits;
}): void {
  const limits = params.limits ?? evidenceQuotaLimits;
  if (
    params.organizationBytesUsed + params.nextFileBytes > limits.organizationBytes ||
    params.organizationFilesUsed + 1 > limits.organizationFiles
  ) {
    throw new EvidenceQuotaError(
      "Organization evidence storage quota has been reached. Remove older evidence or contact an administrator.",
    );
  }
  if (
    params.userRollingDayBytesUsed + params.nextFileBytes > limits.userRollingDayBytes ||
    params.userRollingDayFilesUsed + 1 > limits.userRollingDayFiles
  ) {
    throw new EvidenceQuotaError(
      "Your 24-hour evidence upload quota has been reached. Try again later.",
    );
  }
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
      throw new EvidenceRequestError("System not found", 404);
    }

    if (params.input.controlId) {
      const linkedControl = await storage.getSystemControlBySystemAndControlForOrg(
        params.organizationId,
        params.input.systemId,
        params.input.controlId,
      );
      if (!linkedControl) {
        throw new EvidenceRequestError(
          "Control not linked to this system in the active organization",
          400,
        );
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
        throw new EvidenceRequestError(
          "Workflow not found for this system in the active organization",
          400,
        );
      }
      effectiveGovernanceScope = await agentGovernanceService.resolveEffectiveScope({
        organizationId: params.organizationId,
        system,
        workflow,
        actor: params.actor,
      });
    }

    const overlay = compileLawPackRuntimeOverlay(effectiveGovernanceScope.lawPackIdsApplied);

    const metadata = {
      ...(params.input.metadata ?? {}),
      uploadedByUserId: params.actor.id,
      legalProfileApplied: effectiveGovernanceScope.legalProfileApplied,
      lawPackIdsApplied: effectiveGovernanceScope.lawPackIdsApplied,
      governanceScopeSource: effectiveGovernanceScope.source,
      lawPackDecisionConstraints: overlay.decisionConstraints,
      lawPackSources: overlay.sourceRefs,
    };

    return db.transaction(async (tx) => {
      // All evidence creation paths acquire the same tenant lock before
      // checking usage and inserting metadata. Concurrent processes therefore
      // cannot both observe the same remaining quota and over-allocate it.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`evidence-quota:${params.organizationId}`}))`,
      );

      const rollingDayStart = new Date(Date.now() - 24 * 60 * 60 * 1_000);
      const [organizationUsage] = await tx
        .select({
          bytes: sql<number>`coalesce(sum(${evidenceFiles.fileSize}), 0)`,
          files: sql<number>`count(*)`,
        })
        .from(evidenceFiles)
        .where(eq(evidenceFiles.organizationId, params.organizationId));
      const [userUsage] = await tx
        .select({
          bytes: sql<number>`coalesce(sum(${evidenceFiles.fileSize}), 0)`,
          files: sql<number>`count(*)`,
        })
        .from(evidenceFiles)
        .where(and(
          eq(evidenceFiles.organizationId, params.organizationId),
          gte(evidenceFiles.createdAt, rollingDayStart),
          sql`${evidenceFiles.metadata} ->> 'uploadedByUserId' = ${params.actor.id}`,
        ));

      assertEvidenceQuota({
        nextFileBytes: params.input.fileSize,
        organizationBytesUsed: Number(organizationUsage?.bytes ?? 0),
        organizationFilesUsed: Number(organizationUsage?.files ?? 0),
        userRollingDayBytesUsed: Number(userUsage?.bytes ?? 0),
        userRollingDayFilesUsed: Number(userUsage?.files ?? 0),
      });

      const [created] = await tx
        .insert(evidenceFiles)
        .values({
          organizationId: params.organizationId,
          systemId: params.input.systemId,
          controlId: params.input.controlId ?? null,
          workflowId: params.input.workflowId ?? null,
          fileName: params.input.fileName,
          fileSize: params.input.fileSize,
          mimeType: params.input.mimeType,
          filePath: params.input.filePath,
          uploadedBy: params.actor.fullName,
          metadata,
        })
        .returning();
      if (!created) {
        throw new Error("Evidence insert returned no row");
      }
      return created;
    });
  }

  async deleteEvidence(params: { organizationId: string; actor: Actor; evidenceId: string }) {
    await storage.deleteEvidenceFileForOrg(params.organizationId, params.evidenceId);
  }
}

export const evidenceService = new EvidenceService();
