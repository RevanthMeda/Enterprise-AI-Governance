import fs from "node:fs/promises";
import { count, inArray, like } from "drizzle-orm";
import { db } from "../server/db";
import {
  aiSystems,
  approvalWorkflows,
  auditLogs,
  evidenceFiles,
  leads,
  organizations,
  riskAssessments,
  systemControls,
} from "../shared/schema";

type GoldenSeedSnapshot = {
  batchTag: string;
  orgCount: number;
  extraUsersPerOrg: number;
  systemsPerOrg: number;
  systemControlsPerSystem: number;
  workflowsPerSystem: number;
  riskAssessmentsPerSystem: number;
  evidenceFilesPerSystem: number;
  auditLogsPerSystem: number;
  notificationsPerUser: number;
  leadsCount: number;
  marketingEventsCount: number;
  chunkSize: number;
};

function assertAtLeast(actual: number, minimum: number, label: string) {
  if (actual < minimum) {
    throw new Error(`${label} validation failed: expected >= ${minimum}, got ${actual}`);
  }
}

async function validateSnapshot(snapshot: GoldenSeedSnapshot) {
  const orgPrefix = `load-org-${snapshot.batchTag}-`;
  const scopedOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(like(organizations.slug, `${orgPrefix}%`));

  assertAtLeast(scopedOrgs.length, snapshot.orgCount, "Organization count");

  const scopedSystems = await db
    .select({ id: aiSystems.id })
    .from(aiSystems)
    .where(like(aiSystems.description, `%batch ${snapshot.batchTag}%`));

  const expectedSystems = snapshot.systemsPerOrg * (snapshot.orgCount + 1);
  assertAtLeast(scopedSystems.length, expectedSystems, "AI systems count");

  const systemIds = scopedSystems.map((row) => row.id);
  if (systemIds.length > 0) {
    const [controlsCount] = await db
      .select({ total: count() })
      .from(systemControls)
      .where(inArray(systemControls.systemId, systemIds));
    const [workflowsCount] = await db
      .select({ total: count() })
      .from(approvalWorkflows)
      .where(inArray(approvalWorkflows.systemId, systemIds));
    const [riskCount] = await db
      .select({ total: count() })
      .from(riskAssessments)
      .where(inArray(riskAssessments.systemId, systemIds));
    const [evidenceCount] = await db
      .select({ total: count() })
      .from(evidenceFiles)
      .where(inArray(evidenceFiles.systemId, systemIds));
    const [auditCount] = await db
      .select({ total: count() })
      .from(auditLogs)
      .where(inArray(auditLogs.entityId, systemIds));

    assertAtLeast(
      Number(controlsCount?.total ?? 0),
      expectedSystems * snapshot.systemControlsPerSystem,
      "System controls count",
    );
    assertAtLeast(
      Number(workflowsCount?.total ?? 0),
      expectedSystems * snapshot.workflowsPerSystem,
      "Workflow count",
    );
    assertAtLeast(
      Number(riskCount?.total ?? 0),
      expectedSystems * snapshot.riskAssessmentsPerSystem,
      "Risk assessment count",
    );
    assertAtLeast(
      Number(evidenceCount?.total ?? 0),
      expectedSystems * snapshot.evidenceFilesPerSystem,
      "Evidence files count",
    );
    assertAtLeast(
      Number(auditCount?.total ?? 0),
      expectedSystems * snapshot.auditLogsPerSystem,
      "Audit log count",
    );
  }

  const [leadCount] = await db
    .select({ total: count() })
    .from(leads)
    .where(like(leads.workEmail, `lead_${snapshot.batchTag}_%@example.com`));

  assertAtLeast(Number(leadCount?.total ?? 0), snapshot.leadsCount, "Leads count");

  console.log("[seed:heavy:golden] Snapshot validation passed");
}

async function runGoldenSeed() {
  const snapshotPath = new URL("./seed-heavy-golden.snapshot.json", import.meta.url);
  const snapshot = JSON.parse(
    await fs.readFile(snapshotPath, "utf8"),
  ) as GoldenSeedSnapshot;

  const orgPrefix = `load-org-${snapshot.batchTag}-`;
  const existingBatchOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(like(organizations.slug, `${orgPrefix}%`));

  process.env.SEED_HEAVY_BATCH_TAG = snapshot.batchTag;
  process.env.SEED_HEAVY_ORG_COUNT = String(snapshot.orgCount);
  process.env.SEED_HEAVY_EXTRA_USERS_PER_ORG = String(snapshot.extraUsersPerOrg);
  process.env.SEED_HEAVY_SYSTEMS_PER_ORG = String(snapshot.systemsPerOrg);
  process.env.SEED_HEAVY_SYSTEM_CONTROLS_PER_SYSTEM = String(snapshot.systemControlsPerSystem);
  process.env.SEED_HEAVY_WORKFLOWS_PER_SYSTEM = String(snapshot.workflowsPerSystem);
  process.env.SEED_HEAVY_RISK_ASSESSMENTS_PER_SYSTEM = String(snapshot.riskAssessmentsPerSystem);
  process.env.SEED_HEAVY_EVIDENCE_FILES_PER_SYSTEM = String(snapshot.evidenceFilesPerSystem);
  process.env.SEED_HEAVY_AUDIT_LOGS_PER_SYSTEM = String(snapshot.auditLogsPerSystem);
  process.env.SEED_HEAVY_NOTIFICATIONS_PER_USER = String(snapshot.notificationsPerUser);
  process.env.SEED_HEAVY_LEADS_COUNT = String(snapshot.leadsCount);
  process.env.SEED_HEAVY_EVENTS_COUNT = String(snapshot.marketingEventsCount);
  process.env.SEED_HEAVY_CHUNK_SIZE = String(snapshot.chunkSize);

  if (existingBatchOrgs.length > 0) {
    console.log(
      `[seed:heavy:golden] Existing batch detected for ${snapshot.batchTag}; skipping re-seed to keep run idempotent`,
    );
  } else {
    console.log(`[seed:heavy:golden] Running snapshot batch=${snapshot.batchTag}`);
    await import("./seed-heavy-data.ts");
  }

  await validateSnapshot(snapshot);
}

runGoldenSeed().catch((error) => {
  console.error("[seed:heavy:golden] Failed:", error);
  process.exit(1);
});
