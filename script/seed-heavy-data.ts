import { and, eq, inArray } from "drizzle-orm";
import { hashPassword } from "../server/auth";
import { db } from "../server/db";
import { ensureTenantBootstrap } from "../server/tenant-bootstrap";
import {
  aiSystems,
  approvalWorkflows,
  auditLogs,
  complianceControls,
  controlStatuses,
  evidenceFiles,
  leads,
  marketingEvents,
  memberships,
  notificationTypes,
  notifications,
  organizations,
  riskAssessments,
  systemControls,
  userRoles,
  users,
  workflowStatuses,
} from "../shared/schema";

type SeedConfig = {
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

type TestUserSpec = {
  username: string;
  fullName: string;
  email: string;
  role: (typeof userRoles)[number];
  membershipRole: string;
};

type CreatedSystem = {
  id: string;
  organizationId: string | null;
  name: string;
  riskLevel: string;
};

function readNumberEnv(name: string, defaultValue: number, min = 1): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.floor(parsed));
}

function chunkArray<T>(input: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    chunks.push(input.slice(i, i + chunkSize));
  }
  return chunks;
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const config: SeedConfig = {
  batchTag: process.env.SEED_HEAVY_BATCH_TAG || `${Date.now()}`,
  orgCount: readNumberEnv("SEED_HEAVY_ORG_COUNT", 6),
  extraUsersPerOrg: readNumberEnv("SEED_HEAVY_EXTRA_USERS_PER_ORG", 25),
  systemsPerOrg: readNumberEnv("SEED_HEAVY_SYSTEMS_PER_ORG", 120),
  systemControlsPerSystem: readNumberEnv("SEED_HEAVY_SYSTEM_CONTROLS_PER_SYSTEM", 18),
  workflowsPerSystem: readNumberEnv("SEED_HEAVY_WORKFLOWS_PER_SYSTEM", 3),
  riskAssessmentsPerSystem: readNumberEnv("SEED_HEAVY_RISK_ASSESSMENTS_PER_SYSTEM", 2),
  evidenceFilesPerSystem: readNumberEnv("SEED_HEAVY_EVIDENCE_FILES_PER_SYSTEM", 2),
  auditLogsPerSystem: readNumberEnv("SEED_HEAVY_AUDIT_LOGS_PER_SYSTEM", 8),
  notificationsPerUser: readNumberEnv("SEED_HEAVY_NOTIFICATIONS_PER_USER", 30),
  leadsCount: readNumberEnv("SEED_HEAVY_LEADS_COUNT", 1500),
  marketingEventsCount: readNumberEnv("SEED_HEAVY_EVENTS_COUNT", 4000),
  chunkSize: readNumberEnv("SEED_HEAVY_CHUNK_SIZE", 250),
};

const owners = [
  "Sarah Chen",
  "Marcus Rodriguez",
  "Dr. James Okonkwo",
  "Lisa Andersson",
  "Tom Baker",
  "Dr. Maria Gonzalez",
  "Alex Kim",
  "Mina Patel",
  "Elena Volkov",
  "Noah Simmons",
];

const departments = [
  "Risk Management",
  "Security Operations",
  "Compliance",
  "Fraud Prevention",
  "Customer Experience",
  "Finance",
  "HR",
  "Legal",
  "Data Science",
  "Operations",
];

const vendors = ["Internal", "OpenAI", "Anthropic", "Azure AI", "Google Vertex", "AWS Bedrock", "DataRobot"];
const modelTypes = ["LLM", "Gradient Boosting", "Random Forest", "CNN", "Transformer", "Ensemble", "NLP Classifier"];
const riskLevels = ["minimal", "limited", "high"];
const systemStatuses = ["active", "under_review", "draft", "approved"];
const dataSensitivities = ["public", "internal", "confidential", "restricted"];
const geographies = ["EU", "US", "UK", "Global", "EU, US", "APAC", "LATAM"];
const workflowPriorities = ["low", "medium", "high", "critical"];

const leadChallenges = [
  "No single source of truth for AI systems and ownership",
  "Audit prep is manual and distributed across teams",
  "Hard to prove control implementation and evidence freshness",
  "Approval workflows are inconsistent between business units",
  "Need better visibility into high-risk AI systems",
  "Need EU AI Act + NIST + ISO 42001 alignment",
];

const marketingEventNames = ["page_view", "cta_click", "form_submit", "form_success", "scroll_depth", "section_engagement"];

const testUsers: TestUserSpec[] = [
  {
    username: "admin_test",
    fullName: "Admin Test User",
    email: "admin_test@aicontrolgrid.local",
    role: "admin",
    membershipRole: "owner",
  },
  {
    username: "cro_test",
    fullName: "CRO Test User",
    email: "cro_test@aicontrolgrid.local",
    role: "cro",
    membershipRole: "cro",
  },
  {
    username: "ciso_test",
    fullName: "CISO Test User",
    email: "ciso_test@aicontrolgrid.local",
    role: "ciso",
    membershipRole: "ciso",
  },
  {
    username: "compliance_lead_test",
    fullName: "Compliance Lead Test User",
    email: "compliance_lead_test@aicontrolgrid.local",
    role: "compliance_lead",
    membershipRole: "compliance_lead",
  },
  {
    username: "reviewer_test",
    fullName: "Reviewer Test User",
    email: "reviewer_test@aicontrolgrid.local",
    role: "reviewer",
    membershipRole: "reviewer",
  },
  {
    username: "system_owner_test",
    fullName: "System Owner Test User",
    email: "system_owner_test@aicontrolgrid.local",
    role: "system_owner",
    membershipRole: "system_owner",
  },
  {
    username: "auditor_test",
    fullName: "Auditor Test User",
    email: "auditor_test@aicontrolgrid.local",
    role: "auditor",
    membershipRole: "auditor",
  },
];

async function ensureTestUsers(passwordHash: string) {
  const usernames = testUsers.map((u) => u.username);
  const existing = await db.select().from(users).where(inArray(users.username, usernames));
  const existingSet = new Set(existing.map((u) => u.username));

  const missingRows = testUsers
    .filter((u) => !existingSet.has(u.username))
    .map((u) => ({
      username: u.username,
      password: passwordHash,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
    }));

  if (missingRows.length > 0) {
    await db.insert(users).values(missingRows);
  }

  return db.select().from(users).where(inArray(users.username, usernames));
}

async function ensureComplianceControlPool() {
  const existing = await db.select().from(complianceControls);
  if (existing.length >= 30) return existing;

  const additions = [];
  const frameworks = ["eu_ai_act", "nist_ai_rmf", "iso_42001"] as const;
  for (let i = 0; i < 36; i += 1) {
    const framework = frameworks[i % frameworks.length];
    additions.push({
      framework,
      controlId: `LOAD-${framework.toUpperCase()}-${String(i + 1).padStart(3, "0")}`,
      controlName: `Load Test Control ${i + 1}`,
      description: `Generated control ${i + 1} for heavy-load test scenarios`,
      category: `Category ${((i % 6) + 1).toString()}`,
      riskLevelApplicable: i % 2 === 0 ? "high" : "limited",
    });
  }

  await db.insert(complianceControls).values(additions);
  return db.select().from(complianceControls);
}

async function seed() {
  console.log(`[seed:heavy] Starting heavy data seed (batch=${config.batchTag})`);
  const commonPassword = "TestUser123!";
  const passwordHash = await hashPassword(commonPassword);

  const { organizationId: defaultOrgId } = await ensureTenantBootstrap();
  const [defaultOrg] = await db.select().from(organizations).where(eq(organizations.id, defaultOrgId));
  if (!defaultOrg) {
    throw new Error("Default organization not found after tenant bootstrap");
  }

  const orgRows = Array.from({ length: config.orgCount }, (_, i) => ({
    slug: `load-org-${config.batchTag}-${String(i + 1).padStart(2, "0")}`,
    name: `Load Test Organization ${i + 1} (${config.batchTag})`,
    status: "active",
    plan: i % 2 === 0 ? "enterprise" : "growth",
    settings: { seedBatch: config.batchTag, sequence: i + 1 },
  }));
  await db.insert(organizations).values(orgRows).onConflictDoNothing();

  const orgSlugs = [defaultOrg.slug, ...orgRows.map((r) => r.slug)];
  const orgRecords = await db.select().from(organizations).where(inArray(organizations.slug, orgSlugs));
  const primaryOrgId = orgRecords.find((o) => o.id !== defaultOrgId)?.id ?? defaultOrgId;

  const createdTestUsers = await ensureTestUsers(passwordHash);
  const membershipRows = [];
  for (const user of createdTestUsers) {
    const spec = testUsers.find((s) => s.username === user.username);
    if (!spec) continue;
    for (const org of orgRecords) {
      membershipRows.push({
        userId: user.id,
        organizationId: org.id,
        role: spec.membershipRole,
        membershipState: "active",
        isDefault: org.id === primaryOrgId,
        invitedBy: null,
      });
    }
  }
  for (const chunk of chunkArray(membershipRows, config.chunkSize)) {
    await db.insert(memberships).values(chunk).onConflictDoNothing();
  }

  const extraUsers = [];
  for (const org of orgRecords) {
    for (let i = 0; i < config.extraUsersPerOrg; i += 1) {
      const role = userRoles[(i + org.slug.length) % userRoles.length];
      extraUsers.push({
        username: `load_${config.batchTag}_${org.slug}_${String(i + 1).padStart(3, "0")}`,
        password: passwordHash,
        fullName: `Load User ${i + 1} (${org.name})`,
        email: `load_${config.batchTag}_${org.slug}_${i + 1}@aicontrolgrid.local`,
        role,
        __orgId: org.id,
      });
    }
  }
  const extraUserRows = extraUsers.map(({ __orgId: _org, ...u }) => u);
  for (const chunk of chunkArray(extraUserRows, config.chunkSize)) {
    await db.insert(users).values(chunk).onConflictDoNothing({ target: users.username });
  }
  const extraUsernames = extraUsers.map((u) => u.username);
  const createdExtraUsers = extraUsernames.length > 0
    ? await db.select().from(users).where(inArray(users.username, extraUsernames))
    : [];

  const extraMembershipRows = createdExtraUsers.map((u) => {
    const source = extraUsers.find((x) => x.username === u.username)!;
    return {
      userId: u.id,
      organizationId: source.__orgId,
      role: u.role,
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    };
  });
  for (const chunk of chunkArray(extraMembershipRows, config.chunkSize)) {
    await db.insert(memberships).values(chunk).onConflictDoNothing();
  }

  const systemsToInsert = [];
  for (const org of orgRecords) {
    for (let i = 0; i < config.systemsPerOrg; i += 1) {
      const riskLevel = randomItem(riskLevels);
      systemsToInsert.push({
        organizationId: org.id,
        name: `AI System ${i + 1} (${org.name})`,
        description: `Generated heavy-load system ${i + 1} for batch ${config.batchTag}`,
        owner: randomItem(owners),
        department: randomItem(departments),
        vendor: randomItem(vendors),
        modelType: randomItem(modelTypes),
        riskLevel,
        status: randomItem(systemStatuses),
        deploymentContext: `Environment ${((i % 4) + 1).toString()}`,
        dataSensitivity: randomItem(dataSensitivities),
        geography: randomItem(geographies),
        purpose: "Performance and governance stress testing",
        usersImpacted: randomInt(500, 1500000),
      });
    }
  }

  const createdSystems: CreatedSystem[] = [];
  for (const chunk of chunkArray(systemsToInsert, config.chunkSize)) {
    const inserted = await db
      .insert(aiSystems)
      .values(chunk)
      .returning({
        id: aiSystems.id,
        organizationId: aiSystems.organizationId,
        name: aiSystems.name,
        riskLevel: aiSystems.riskLevel,
      });
    createdSystems.push(...inserted);
  }

  const controls = await ensureComplianceControlPool();
  const controlRows = [];
  for (let i = 0; i < createdSystems.length; i += 1) {
    const system = createdSystems[i];
    for (let j = 0; j < config.systemControlsPerSystem; j += 1) {
      const control = controls[(i + j) % controls.length];
      const status = controlStatuses[(i + j) % controlStatuses.length];
      controlRows.push({
        organizationId: system.organizationId,
        systemId: system.id,
        controlId: control.id,
        status,
        evidence: status === "implemented" || status === "verified" ? `Evidence for ${control.controlName}` : null,
        notes: `Batch ${config.batchTag} control coverage`,
        assignee: randomItem(owners),
      });
    }
  }
  for (const chunk of chunkArray(controlRows, config.chunkSize)) {
    await db.insert(systemControls).values(chunk);
  }

  const workflowRows = [];
  for (const system of createdSystems) {
    for (let i = 0; i < config.workflowsPerSystem; i += 1) {
      workflowRows.push({
        organizationId: system.organizationId,
        systemId: system.id,
        title: `Workflow ${i + 1} for ${system.name}`,
        description: `Generated workflow ${i + 1} for load testing`,
        status: workflowStatuses[(i + system.name.length) % workflowStatuses.length],
        requestedBy: randomItem(owners),
        reviewer: randomItem(owners),
        priority: randomItem(workflowPriorities),
      });
    }
  }
  for (const chunk of chunkArray(workflowRows, config.chunkSize)) {
    await db.insert(approvalWorkflows).values(chunk);
  }

  const riskRows = [];
  for (const system of createdSystems) {
    for (let i = 0; i < config.riskAssessmentsPerSystem; i += 1) {
      riskRows.push({
        organizationId: system.organizationId,
        systemId: system.id,
        systemName: system.name,
        answers: {
          dataSensitivity: randomItem(dataSensitivities),
          geography: randomItem(geographies),
          externalUsers: randomInt(0, 1) === 1,
          decisionImpact: randomInt(1, 5),
        },
        riskOutcome: system.riskLevel ?? randomItem(riskLevels),
        riskScore: randomInt(15, 96),
        riskExplanation: "Generated for stress and feature verification",
        suggestedControls: controls.slice(0, 5).map((c) => c.controlId),
        completedBy: randomItem(owners),
      });
    }
  }
  for (const chunk of chunkArray(riskRows, config.chunkSize)) {
    await db.insert(riskAssessments).values(chunk);
  }

  const evidenceRows = [];
  for (const system of createdSystems) {
    for (let i = 0; i < config.evidenceFilesPerSystem; i += 1) {
      evidenceRows.push({
        organizationId: system.organizationId,
        systemId: system.id,
        controlId: null,
        workflowId: null,
        fileName: `evidence_${system.id}_${i + 1}.pdf`,
        fileSize: randomInt(15000, 4500000),
        mimeType: "application/pdf",
        filePath: `generated/${config.batchTag}/${system.organizationId}/${system.id}/evidence_${i + 1}.pdf`,
        uploadedBy: randomItem(owners),
      });
    }
  }
  for (const chunk of chunkArray(evidenceRows, config.chunkSize)) {
    await db.insert(evidenceFiles).values(chunk);
  }

  const auditRows = [];
  const auditActions = ["created", "updated", "status_changed", "approved", "exported"];
  for (const system of createdSystems) {
    for (let i = 0; i < config.auditLogsPerSystem; i += 1) {
      auditRows.push({
        organizationId: system.organizationId,
        entityType: "ai_system",
        entityId: system.id,
        action: auditActions[i % auditActions.length],
        performedBy: randomItem(owners),
        details: `Generated audit event ${i + 1} for ${system.name}`,
      });
    }
  }
  for (const chunk of chunkArray(auditRows, config.chunkSize)) {
    await db.insert(auditLogs).values(chunk);
  }

  const notificationUsers = [...createdTestUsers, ...createdExtraUsers];
  const userMemberships = notificationUsers.length > 0
    ? await db.select().from(memberships).where(inArray(memberships.userId, notificationUsers.map((u) => u.id)))
    : [];
  const membershipsByUser = new Map<string, typeof userMemberships>();
  for (const membership of userMemberships) {
    const current = membershipsByUser.get(membership.userId) ?? [];
    current.push(membership);
    membershipsByUser.set(membership.userId, current);
  }

  const notificationRows = [];
  for (const user of notificationUsers) {
    const userOrgs = membershipsByUser.get(user.id);
    if (!userOrgs || userOrgs.length === 0) continue;
    for (let i = 0; i < config.notificationsPerUser; i += 1) {
      const membership = userOrgs[i % userOrgs.length];
      const type = notificationTypes[(i + user.username.length) % notificationTypes.length];
      notificationRows.push({
        organizationId: membership.organizationId,
        userId: user.id,
        title: `Notification ${i + 1} (${type})`,
        message: `Generated notification ${i + 1} for ${user.username}`,
        type,
        entityType: "ai_system",
        entityId: createdSystems[(i + user.username.length) % createdSystems.length]?.id ?? null,
        read: i % 5 === 0,
      });
    }
  }
  for (const chunk of chunkArray(notificationRows, config.chunkSize)) {
    await db.insert(notifications).values(chunk);
  }

  const leadRows = Array.from({ length: config.leadsCount }, (_, i) => ({
    name: `Lead ${i + 1} (${config.batchTag})`,
    workEmail: `lead_${config.batchTag}_${i + 1}@example.com`,
    company: `Company ${((i % 240) + 1).toString()}`,
    role: randomItem(["Head of AI", "CISO", "Compliance Manager", "Risk Officer", "Platform Lead"]),
    teamSize: randomItem(["1-10", "11-50", "51-200", "201-1000", "1000+"]),
    primaryChallenge: randomItem(leadChallenges),
    formType: i % 2 === 0 ? "book_demo" : "start_pilot",
    source: randomItem(["direct", "linkedin", "newsletter", "partner", "conference"]),
    ctaSource: randomItem(["hero", "pricing", "footer", "navbar"]),
    campaign: randomItem(["spring_launch", "pilot_outreach", "security_week", "q1_abm"]),
    lifecycleStage: randomItem(["new", "contacted", "qualified"]),
    notes: `Generated lead ${i + 1} for load testing`,
  }));
  for (const chunk of chunkArray(leadRows, config.chunkSize)) {
    await db.insert(leads).values(chunk);
  }

  const marketingRows = Array.from({ length: config.marketingEventsCount }, (_, i) => ({
    eventName: marketingEventNames[i % marketingEventNames.length],
    pagePath: randomItem(["/", "/book-demo", "/start-pilot", "/thank-you", "/privacy", "/terms", "/security"]),
    section: randomItem(["hero", "product", "pricing", "faq", "footer"]),
    cta: randomItem(["book_demo", "start_pilot", "contact", "talk_to_sales"]),
    source: randomItem(["direct", "linkedin", "newsletter", "partner", "conference"]),
    campaign: randomItem(["spring_launch", "pilot_outreach", "security_week", "q1_abm"]),
    referrer: randomItem(["https://google.com", "https://linkedin.com", "https://example.com", ""]),
    metadata: {
      depth: [25, 50, 75, 100][i % 4],
      sequence: i + 1,
      batchTag: config.batchTag,
    },
  }));
  for (const chunk of chunkArray(marketingRows, config.chunkSize)) {
    await db.insert(marketingEvents).values(chunk);
  }

  const orgCount = orgRecords.length;
  const systemCount = createdSystems.length;
  const userCount = createdTestUsers.length + createdExtraUsers.length;

  console.log("[seed:heavy] Complete");
  console.log(`[seed:heavy] Organizations in scope: ${orgCount}`);
  console.log(`[seed:heavy] Users in scope: ${userCount} (${createdTestUsers.length} test users + ${createdExtraUsers.length} generated users)`);
  console.log(`[seed:heavy] AI systems inserted: ${systemCount}`);
  console.log(`[seed:heavy] System controls inserted: ${controlRows.length}`);
  console.log(`[seed:heavy] Workflows inserted: ${workflowRows.length}`);
  console.log(`[seed:heavy] Risk assessments inserted: ${riskRows.length}`);
  console.log(`[seed:heavy] Evidence files inserted: ${evidenceRows.length}`);
  console.log(`[seed:heavy] Audit logs inserted: ${auditRows.length}`);
  console.log(`[seed:heavy] Notifications inserted: ${notificationRows.length}`);
  console.log(`[seed:heavy] Leads inserted: ${leadRows.length}`);
  console.log(`[seed:heavy] Marketing events inserted: ${marketingRows.length}`);
  console.log("[seed:heavy] Test users (all roles) password: TestUser123!");
  for (const user of testUsers) {
    console.log(`  - ${user.username} (${user.role})`);
  }
}

seed().catch((error) => {
  console.error("[seed:heavy] Failed:", error);
  process.exit(1);
});
