import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  telemetryReviewerExceptions,
  type InsertTelemetryReviewerException,
  type TelemetryReviewerException,
} from "@shared/schema";

type ExceptionFilters = {
  systemId?: string | null;
};

type MatchingEvent = {
  systemId?: string | null;
  gateway?: string | null;
  promptText?: string | null;
};

function normalizePromptPattern(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export class TelemetryReviewerExceptionService {
  async listForOrg(organizationId: string, filters?: ExceptionFilters) {
    const rows = await db
      .select()
      .from(telemetryReviewerExceptions)
      .where(eq(telemetryReviewerExceptions.organizationId, organizationId))
      .orderBy(desc(telemetryReviewerExceptions.updatedAt), desc(telemetryReviewerExceptions.createdAt));

    if (!filters?.systemId) {
      return rows.filter((row) => row.systemId === null);
    }

    return rows.filter((row) => row.systemId === null || row.systemId === filters.systemId);
  }

  async createForOrg(
    organizationId: string,
    input: Omit<InsertTelemetryReviewerException, "organizationId" | "normalizedPromptPattern">,
  ) {
    const promptPattern = input.promptPattern.trim();
    const normalizedPromptPattern = normalizePromptPattern(promptPattern);
    if (!normalizedPromptPattern) {
      throw new Error("Prompt pattern is required");
    }

    const [created] = await db
      .insert(telemetryReviewerExceptions)
      .values({
        ...input,
        organizationId,
        promptPattern,
        normalizedPromptPattern,
        suppressedThresholds:
          Array.isArray(input.suppressedThresholds) && input.suppressedThresholds.length > 0
            ? input.suppressedThresholds
            : ["restricted_prompt_detected"],
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  async updateForOrg(
    organizationId: string,
    exceptionId: string,
    input: Partial<Omit<InsertTelemetryReviewerException, "organizationId" | "normalizedPromptPattern">>,
  ) {
    const patch: Partial<Omit<typeof telemetryReviewerExceptions.$inferInsert, "organizationId">> = {
      ...input,
      updatedAt: new Date(),
    };

    if (typeof input.promptPattern === "string") {
      patch.promptPattern = input.promptPattern.trim();
      patch.normalizedPromptPattern = normalizePromptPattern(input.promptPattern);
    }

    const [updated] = await db
      .update(telemetryReviewerExceptions)
      .set(patch)
      .where(
        and(
          eq(telemetryReviewerExceptions.organizationId, organizationId),
          eq(telemetryReviewerExceptions.id, exceptionId),
        ),
      )
      .returning();

    return updated ?? null;
  }

  async findApplicableForEvent(
    organizationId: string,
    event: MatchingEvent,
  ): Promise<TelemetryReviewerException[]> {
    const normalizedPrompt = normalizePromptPattern(event.promptText ?? "");
    if (!normalizedPrompt) {
      return [];
    }

    const rows = await db
      .select()
      .from(telemetryReviewerExceptions)
      .where(
        and(
          eq(telemetryReviewerExceptions.organizationId, organizationId),
          eq(telemetryReviewerExceptions.active, true),
          or(
            isNull(telemetryReviewerExceptions.expiresAt),
            sql`${telemetryReviewerExceptions.expiresAt} > now()`,
          ),
        ),
      );

    return rows.filter((row) => {
      if (row.systemId && row.systemId !== (event.systemId ?? null)) {
        return false;
      }
      if (row.gateway && row.gateway !== (event.gateway ?? null)) {
        return false;
      }
      return normalizedPrompt.includes(row.normalizedPromptPattern);
    });
  }

  getSuppressedThresholds(exception: TelemetryReviewerException) {
    return getStringArray(exception.suppressedThresholds);
  }
}

export const telemetryReviewerExceptionService = new TelemetryReviewerExceptionService();
