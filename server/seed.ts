import { db } from "./db";
import { and, eq, inArray } from "drizzle-orm";
import {
  aiSystems,
  approvalWorkflows,
  auditLogs,
  complianceControls,
  memberships,
  systemControls,
  users,
} from "@shared/schema";
import { getPasswordExpiryDate, hashPassword } from "./auth";
import { isProductionEnvironment, parseBooleanEnv } from "./env";
import { backfillTenantBoundRows, ensureTenantBootstrap } from "./tenant-bootstrap";

type BaselineTestUser = {
  username: string;
  fullName: string;
  email: string;
  role: string;
};

const BASELINE_TEST_USERS: BaselineTestUser[] = [
  {
    username: "admin_test",
    fullName: "Admin Test User",
    email: "admin_test@aicontrolgrid.local",
    role: "admin",
  },
  {
    username: "cro_test",
    fullName: "CRO Test User",
    email: "cro_test@aicontrolgrid.local",
    role: "cro",
  },
  {
    username: "ciso_test",
    fullName: "CISO Test User",
    email: "ciso_test@aicontrolgrid.local",
    role: "ciso",
  },
  {
    username: "compliance_lead_test",
    fullName: "Compliance Lead Test User",
    email: "compliance_lead_test@aicontrolgrid.local",
    role: "compliance_lead",
  },
  {
    username: "reviewer_test",
    fullName: "Reviewer Test User",
    email: "reviewer_test@aicontrolgrid.local",
    role: "reviewer",
  },
  {
    username: "system_owner_test",
    fullName: "System Owner Test User",
    email: "system_owner_test@aicontrolgrid.local",
    role: "system_owner",
  },
  {
    username: "auditor_test",
    fullName: "Auditor Test User",
    email: "auditor_test@aicontrolgrid.local",
    role: "auditor",
  },
];

async function ensureBaselineTestUsers() {
  const shouldSeedTestUsers =
    process.env.SEED_TEST_USERS !== undefined
      ? parseBooleanEnv(process.env.SEED_TEST_USERS, false)
      : !isProductionEnvironment();
  if (!shouldSeedTestUsers) {
    return;
  }
  const resetTestUserPasswords = parseBooleanEnv(process.env.RESET_TEST_USER_PASSWORDS, false);

  const usernames = BASELINE_TEST_USERS.map((user) => user.username);
  const existingUsers = await db
    .select({ username: users.username })
    .from(users)
    .where(inArray(users.username, usernames));
  const existingUsernames = new Set(existingUsers.map((user) => user.username));

  const testUserPassword = process.env.TEST_USER_PASSWORD || "TestUser123!";
  const hashedPassword = await hashPassword(testUserPassword);

  const missingUsers = BASELINE_TEST_USERS
    .filter((user) => !existingUsernames.has(user.username))
    .map((user) => ({
      username: user.username,
      password: hashedPassword,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    }));

  if (missingUsers.length > 0) {
    await db.insert(users).values(missingUsers);
    console.log(`[seed] Added ${missingUsers.length} missing baseline test users.`);
  }

  if (resetTestUserPasswords) {
    const now = new Date();
    await db
      .update(users)
      .set({
        password: hashedPassword,
        passwordHistory: [],
        passwordChangedAt: now,
        passwordExpiresAt: getPasswordExpiryDate(now),
      })
      .where(inArray(users.username, usernames));
    console.log("[seed] Reset baseline test-user passwords from env.");
  }
}

export async function seedDatabase() {
  const existingUsers = await db.select().from(users);
  let createdPlatformAdminId: string | null = null;
  if (existingUsers.length === 0) {
    const hashed = await hashPassword("admin123");
    const [createdPlatformAdmin] = await db
      .insert(users)
      .values({
        username: "admin",
        password: hashed,
        fullName: "Platform Administrator",
        email: "admin@aicontrolgrid.com",
        role: "admin",
        isPlatformAdmin: true,
      })
      .returning({ id: users.id });
    createdPlatformAdminId = createdPlatformAdmin?.id ?? null;
    console.log("Default admin user created (admin / admin123)");
  }

  await ensureBaselineTestUsers();

  const { organizationId: defaultOrganizationId } = await ensureTenantBootstrap();

  if (createdPlatformAdminId) {
    await db
      .update(memberships)
      .set({ role: "owner", updatedAt: new Date() })
      .where(
        and(
          eq(memberships.userId, createdPlatformAdminId),
          eq(memberships.organizationId, defaultOrganizationId),
        ),
      );
  }

  const existingSystems = await db.select().from(aiSystems);
  if (existingSystems.length > 0) return;

  console.log("Seeding database with initial data...");

  const systems = await db.insert(aiSystems).values([
    {
      name: "Credit Risk Scoring Engine",
      description: "ML model for automated credit risk assessment and loan approval recommendations based on applicant financial data and behavioral patterns.",
      owner: "Sarah Chen",
      department: "Risk Management",
      vendor: "Internal",
      modelType: "Gradient Boosting",
      riskLevel: "high",
      status: "active",
      deploymentContext: "Production - Banking Platform",
      dataSensitivity: "confidential",
      geography: "EU",
      purpose: "Automated credit decisions for retail banking",
      usersImpacted: 250000,
    },
    {
      name: "Customer Support Chatbot",
      description: "LLM-powered conversational agent for handling customer inquiries, complaints, and support ticket routing across all product lines.",
      owner: "Marcus Rodriguez",
      department: "Customer Experience",
      vendor: "OpenAI",
      modelType: "LLM (GPT-4)",
      riskLevel: "limited",
      status: "active",
      deploymentContext: "Production - Customer Portal",
      dataSensitivity: "internal",
      geography: "Global",
      purpose: "Customer support automation and ticket triage",
      usersImpacted: 500000,
    },
    {
      name: "Fraud Detection Pipeline",
      description: "Real-time transaction monitoring system using ensemble models to detect anomalous patterns and flag potentially fraudulent activities.",
      owner: "Dr. James Okonkwo",
      department: "Security Operations",
      vendor: "Internal",
      modelType: "Ensemble (RF + Neural Net)",
      riskLevel: "high",
      status: "active",
      deploymentContext: "Production - Transaction Processing",
      dataSensitivity: "restricted",
      geography: "EU, US",
      purpose: "Real-time fraud detection for payment processing",
      usersImpacted: 1200000,
    },
    {
      name: "Employee Performance Analyzer",
      description: "AI system analyzing employee productivity metrics, communication patterns, and project outcomes for performance review support.",
      owner: "Lisa Andersson",
      department: "Human Resources",
      vendor: "Workday AI",
      modelType: "NLP + Classification",
      riskLevel: "high",
      status: "under_review",
      deploymentContext: "Staging - HR Platform",
      dataSensitivity: "confidential",
      geography: "EU",
      purpose: "Employee performance assessment and workforce analytics",
      usersImpacted: 4500,
    },
    {
      name: "Email Spam Filter",
      description: "Standard email classification system to filter spam and phishing emails from employee inboxes.",
      owner: "Tom Baker",
      department: "IT Operations",
      vendor: "Microsoft",
      modelType: "Classification",
      riskLevel: "minimal",
      status: "active",
      deploymentContext: "Production - Email Infrastructure",
      dataSensitivity: "internal",
      geography: "Global",
      purpose: "Spam and phishing email filtering",
      usersImpacted: 4500,
    },
    {
      name: "Medical Imaging Analyzer",
      description: "Deep learning model for analyzing radiological images to assist clinicians in identifying potential abnormalities and prioritizing cases.",
      owner: "Dr. Maria Gonzalez",
      department: "Clinical Operations",
      vendor: "Internal",
      modelType: "CNN (ResNet)",
      riskLevel: "high",
      status: "draft",
      deploymentContext: "Development - Clinical Trial",
      dataSensitivity: "restricted",
      geography: "EU",
      purpose: "Medical imaging analysis for clinical decision support",
      usersImpacted: 15000,
    },
    {
      name: "Content Recommendation Engine",
      description: "Collaborative filtering system that recommends relevant articles, training materials, and resources to employees based on role and activity.",
      owner: "Alex Kim",
      department: "Learning & Development",
      vendor: "Internal",
      modelType: "Collaborative Filtering",
      riskLevel: "minimal",
      status: "active",
      deploymentContext: "Production - Intranet",
      dataSensitivity: "public",
      geography: "Global",
      purpose: "Internal content personalization",
      usersImpacted: 4500,
    },
  ]).returning();

  const euControls = await db.insert(complianceControls).values([
    { framework: "eu_ai_act", controlId: "EU-RM-01", controlName: "Risk Management System", description: "Establish and maintain a risk management system throughout the AI system lifecycle", category: "Risk Management", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-DG-01", controlName: "Data Governance", description: "Implement data governance and management practices for training, validation, and testing datasets", category: "Data Quality", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-TD-01", controlName: "Technical Documentation", description: "Create and maintain comprehensive technical documentation", category: "Documentation", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-RL-01", controlName: "Record Keeping", description: "Implement automatic recording and logging of events during system operation", category: "Logging", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-TR-01", controlName: "Transparency Requirements", description: "Ensure transparency and provision of information to deployers", category: "Transparency", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-HO-01", controlName: "Human Oversight", description: "Design and implement appropriate human oversight measures", category: "Oversight", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-AR-01", controlName: "Accuracy and Robustness", description: "Achieve appropriate levels of accuracy, robustness, and cybersecurity", category: "Performance", riskLevelApplicable: "high" },
    { framework: "eu_ai_act", controlId: "EU-CA-01", controlName: "Conformity Assessment", description: "Undergo conformity assessment procedures before deployment", category: "Assessment", riskLevelApplicable: "high" },
  ]).returning();

  const nistControls = await db.insert(complianceControls).values([
    { framework: "nist_ai_rmf", controlId: "NIST-GOV-01", controlName: "Governance Structure", description: "Establish AI governance structure with clear roles and responsibilities", category: "GOVERN", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-GOV-02", controlName: "Risk Management Policy", description: "Define organizational AI risk management policies", category: "GOVERN", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-MAP-01", controlName: "Context Mapping", description: "Map AI system context, including intended use and known limitations", category: "MAP", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-MAP-02", controlName: "Stakeholder Identification", description: "Identify and engage stakeholders affected by AI system", category: "MAP", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-MEA-01", controlName: "Performance Measurement", description: "Measure AI system performance against requirements", category: "MEASURE", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-MEA-02", controlName: "Bias Assessment", description: "Assess and monitor for bias in AI system outputs", category: "MEASURE", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-MAN-01", controlName: "Risk Response", description: "Implement risk response and mitigation strategies", category: "MANAGE", riskLevelApplicable: "high" },
    { framework: "nist_ai_rmf", controlId: "NIST-MAN-02", controlName: "Continuous Monitoring", description: "Establish continuous monitoring of AI system risks", category: "MANAGE", riskLevelApplicable: "high" },
  ]).returning();

  const isoControls = await db.insert(complianceControls).values([
    { framework: "iso_42001", controlId: "ISO-4.1", controlName: "Context of the Organization", description: "Determine internal and external issues relevant to AI management", category: "Context", riskLevelApplicable: "high" },
    { framework: "iso_42001", controlId: "ISO-5.1", controlName: "Leadership and Commitment", description: "Top management demonstrates leadership and commitment to AI management system", category: "Leadership", riskLevelApplicable: "high" },
    { framework: "iso_42001", controlId: "ISO-6.1", controlName: "Risk Assessment", description: "Plan and implement actions to address risks and opportunities", category: "Planning", riskLevelApplicable: "high" },
    { framework: "iso_42001", controlId: "ISO-7.1", controlName: "Resources", description: "Determine and provide resources needed for the AI management system", category: "Support", riskLevelApplicable: "high" },
    { framework: "iso_42001", controlId: "ISO-8.1", controlName: "Operational Planning", description: "Plan, implement, and control processes for AI management system", category: "Operation", riskLevelApplicable: "high" },
    { framework: "iso_42001", controlId: "ISO-9.1", controlName: "Performance Evaluation", description: "Monitor, measure, analyze and evaluate AI management system", category: "Evaluation", riskLevelApplicable: "high" },
    { framework: "iso_42001", controlId: "ISO-10.1", controlName: "Improvement", description: "Determine opportunities for improvement and implement necessary actions", category: "Improvement", riskLevelApplicable: "high" },
  ]).returning();

  const allControls = [...euControls, ...nistControls, ...isoControls];
  const highRiskSystems = systems.filter(s => s.riskLevel === "high");

  const scValues: any[] = [];
  const statuses = ["not_started", "in_progress", "implemented", "verified"];
  const assignees = ["Sarah Chen", "Marcus Rodriguez", "Dr. James Okonkwo", "Lisa Andersson", "Tom Baker"];

  for (const sys of highRiskSystems) {
    for (const ctrl of allControls) {
      const statusIndex = Math.floor(Math.random() * 4);
      scValues.push({
        systemId: sys.id,
        controlId: ctrl.id,
        status: statuses[statusIndex],
        assignee: assignees[Math.floor(Math.random() * assignees.length)],
        evidence: statusIndex >= 2 ? `Evidence documented for ${ctrl.controlName}` : null,
        notes: statusIndex >= 1 ? `Assessment in progress for ${sys.name}` : null,
      });
    }
  }

  if (scValues.length > 0) {
    await db.insert(systemControls).values(scValues);
  }

  const wfValues = [
    {
      systemId: systems[0].id,
      title: "Production deployment approval for Credit Risk Engine v2.1",
      description: "Updated model with improved fairness metrics. Seeking approval for EU production deployment.",
      status: "in_review",
      requestedBy: "Sarah Chen",
      reviewer: "Dr. James Okonkwo",
      priority: "high",
    },
    {
      systemId: systems[3].id,
      title: "Initial risk assessment for Employee Performance Analyzer",
      description: "New HR analytics system requires initial risk classification and control mapping before pilot.",
      status: "pending",
      requestedBy: "Lisa Andersson",
      reviewer: "Sarah Chen",
      priority: "critical",
    },
    {
      systemId: systems[1].id,
      title: "Transparency review for Customer Chatbot",
      description: "Verifying EU AI Act transparency compliance for customer-facing chatbot interactions.",
      status: "approved",
      requestedBy: "Marcus Rodriguez",
      reviewer: "Tom Baker",
      priority: "medium",
    },
    {
      systemId: systems[5].id,
      title: "Pre-deployment safety review for Medical Imaging AI",
      description: "Comprehensive safety assessment required before clinical trial phase.",
      status: "pending",
      requestedBy: "Dr. Maria Gonzalez",
      reviewer: "Dr. James Okonkwo",
      priority: "critical",
    },
    {
      systemId: systems[2].id,
      title: "Annual recertification - Fraud Detection Pipeline",
      description: "Annual review and recertification of fraud detection models per regulatory requirements.",
      status: "in_review",
      requestedBy: "Dr. James Okonkwo",
      reviewer: "Sarah Chen",
      priority: "high",
    },
  ];

  await db.insert(approvalWorkflows).values(wfValues);

  await db.insert(auditLogs).values([
    { entityType: "ai_system", entityId: systems[0].id, action: "created", performedBy: "Sarah Chen", details: 'AI system "Credit Risk Scoring Engine" registered' },
    { entityType: "ai_system", entityId: systems[1].id, action: "created", performedBy: "Marcus Rodriguez", details: 'AI system "Customer Support Chatbot" registered' },
    { entityType: "ai_system", entityId: systems[2].id, action: "created", performedBy: "Dr. James Okonkwo", details: 'AI system "Fraud Detection Pipeline" registered' },
    { entityType: "approval_workflow", entityId: systems[0].id, action: "created", performedBy: "Sarah Chen", details: "Approval workflow created for Credit Risk Engine deployment" },
    { entityType: "approval_workflow", entityId: systems[1].id, action: "approved", performedBy: "Tom Baker", details: "Customer Chatbot transparency review approved" },
    { entityType: "system_control", entityId: systems[0].id, action: "status_changed", performedBy: "Sarah Chen", details: 'Control "Risk Management System" marked as implemented' },
    { entityType: "ai_system", entityId: systems[3].id, action: "created", performedBy: "Lisa Andersson", details: 'AI system "Employee Performance Analyzer" registered' },
    { entityType: "approval_workflow", entityId: systems[3].id, action: "created", performedBy: "Lisa Andersson", details: "Initial risk assessment requested for Employee Performance Analyzer" },
  ]);

  await backfillTenantBoundRows(defaultOrganizationId);

  console.log("Database seeded successfully!");
}
