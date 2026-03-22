import fs from "fs/promises";
import path from "path";
import { desc, eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  aiIncidents,
  aiTelemetryEvents,
  decisionAudits,
  organizations,
} from "../shared/schema";

type CliOptions = {
  organization?: string;
  outputPath: string;
  limit: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    outputPath: path.resolve(process.cwd(), "exports/governance-training-data.jsonl"),
    limit: 500,
  };

  for (const arg of argv) {
    if (arg.startsWith("--organization=")) {
      options.organization = arg.slice("--organization=".length).trim();
    } else if (arg.startsWith("--output=")) {
      options.outputPath = path.resolve(process.cwd(), arg.slice("--output=".length).trim());
    } else if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length).trim()) || options.limit;
    }
  }

  return options;
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function redactTrainingText(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]")
    .replace(/\b(?:\d[ -]*?){12,19}\b/g, "[REDACTED_ACCOUNT]")
    .replace(/\bIE\d{2}[A-Z0-9]{4}\d{14,24}\b/gi, "[REDACTED_IBAN]");
}

async function resolveOrganizationId(filter: string | undefined) {
  if (!filter) {
    return null;
  }

  const [byId] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, filter));
  if (byId) {
    return byId.id;
  }

  const [bySlug] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, filter));
  return bySlug?.id ?? null;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const organizationId = await resolveOrganizationId(options.organization);

  if (options.organization && !organizationId) {
    throw new Error(`Organization "${options.organization}" was not found by id or slug`);
  }

  const telemetryRows = organizationId
    ? await db
        .select()
        .from(aiTelemetryEvents)
        .where(eq(aiTelemetryEvents.organizationId, organizationId))
        .orderBy(desc(aiTelemetryEvents.createdAt))
        .limit(options.limit)
    : await db
        .select()
        .from(aiTelemetryEvents)
        .orderBy(desc(aiTelemetryEvents.createdAt))
        .limit(options.limit);

  const incidentRows = organizationId
    ? await db
        .select()
        .from(aiIncidents)
        .where(eq(aiIncidents.organizationId, organizationId))
        .orderBy(desc(aiIncidents.createdAt))
        .limit(options.limit)
    : await db
        .select()
        .from(aiIncidents)
        .orderBy(desc(aiIncidents.createdAt))
        .limit(options.limit);

  const decisionRows = organizationId
    ? await db
        .select()
        .from(decisionAudits)
        .where(eq(decisionAudits.organizationId, organizationId))
        .orderBy(desc(decisionAudits.createdAt))
        .limit(options.limit)
    : await db
        .select()
        .from(decisionAudits)
        .orderBy(desc(decisionAudits.createdAt))
        .limit(options.limit);

  const records = [
    ...telemetryRows.map((row) => {
      const metadata = getRecord(row.metadata);
      return {
        recordType: "telemetry_event",
        id: row.id,
        organizationId: row.organizationId,
        systemId: row.systemId,
        eventType: row.eventType,
        summary: row.summary,
        promptText: redactTrainingText(row.promptText),
        modelOutput: redactTrainingText(row.modelOutput),
        decision: row.actionTaken,
        blocked: row.blocked,
        reasonCodes: getStringArray(metadata.reasonCodes),
        thresholdBreaches: getStringArray(metadata.thresholdBreaches),
        legalProfileApplied: typeof metadata.legalProfileApplied === "string" ? metadata.legalProfileApplied : null,
        lawPackIdsApplied: getStringArray(metadata.lawPackIdsApplied),
        rulesEngine: metadata.rulesEngine ?? null,
        governanceCritic: metadata.governanceCritic ?? null,
        sourceAttributionVerifier: metadata.sourceAttributionVerifier ?? null,
        factProvenanceVerifier: metadata.factProvenanceVerifier ?? null,
        actionConfirmationVerifier: metadata.actionConfirmationVerifier ?? null,
        reviewRelease: metadata.reviewRelease ?? null,
        shadowPolicy: metadata.shadowPolicy ?? null,
        governanceCatalog: metadata.governanceCatalog ?? null,
        createdAt: row.createdAt,
      };
    }),
    ...incidentRows.map((row) => {
      const playbook = getRecord(row.playbook);
      return {
        recordType: "ai_incident",
        id: row.id,
        organizationId: row.organizationId,
        systemId: row.systemId,
        workflowId: row.workflowId,
        title: row.title,
        category: row.category,
        severity: row.severity,
        status: row.status,
        description: redactTrainingText(row.description),
        governanceEvidence: playbook.governanceEvidence ?? null,
        createdAt: row.createdAt,
      };
    }),
    ...decisionRows.map((row) => {
      const inputSnapshot = getRecord(row.inputSnapshot);
      const governance =
        inputSnapshot.governance && typeof inputSnapshot.governance === "object" && !Array.isArray(inputSnapshot.governance)
          ? inputSnapshot.governance
          : null;
      return {
        recordType: "decision_audit",
        id: row.id,
        organizationId: row.organizationId,
        systemId: row.systemId,
        workflowId: row.workflowId,
        title: row.title,
        promptText: redactTrainingText(row.promptText),
        aiOutput: redactTrainingText(row.aiOutput),
        humanOutput: redactTrainingText(row.humanOutput),
        decisionConstraints: getStringArray(row.decisionConstraints),
        explainabilityFactors: getStringArray(row.explainabilityFactors),
        governance,
        documentationStatus: row.documentationStatus,
        createdAt: row.createdAt,
      };
    }),
  ];

  await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
  await fs.writeFile(
    options.outputPath,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );

  console.log(
    `[export-governance-training-data] wrote ${records.length} records to ${options.outputPath}${
      organizationId ? ` for organization ${organizationId}` : ""
    }`,
  );
}

main().catch((error) => {
  console.error("[export-governance-training-data] failed:", error);
  process.exitCode = 1;
});
