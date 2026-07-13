import { randomUUID } from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../server/db";
import { hashPassword } from "../server/auth";
import { digestInviteToken } from "../server/invite-token";
import { ensureTenantBootstrap } from "../server/tenant-bootstrap";
import { auditService } from "../server/services/auditService";
import { decisionAuditService } from "../server/services/decisionAuditService";
import { incidentService } from "../server/services/incidentService";
import { subscriptionService } from "../server/services/subscriptionService";
import { telemetryAdapterService } from "../server/services/telemetryAdapterService";
import { telemetryPolicyService } from "../server/services/telemetryPolicyService";
import { telemetryService } from "../server/services/telemetryService";
import {
  aiIncidents,
  aiSystems,
  aiTelemetryEvents,
  approvalWorkflows,
  auditLogs,
  backgroundJobs,
  complianceControls,
  decisionAuditSources,
  decisionAudits,
  evidenceFiles,
  jiraIntegrations,
  memberships,
  notifications,
  organizationDomains,
  organizationInvites,
  organizations,
  portfolios,
  portfolioMemberships,
  portfolioOrganizations,
  riskAssessments,
  systemControls,
  users,
  type ApprovalWorkflow,
  type AiSystem,
  type Organization,
  type User,
} from "../shared/schema";

type BaselineUserSpec = {
  username: string;
  fullName: string;
  email: string;
  role: string;
  membershipRole: string;
  isPlatformAdmin?: boolean;
};

type DemoOrgSpec = {
  slug: string;
  name: string;
  plan: "pilot" | "growth" | "enterprise";
  domains: Array<{ domain: string; isPrimary: boolean; isVerified: boolean }>;
  subscription: {
    tier: "pilot" | "growth" | "enterprise";
    status: "trialing" | "active" | "past_due" | "canceled";
    billingEmail: string;
    seatLimit: number;
  };
  jira: {
    enabled: boolean;
    baseUrl: string;
    projectKey: string;
    userEmail: string;
    apiToken: string;
    issueType: string;
    labels: string[];
  };
};

type SystemSpec = {
  organizationSlug: string;
  name: string;
  description: string;
  owner: string;
  department: string;
  vendor: string;
  modelType: string;
  riskLevel: "high" | "limited" | "minimal";
  status: "active" | "under_review" | "approved" | "draft";
  deploymentContext: string;
  dataSensitivity: "public" | "internal" | "confidential" | "restricted";
  geography: string;
  purpose: string;
  usersImpacted: number;
  lastAssessmentDaysAgo: number;
};

type WorkflowSpec = {
  organizationSlug: string;
  systemName: string;
  title: string;
  description: string;
  status: "pending" | "in_review" | "approved" | "rejected" | "escalated";
  requestedBy: string;
  reviewer: string;
  priority: "low" | "medium" | "high" | "critical";
  estimatedFinancialImpact: number;
  usesPii: boolean;
  customerFacing: boolean;
  reversible: boolean;
  strategicImpact: boolean;
  safetyCritical: boolean;
  decisionTier: "tier_1" | "tier_2" | "tier_3";
  committeeType: "technical_team" | "operations_committee" | "governance_committee_ceo";
  blockedReason?: string | null;
  requiredApprovers: string[];
  decision?: string | null;
  decisionNotes?: string | null;
};

type DecisionTraceSpec = {
  organizationSlug: string;
  systemName: string;
  workflowTitle: string;
  title: string;
  businessObjective: string;
  decisionContext: string;
  modelName: string;
  modelVersion: string;
  promptText: string;
  inputSources: Array<Record<string, unknown>>;
  inputSnapshot: Record<string, unknown>;
  decisionConstraints: string[];
  aiOutput: string;
  humanOutput: string;
  overrideRationale: string;
  confidenceScore: number;
  uncertaintyScore: number;
  explainabilityFactors: string[];
  outcome30d: Record<string, unknown>;
  outcome60d: Record<string, unknown>;
  outcome90d: Record<string, unknown>;
  outcomeSummary: string;
  createdBy: string;
  reviewedBy: string;
  sources: Array<{
    sourceType: string;
    sourceName: string;
    sourceVersion?: string;
    qualityFlags?: string[];
    metadata?: Record<string, unknown>;
  }>;
};

type ManualIncidentSpec = {
  organizationSlug: string;
  systemName: string;
  workflowTitle?: string;
  linkedDecisionTitle?: string;
  title: string;
  category: "bias" | "security" | "privacy" | "reliability" | "compliance" | "safety";
  severity: string;
  status: "open" | "contained" | "resolved" | "postmortem";
  description: string;
  owner: string;
  escalatedTo: string;
  detectedDaysAgo: number;
  rootCause: string;
  review: Record<string, unknown>;
  regulatoryNotifications: Array<Record<string, unknown>>;
};

type TelemetrySpec = {
  organizationSlug: string;
  systemName: string;
  modelName: string;
  provider: string;
  gateway: string;
  eventType: string;
  severity: "info" | "warning" | "critical";
  driftScore?: number;
  biasFlags?: string[];
  summary: string;
  metadata?: Record<string, unknown>;
};

type EvidenceSpec = {
  organizationSlug: string;
  systemName: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  uploadedBy: string;
};

export type DemoSeedSummary = {
  portfolioSlug: string;
  portfolioName: string;
  controlTowerLogins: Array<{
    username: string;
    email: string;
    fullName: string;
    role: string;
    password: string;
    defaultOrganizationSlug: string;
  }>;
  linkedRuntime: {
    organizationSlug: string;
    organizationName: string;
    systemName: string;
    systemId: string;
    gateway: string;
    telemetryKey: string;
  };
};

const baselineUsers: BaselineUserSpec[] = [
  { username: "olivia.grant", fullName: "Olivia Grant", email: "olivia.grant@pilotwaveholdings.example", role: "admin", membershipRole: "owner", isPlatformAdmin: true },
  { username: "marcus.reed", fullName: "Marcus Reed", email: "marcus.reed@pilotwaveholdings.example", role: "cro", membershipRole: "cro" },
  { username: "irene.cho", fullName: "Irene Cho", email: "irene.cho@pilotwaveholdings.example", role: "ciso", membershipRole: "ciso" },
  { username: "sophia.malik", fullName: "Sophia Malik", email: "sophia.malik@pilotwaveholdings.example", role: "compliance_lead", membershipRole: "compliance_lead" },
  { username: "noah.bennett", fullName: "Noah Bennett", email: "noah.bennett@northstarbank.example", role: "reviewer", membershipRole: "reviewer" },
  { username: "ethan.ford", fullName: "Ethan Ford", email: "ethan.ford@northstarbank.example", role: "system_owner", membershipRole: "system_owner" },
  { username: "clara.wells", fullName: "Clara Wells", email: "clara.wells@pilotwaveholdings.example", role: "auditor", membershipRole: "auditor" },
];

const demoUserPassword =
  process.env.DEMO_USER_PASSWORD || "Northstar!Demo24";

const sourceCatalog = {
  nistAiRmf: {
    title: "NIST AI RMF 1.0",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
  },
  nistPlaybook: {
    title: "NIST AI RMF Playbook",
    url: "https://www.nist.gov/itl/ai-risk-management-framework/nist-ai-rmf-playbook",
  },
  euAiAct: {
    title: "EU AI Act Regulation (EU) 2024/1689",
    url: "https://eur-lex.europa.eu/eli/reg/2024/1689/",
  },
  oecdIncidents: {
    title: "OECD AI Incidents Monitor",
    url: "https://oecd.ai/en/incidents/",
  },
  oecdMethodology: {
    title: "OECD AIM methodology",
    url: "https://oecd.ai/en/incidents-methodology",
  },
  fdaAiMedicalDevices: {
    title: "FDA Artificial Intelligence-Enabled Medical Devices",
    url: "https://www.fda.gov/medical-devices/software-medical-device-samd/artificial-intelligence-enabled-medical-devices",
  },
  cisaAiRoadmap: {
    title: "CISA Roadmap for Artificial Intelligence",
    url: "https://www.cisa.gov/sites/default/files/2023-11/2023-2024_CISA-Roadmap-for-AI_508c.pdf",
  },
  unescoEducationGuidance: {
    title: "UNESCO Guidance for generative AI in education and research",
    url: "https://www.unesco.org/en/digital-education/ai-future-learning/guidance",
  },
  eeocAiFairness: {
    title: "EEOC Initiative on AI and Algorithmic Fairness",
    url: "https://www.eeoc.gov/newsroom/eeoc-launches-initiative-artificial-intelligence-and-algorithmic-fairness",
  },
};

const demoOrganizations: DemoOrgSpec[] = [
  {
    slug: "northstar-consumer-bank-demo",
    name: "Northstar Consumer Bank Demo",
    plan: "enterprise",
    domains: [
      { domain: "northstarbank.example", isPrimary: true, isVerified: true },
      { domain: "northstarlending.example", isPrimary: false, isVerified: false },
    ],
    subscription: {
      tier: "enterprise",
      status: "active",
      billingEmail: "finops@northstarbank.example",
      seatLimit: 350,
    },
    jira: {
      enabled: false,
      baseUrl: "https://northstarbank-demo.atlassian.net",
      projectKey: "AIGOV",
      userEmail: "governance-bot@northstarbank.example",
      apiToken: "demo-token-placeholder",
      issueType: "Task",
      labels: ["ai-governance", "demo-seed", "northstar"],
    },
  },
  {
    slug: "harborview-diagnostics-demo",
    name: "HarborView Diagnostics Demo",
    plan: "growth",
    domains: [
      { domain: "harborviewhealth.example", isPrimary: true, isVerified: true },
      { domain: "harborviewdx.example", isPrimary: false, isVerified: false },
    ],
    subscription: {
      tier: "growth",
      status: "active",
      billingEmail: "operations@harborviewhealth.example",
      seatLimit: 120,
    },
    jira: {
      enabled: false,
      baseUrl: "https://harborview-demo.atlassian.net",
      projectKey: "SAFETY",
      userEmail: "ops-bot@harborviewhealth.example",
      apiToken: "demo-token-placeholder",
      issueType: "Incident",
      labels: ["ai-governance", "clinical-safety", "demo-seed"],
    },
  },
  {
    slug: "meridian-talent-systems-demo",
    name: "Meridian Talent Systems Demo",
    plan: "pilot",
    domains: [
      { domain: "meridiantalent.example", isPrimary: true, isVerified: true },
      { domain: "meridianworkforce.example", isPrimary: false, isVerified: false },
    ],
    subscription: {
      tier: "pilot",
      status: "trialing",
      billingEmail: "pilot-owner@meridiantalent.example",
      seatLimit: 40,
    },
    jira: {
      enabled: false,
      baseUrl: "https://meridian-demo.atlassian.net",
      projectKey: "HIRING",
      userEmail: "ops-bot@meridiantalent.example",
      apiToken: "demo-token-placeholder",
      issueType: "Task",
      labels: ["ai-governance", "employment", "demo-seed"],
    },
  },
  {
    slug: "silverline-insurance-operations-demo",
    name: "Silverline Insurance Operations Demo",
    plan: "growth",
    domains: [
      { domain: "silverlineinsurance.example", isPrimary: true, isVerified: true },
      { domain: "silverlineclaims.example", isPrimary: false, isVerified: false },
    ],
    subscription: {
      tier: "growth",
      status: "active",
      billingEmail: "ops-finance@silverlineinsurance.example",
      seatLimit: 140,
    },
    jira: {
      enabled: false,
      baseUrl: "https://silverline-demo.atlassian.net",
      projectKey: "CLAIMS",
      userEmail: "claims-bot@silverlineinsurance.example",
      apiToken: "demo-token-placeholder",
      issueType: "Task",
      labels: ["ai-governance", "insurance", "demo-seed"],
    },
  },
  {
    slug: "gridreliant-utilities-demo",
    name: "GridReliant Utilities Demo",
    plan: "enterprise",
    domains: [
      { domain: "gridreliant.example", isPrimary: true, isVerified: true },
      { domain: "gridreliantops.example", isPrimary: false, isVerified: false },
    ],
    subscription: {
      tier: "enterprise",
      status: "active",
      billingEmail: "governance@gridreliant.example",
      seatLimit: 260,
    },
    jira: {
      enabled: false,
      baseUrl: "https://gridreliant-demo.atlassian.net",
      projectKey: "GRID",
      userEmail: "ops-bot@gridreliant.example",
      apiToken: "demo-token-placeholder",
      issueType: "Incident",
      labels: ["ai-governance", "critical-infrastructure", "demo-seed"],
    },
  },
  {
    slug: "summit-education-services-demo",
    name: "Summit Education Services Demo",
    plan: "growth",
    domains: [
      { domain: "summitedu.example", isPrimary: true, isVerified: true },
      { domain: "summitlearning.example", isPrimary: false, isVerified: false },
    ],
    subscription: {
      tier: "growth",
      status: "trialing",
      billingEmail: "program-office@summitedu.example",
      seatLimit: 90,
    },
    jira: {
      enabled: false,
      baseUrl: "https://summit-edu-demo.atlassian.net",
      projectKey: "EDU",
      userEmail: "ops-bot@summitedu.example",
      apiToken: "demo-token-placeholder",
      issueType: "Task",
      labels: ["ai-governance", "education", "demo-seed"],
    },
  },
];

const systems: SystemSpec[] = [
  {
    organizationSlug: "northstar-consumer-bank-demo",
    name: "Credit Eligibility Decision Engine",
    description: "Consumer lending eligibility model aligned to the EU AI Act's high-risk category for access to essential private services. Used to support underwriting analysts with recommendation bands, adverse action factors, and manual review routing.",
    owner: "Avery Brooks",
    department: "Risk Management",
    vendor: "Internal",
    modelType: "XGBoost + policy rules",
    riskLevel: "high",
    status: "active",
    deploymentContext: "Production - consumer lending underwriting",
    dataSensitivity: "restricted",
    geography: "EU, UK",
    purpose: "Credit eligibility recommendations and manual-review prioritization",
    usersImpacted: 185000,
    lastAssessmentDaysAgo: 11,
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    name: "Collections Hardship Assistant",
    description: "Customer-support copilot that drafts hardship options and call summaries for agents handling vulnerable customers, with human approval required before any customer communication is sent.",
    owner: "Nadia Patel",
    department: "Customer Operations",
    vendor: "OpenAI",
    modelType: "GPT-4.1",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - call center and secure messaging",
    dataSensitivity: "confidential",
    geography: "EU",
    purpose: "Draft hardship-support recommendations and summarize agent interactions",
    usersImpacted: 42000,
    lastAssessmentDaysAgo: 18,
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    name: "Retail Support Resolution Copilot",
    description: "Knowledge-grounded support assistant for retail banking service teams. Used for refund, fee, and dispute guidance with policy retrieval and human send approval.",
    owner: "Marcus Dean",
    department: "Customer Experience",
    vendor: "Anthropic",
    modelType: "Claude 3.7 Sonnet",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - service desk",
    dataSensitivity: "internal",
    geography: "Global",
    purpose: "Resolution drafting and policy-grounded customer support assistance",
    usersImpacted: 600000,
    lastAssessmentDaysAgo: 9,
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    name: "Invoice Extraction Copilot",
    description: "Internal OCR and extraction workflow for supplier invoices, used to reduce manual AP workload with spot-check review on exception cases.",
    owner: "Lena Fischer",
    department: "Finance Operations",
    vendor: "Azure AI",
    modelType: "OCR + validation rules",
    riskLevel: "minimal",
    status: "approved",
    deploymentContext: "Production - accounts payable",
    dataSensitivity: "internal",
    geography: "EU",
    purpose: "Invoice field extraction and review queue triage",
    usersImpacted: 180,
    lastAssessmentDaysAgo: 27,
  },
  {
    organizationSlug: "harborview-diagnostics-demo",
    name: "Mammography Triage Model",
    description: "Imaging prioritization model for mammography review queues, modeled as a high-risk clinical decision-support workflow with explicit human oversight and safety monitoring.",
    owner: "Dr. Elena Markovic",
    department: "Clinical AI",
    vendor: "Internal",
    modelType: "CNN ensemble",
    riskLevel: "high",
    status: "under_review",
    deploymentContext: "Pilot - radiology operations",
    dataSensitivity: "restricted",
    geography: "EU",
    purpose: "Prioritize mammography review queues for clinician review",
    usersImpacted: 24000,
    lastAssessmentDaysAgo: 5,
  },
  {
    organizationSlug: "harborview-diagnostics-demo",
    name: "Clinical Documentation Summarizer",
    description: "Draft assistant for radiology and oncology follow-up notes. Outputs are non-final and require clinician acceptance before entering the patient record.",
    owner: "Dr. Maya Singh",
    department: "Clinical Operations",
    vendor: "Azure OpenAI",
    modelType: "GPT-4o",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - clinician workstation",
    dataSensitivity: "restricted",
    geography: "EU, US",
    purpose: "Draft clinician note summaries and follow-up action lists",
    usersImpacted: 8200,
    lastAssessmentDaysAgo: 13,
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    name: "Candidate Screening Ranker",
    description: "Employment screening and ranking workflow used by talent acquisition teams to sort applicants for recruiter review, reflecting the EU AI Act high-risk employment category.",
    owner: "Jordan Alvarez",
    department: "People Analytics",
    vendor: "Internal",
    modelType: "Learning-to-rank model",
    riskLevel: "high",
    status: "under_review",
    deploymentContext: "Pilot - recruiter operations",
    dataSensitivity: "confidential",
    geography: "EU, US",
    purpose: "Prioritize recruiter review queues for high-volume hiring",
    usersImpacted: 18000,
    lastAssessmentDaysAgo: 7,
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    name: "Interview Scheduling Assistant",
    description: "Low-risk scheduling helper that drafts interview slots, reminders, and panel availability summaries without making candidate selection decisions.",
    owner: "Tessa Monroe",
    department: "Talent Operations",
    vendor: "Google Workspace AI",
    modelType: "Scheduling assistant",
    riskLevel: "minimal",
    status: "approved",
    deploymentContext: "Production - recruiter operations",
    dataSensitivity: "internal",
    geography: "Global",
    purpose: "Coordinate interview times and panel scheduling",
    usersImpacted: 2400,
    lastAssessmentDaysAgo: 21,
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    name: "Skills Taxonomy Matcher",
    description: "NLP classifier that maps candidate resume content to internal job-family and skills taxonomies to assist recruiters with manual filtering.",
    owner: "Priya Raman",
    department: "Talent Intelligence",
    vendor: "Anthropic",
    modelType: "Embeddings + classifier",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - recruiter search",
    dataSensitivity: "confidential",
    geography: "Global",
    purpose: "Map resumes to internal skills taxonomy and suggested requisitions",
    usersImpacted: 9600,
    lastAssessmentDaysAgo: 16,
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    name: "Catastrophe Claims Severity Triage",
    description: "Claims-intake triage model used after weather events to prioritize adjuster review queues and fast-track potentially vulnerable policyholders for manual handling.",
    owner: "Imani Rhodes",
    department: "Claims Operations",
    vendor: "Internal",
    modelType: "Gradient boosting + rules",
    riskLevel: "high",
    status: "under_review",
    deploymentContext: "Pilot - catastrophe claims operations",
    dataSensitivity: "restricted",
    geography: "US, UK",
    purpose: "Prioritize catastrophe claim files for adjuster review and escalation",
    usersImpacted: 68000,
    lastAssessmentDaysAgo: 6,
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    name: "Policy Servicing Assistant",
    description: "Policyholder support copilot that drafts coverage explanations and next-step guidance for service representatives with mandatory human approval.",
    owner: "Rhea Collins",
    department: "Service Operations",
    vendor: "OpenAI",
    modelType: "GPT-4.1",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - service center",
    dataSensitivity: "confidential",
    geography: "US",
    purpose: "Draft policy service responses and guide servicing workflows",
    usersImpacted: 210000,
    lastAssessmentDaysAgo: 12,
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    name: "Vegetation Outage Risk Forecaster",
    description: "Critical-infrastructure risk model that prioritizes vegetation management and outage-prevention work orders ahead of storm periods, with field-ops sign-off before dispatch.",
    owner: "Owen Mercer",
    department: "Grid Operations",
    vendor: "Internal",
    modelType: "Spatiotemporal forecasting ensemble",
    riskLevel: "high",
    status: "active",
    deploymentContext: "Production - transmission and distribution operations",
    dataSensitivity: "restricted",
    geography: "US",
    purpose: "Prioritize vegetation management work orders and outage-prevention interventions",
    usersImpacted: 340000,
    lastAssessmentDaysAgo: 8,
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    name: "Outage Communications Copilot",
    description: "Operations-approved customer communications assistant that drafts outage updates and restoration notices from control-room feeds.",
    owner: "Clara Bennett",
    department: "Customer Communications",
    vendor: "Anthropic",
    modelType: "Claude 3.7 Sonnet",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - outage communications",
    dataSensitivity: "internal",
    geography: "US",
    purpose: "Draft restoration notices and outage communications for customer service teams",
    usersImpacted: 500000,
    lastAssessmentDaysAgo: 15,
  },
  {
    organizationSlug: "summit-education-services-demo",
    name: "Scholarship Eligibility Support Model",
    description: "Education-sector decision-support model used to prioritize scholarship applications for counselor review while preserving documented human oversight and explanation capture.",
    owner: "Leah Moreno",
    department: "Student Success",
    vendor: "Internal",
    modelType: "Explainable scoring model",
    riskLevel: "high",
    status: "under_review",
    deploymentContext: "Pilot - student financial support",
    dataSensitivity: "confidential",
    geography: "EU, US",
    purpose: "Prioritize scholarship application review queues for counselor assessment",
    usersImpacted: 12500,
    lastAssessmentDaysAgo: 4,
  },
  {
    organizationSlug: "summit-education-services-demo",
    name: "Admissions Document Review Copilot",
    description: "Staff-facing assistant that summarizes admissions packets and highlights missing materials for manual review by admissions officers.",
    owner: "Mira Thompson",
    department: "Admissions Operations",
    vendor: "Azure OpenAI",
    modelType: "GPT-4o",
    riskLevel: "limited",
    status: "active",
    deploymentContext: "Production - admissions review",
    dataSensitivity: "confidential",
    geography: "Global",
    purpose: "Summarize admissions files and flag missing documents for staff review",
    usersImpacted: 31000,
    lastAssessmentDaysAgo: 14,
  },
];

const workflows: WorkflowSpec[] = [
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Credit Eligibility Decision Engine",
    title: "Expand credit eligibility model to new adverse-action policy set",
    description: "Production release requires governance approval because the model influences access to essential private services, uses PII, and has non-trivial adverse impact exposure.",
    status: "escalated",
    requestedBy: "Avery Brooks",
    reviewer: "Admin Test User",
    priority: "critical",
    estimatedFinancialImpact: 240000,
    usesPii: true,
    customerFacing: true,
    reversible: false,
    strategicImpact: true,
    safetyCritical: false,
    decisionTier: "tier_3",
    committeeType: "governance_committee_ceo",
    blockedReason: "Requires Governance Committee + CEO sign-off before production rollout.",
    requiredApprovers: ["Governance Committee", "CEO", "Chief Risk Officer"],
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Collections Hardship Assistant",
    title: "Approve hardship-assistant policy pack refresh",
    description: "Customer-facing assistant update uses sensitive account context and must pass operations review before agents can use the refreshed policy pack.",
    status: "in_review",
    requestedBy: "Nadia Patel",
    reviewer: "CRO Test User",
    priority: "high",
    estimatedFinancialImpact: 48000,
    usesPii: true,
    customerFacing: true,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee", "Customer Operations Lead"],
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Retail Support Resolution Copilot",
    title: "Approve support-copilot fee dispute prompt update",
    description: "Prompt revision for refund and fee-dispute handling with mandatory human send approval retained.",
    status: "approved",
    requestedBy: "Marcus Dean",
    reviewer: "Compliance Lead Test User",
    priority: "medium",
    estimatedFinancialImpact: 20000,
    usesPii: true,
    customerFacing: true,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee"],
    decision: "approved",
    decisionNotes: "Approved with additional knowledge-grounding checks and refund exception guardrails.",
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Invoice Extraction Copilot",
    title: "Approve invoice extraction OCR model refresh",
    description: "Routine internal model refresh for accounts-payable exception handling with fully reversible outcomes.",
    status: "approved",
    requestedBy: "Lena Fischer",
    reviewer: "Reviewer Test User",
    priority: "low",
    estimatedFinancialImpact: 7000,
    usesPii: false,
    customerFacing: false,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_1",
    committeeType: "technical_team",
    requiredApprovers: ["Technical Team"],
    decision: "approved",
    decisionNotes: "Routine release approved after sample review and exception-rate checks.",
  },
  {
    organizationSlug: "harborview-diagnostics-demo",
    systemName: "Mammography Triage Model",
    title: "Clinical pilot approval for mammography triage model",
    description: "Safety-critical clinical pilot requires governance sign-off, documented clinician oversight, and post-launch drift monitoring commitments.",
    status: "in_review",
    requestedBy: "Dr. Elena Markovic",
    reviewer: "CISO Test User",
    priority: "critical",
    estimatedFinancialImpact: 175000,
    usesPii: true,
    customerFacing: false,
    reversible: false,
    strategicImpact: true,
    safetyCritical: true,
    decisionTier: "tier_3",
    committeeType: "governance_committee_ceo",
    blockedReason: "Clinical safety and governance approvals required before pilot activation.",
    requiredApprovers: ["Governance Committee", "Chief Medical Officer", "CEO"],
  },
  {
    organizationSlug: "harborview-diagnostics-demo",
    systemName: "Clinical Documentation Summarizer",
    title: "Approve note summarizer expansion to oncology workflows",
    description: "Clinical note draft assistant expansion for oncology follow-up teams with human acceptance preserved.",
    status: "pending",
    requestedBy: "Dr. Maya Singh",
    reviewer: "Compliance Lead Test User",
    priority: "medium",
    estimatedFinancialImpact: 36000,
    usesPii: true,
    customerFacing: false,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee", "Clinical Operations Lead"],
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Candidate Screening Ranker",
    title: "Approve recruiter pilot for candidate screening ranker",
    description: "Employment screening workflow falls into the EU AI Act high-risk employment category and requires governance approval before recruiter use.",
    status: "escalated",
    requestedBy: "Jordan Alvarez",
    reviewer: "Admin Test User",
    priority: "critical",
    estimatedFinancialImpact: 140000,
    usesPii: true,
    customerFacing: false,
    reversible: false,
    strategicImpact: true,
    safetyCritical: false,
    decisionTier: "tier_3",
    committeeType: "governance_committee_ceo",
    blockedReason: "Employment-related high-risk AI requires governance review and executive sign-off.",
    requiredApprovers: ["Governance Committee", "CEO", "People Operations Lead"],
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Interview Scheduling Assistant",
    title: "Approve scheduling assistant calendar connector update",
    description: "Connector update for a low-risk scheduling helper with no autonomous hiring decisions.",
    status: "approved",
    requestedBy: "Tessa Monroe",
    reviewer: "Reviewer Test User",
    priority: "low",
    estimatedFinancialImpact: 3000,
    usesPii: false,
    customerFacing: false,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_1",
    committeeType: "technical_team",
    requiredApprovers: ["Technical Team"],
    decision: "approved",
    decisionNotes: "Approved as a low-risk connector refresh after sandbox verification.",
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Skills Taxonomy Matcher",
    title: "Approve skills matcher rollout to recruiter search",
    description: "NLP matching workflow uses candidate profile data and requires operations review for transparency and search-result auditing.",
    status: "rejected",
    requestedBy: "Priya Raman",
    reviewer: "Auditor Test User",
    priority: "medium",
    estimatedFinancialImpact: 22000,
    usesPii: true,
    customerFacing: false,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee"],
    decision: "rejected",
    decisionNotes: "Rejected pending stronger recruiter-facing explanation text and improved search audit logging.",
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Catastrophe Claims Severity Triage",
    title: "Approve catastrophe claims triage rollout for storm season",
    description: "Claims prioritization rollout uses policyholder PII and can influence escalation timing for vulnerable claimants, requiring executive governance sign-off before launch.",
    status: "escalated",
    requestedBy: "Imani Rhodes",
    reviewer: "Admin Test User",
    priority: "critical",
    estimatedFinancialImpact: 190000,
    usesPii: true,
    customerFacing: false,
    reversible: false,
    strategicImpact: true,
    safetyCritical: false,
    decisionTier: "tier_3",
    committeeType: "governance_committee_ceo",
    blockedReason: "Claims-prioritization rollout requires Governance Committee approval before storm-season activation.",
    requiredApprovers: ["Governance Committee", "CEO", "Claims Operations Lead"],
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Policy Servicing Assistant",
    title: "Approve policy-servicing assistant coverage pack refresh",
    description: "Customer-support assistant update uses policyholder context and requires operations review before representatives can use the refreshed guidance pack.",
    status: "in_review",
    requestedBy: "Rhea Collins",
    reviewer: "Compliance Lead Test User",
    priority: "high",
    estimatedFinancialImpact: 54000,
    usesPii: true,
    customerFacing: true,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee", "Service Operations Lead"],
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Vegetation Outage Risk Forecaster",
    title: "Approve grid-operations model for wildfire season dispatch planning",
    description: "Critical-infrastructure planning model informs preventive field dispatch priorities ahead of wildfire season and requires governance review with field-ops constraints.",
    status: "in_review",
    requestedBy: "Owen Mercer",
    reviewer: "CISO Test User",
    priority: "critical",
    estimatedFinancialImpact: 310000,
    usesPii: false,
    customerFacing: false,
    reversible: false,
    strategicImpact: true,
    safetyCritical: true,
    decisionTier: "tier_3",
    committeeType: "governance_committee_ceo",
    blockedReason: "Critical-infrastructure dispatch recommendations require Governance Committee + CEO approval.",
    requiredApprovers: ["Governance Committee", "CEO", "Grid Operations Lead"],
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Outage Communications Copilot",
    title: "Approve outage-communications restoration template update",
    description: "Operations-vetted update to outage communications prompts with mandatory human send approval preserved.",
    status: "approved",
    requestedBy: "Clara Bennett",
    reviewer: "Reviewer Test User",
    priority: "medium",
    estimatedFinancialImpact: 16000,
    usesPii: false,
    customerFacing: true,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee"],
    decision: "approved",
    decisionNotes: "Approved after adding outage-cause uncertainty language and human-send confirmation.",
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Scholarship Eligibility Support Model",
    title: "Approve scholarship support model for counselor pilot",
    description: "Student-support ranking workflow uses sensitive student data and influences financial-aid review prioritization, requiring governance review before pilot launch.",
    status: "escalated",
    requestedBy: "Leah Moreno",
    reviewer: "Admin Test User",
    priority: "critical",
    estimatedFinancialImpact: 125000,
    usesPii: true,
    customerFacing: false,
    reversible: false,
    strategicImpact: true,
    safetyCritical: false,
    decisionTier: "tier_3",
    committeeType: "governance_committee_ceo",
    blockedReason: "Student-support prioritization requires governance review and executive approval before the pilot opens.",
    requiredApprovers: ["Governance Committee", "CEO", "Student Success Lead"],
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Admissions Document Review Copilot",
    title: "Approve admissions document-review copilot expansion",
    description: "Admissions assistant expansion to graduate admissions operations with manual review retained for all file decisions.",
    status: "pending",
    requestedBy: "Mira Thompson",
    reviewer: "Reviewer Test User",
    priority: "medium",
    estimatedFinancialImpact: 18000,
    usesPii: true,
    customerFacing: false,
    reversible: true,
    strategicImpact: false,
    safetyCritical: false,
    decisionTier: "tier_2",
    committeeType: "operations_committee",
    requiredApprovers: ["Operations Committee", "Admissions Lead"],
  },
];

const decisionTraces: DecisionTraceSpec[] = [
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Credit Eligibility Decision Engine",
    workflowTitle: "Expand credit eligibility model to new adverse-action policy set",
    title: "Credit eligibility recommendation with adverse-action review",
    businessObjective: "Reduce manual underwriting time while preserving fairness and adverse-action documentation quality.",
    decisionContext: "Application was submitted by an existing customer with thin-file history and recent income volatility. The model was used to recommend an underwriting band and supporting adverse-action drivers for manual review.",
    modelName: "XGBoost Lending Scorecard",
    modelVersion: "2026.02-risk-bands",
    promptText: "Generate underwriting recommendation band, top contributing factors, and manual review notes for the applicant summary. Do not issue a final decision.",
    inputSources: [
      { type: "application_record", system: "lending_core", version: "2026-02-11" },
      { type: "bureau_snapshot", provider: "Experian", version: "consumer-v5" },
      { type: "policy_rules", source: "credit-risk-policy", version: "2026-Q1" },
    ],
    inputSnapshot: {
      debtToIncomeBand: "41-45%",
      thinFile: true,
      verifiedIncomeChangePct: -12,
      hardshipHistory: false,
    },
    decisionConstraints: [
      "Human underwriter must approve any adverse action.",
      "No fully automated decline allowed for thin-file applicants.",
      "Adverse-action rationale must map to approved factor taxonomy.",
    ],
    aiOutput: "Recommend manual review band B2. Primary contributors: short credit history, recent income reduction, and high revolving utilization. Draft adverse-action factors: insufficient credit history and elevated utilization.",
    humanOutput: "Recommend manual review band B2 with additional affordability review. Draft adverse-action factors retained, but add note that recent verified income reduction requires underwriter confirmation before any adverse action letter is generated.",
    overrideRationale: "The model output was directionally acceptable, but policy requires a stronger manual-review note when recent income reduction is present.",
    confidenceScore: 82,
    uncertaintyScore: 24,
    explainabilityFactors: ["credit_history_length", "revolving_utilization", "verified_income_change"],
    outcome30d: { approvedRate: 61, manualReviewRate: 100, adverseActionDocumentationComplete: true },
    outcome60d: { fairnessGapPct: 2.1, complaints: 0 },
    outcome90d: { delinquencyLiftPct: -0.6, manualOverrideRate: 28 },
    outcomeSummary: "The recommendation path improved underwriting cycle time while keeping manual review and adverse-action documentation controls intact.",
    createdBy: "Avery Brooks",
    reviewedBy: "Admin Test User",
    sources: [
      {
        sourceType: "regulatory_reference",
        sourceName: sourceCatalog.euAiAct.title,
        metadata: { url: sourceCatalog.euAiAct.url, applicability: "Annex III essential private services" },
      },
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.nistAiRmf.title,
        metadata: { url: sourceCatalog.nistAiRmf.url, function: ["Govern", "Map", "Measure", "Manage"] },
      },
    ],
  },
  {
    organizationSlug: "harborview-diagnostics-demo",
    systemName: "Mammography Triage Model",
    workflowTitle: "Clinical pilot approval for mammography triage model",
    title: "Clinical triage recommendation with radiologist override",
    businessObjective: "Shorten mammography review queue time without reducing clinician oversight or safety monitoring.",
    decisionContext: "The model was used to prioritize a case flagged for expedited radiologist review. A radiologist reviewed both the image and the model rationale before assigning final priority.",
    modelName: "Mammo Priority Net",
    modelVersion: "pilot-rc3",
    promptText: "Assess whether the case should be prioritized for same-day review and provide a concise rationale for clinician review only.",
    inputSources: [
      { type: "dicom_image", system: "pacs", version: "2026-03-03" },
      { type: "radiology_metadata", source: "ehr", version: "fhir-r4" },
    ],
    inputSnapshot: {
      breastDensity: "heterogeneously_dense",
      priorImagingAvailable: true,
      referralReason: "screening_follow_up",
    },
    decisionConstraints: [
      "Clinician must make the final triage decision.",
      "Model cannot suppress urgent manual review requests.",
      "Escalate to safety review if drift exceeds policy threshold.",
    ],
    aiOutput: "Recommend same-day review priority due to pattern combination associated with elevated follow-up risk. Confidence moderate-high.",
    humanOutput: "Recommend same-day review priority, but document lower confidence due to dense tissue profile and require second-reader confirmation during the pilot period.",
    overrideRationale: "Dense-tissue cases in the pilot require second-reader confirmation even when model confidence appears acceptable.",
    confidenceScore: 76,
    uncertaintyScore: 33,
    explainabilityFactors: ["mass_shape_signal", "microcalcification_cluster", "comparison_to_prior_image"],
    outcome30d: { sameDayReviewRate: 100, secondReaderApplied: true },
    outcome60d: { safetyEscalations: 1, pilotFalseNegativeDriftPct: 4.8 },
    outcome90d: { averageQueueReductionHours: 5.2, clinicianOverrideRate: 31 },
    outcomeSummary: "Pilot queue times improved, but dense-tissue cohorts required additional override safeguards and drift monitoring.",
    createdBy: "Dr. Elena Markovic",
    reviewedBy: "Dr. Maya Singh",
    sources: [
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.nistPlaybook.title,
        metadata: { url: sourceCatalog.nistPlaybook.url, focus: "measure and manage safety monitoring" },
      },
      {
        sourceType: "incident_reference",
        sourceName: sourceCatalog.oecdIncidents.title,
        metadata: { url: sourceCatalog.oecdIncidents.url, note: "Used to structure clinical incident review scenarios." },
      },
    ],
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Candidate Screening Ranker",
    workflowTitle: "Approve recruiter pilot for candidate screening ranker",
    title: "Candidate shortlist recommendation with recruiter override",
    businessObjective: "Reduce recruiter triage time while preserving fair review and documented override rationale for candidate progression decisions.",
    decisionContext: "The ranker was used to produce a recruiter shortlist for a high-volume customer-support role. A recruiter reviewed the top candidates and adjusted the shortlist before outreach.",
    modelName: "Meridian Ranker",
    modelVersion: "pilot-2026-03",
    promptText: "Rank applicants for recruiter review based on job-fit signals from the approved feature set. Exclude protected-class information and provide explanation tokens for reviewer context only.",
    inputSources: [
      { type: "resume_parse", system: "ats-ingest", version: "2026.03" },
      { type: "job_profile", source: "requisition-service", version: "req-v9" },
      { type: "skills_taxonomy", source: "taxonomy-service", version: "2026-Q1" },
    ],
    inputSnapshot: {
      roleFamily: "customer_support",
      applicantCount: 147,
      explanationMode: "tokenized_factors",
    },
    decisionConstraints: [
      "Recruiters must review all shortlisted candidates before outreach.",
      "Employment-gap proxies cannot be used as stand-alone exclusion factors.",
      "Bias and override telemetry must be monitored during the pilot.",
    ],
    aiOutput: "Top shortlist prioritizes candidates with continuous service experience and short training ramp signals. Explanation tokens emphasize recency, tenure consistency, and customer-facing volume.",
    humanOutput: "Shortlist adjusted to restore two candidates with non-linear career history after recruiter review found strong relevant service experience that the model underweighted.",
    overrideRationale: "The model overweighted continuous tenure proxies, so the recruiter reinstated candidates with relevant transferable experience and documented the change for bias review.",
    confidenceScore: 71,
    uncertaintyScore: 38,
    explainabilityFactors: ["recent_customer_service_tenure", "role_similarity_score", "skills_taxonomy_match"],
    outcome30d: { recruiterTimeSavedHours: 18, manualOverrideRate: 36 },
    outcome60d: { fairnessReviewFlagged: true, cohortGapPct: 6.3 },
    outcome90d: { outcomeTrackingComplete: true, recruiterSatisfaction: "mixed" },
    outcomeSummary: "The pilot reduced recruiter triage time, but override patterns and cohort gaps triggered a bias review and remediation plan before wider rollout.",
    createdBy: "Jordan Alvarez",
    reviewedBy: "Admin Test User",
    sources: [
      {
        sourceType: "regulatory_reference",
        sourceName: sourceCatalog.euAiAct.title,
        metadata: { url: sourceCatalog.euAiAct.url, applicability: "Annex III employment and workers management" },
      },
      {
        sourceType: "incident_reference",
        sourceName: sourceCatalog.oecdMethodology.title,
        metadata: { url: sourceCatalog.oecdMethodology.url, note: "Used to structure incident categorization and post-incident review." },
      },
    ],
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Retail Support Resolution Copilot",
    workflowTitle: "Approve support-copilot fee dispute prompt update",
    title: "Fee-dispute support answer with policy-grounded override",
    businessObjective: "Improve first-contact resolution while keeping fee-exception decisions policy-grounded and human-approved.",
    decisionContext: "The assistant drafted a response to a customer fee-dispute scenario with policy retrieval and a refund recommendation for agent review.",
    modelName: "Claude 3.7 Sonnet",
    modelVersion: "knowledge-pack-2026-02",
    promptText: "Draft a fee-dispute response using the retrieved policy articles only. Identify where human approval is required before any exception is granted.",
    inputSources: [
      { type: "retrieval_context", system: "policy-search", version: "2026-02" },
      { type: "conversation_summary", source: "crm", version: "thread-v2" },
    ],
    inputSnapshot: {
      disputeType: "overdraft_fee",
      customerSegment: "retail_premium",
      retrievalArticleCount: 3,
    },
    decisionConstraints: [
      "No fee waiver can be communicated without agent approval.",
      "Assistant must remain grounded to retrieved policy passages.",
    ],
    aiOutput: "Draft recommends a one-time refund exception and cites the general goodwill policy, but omits the premium-tier exception threshold.",
    humanOutput: "Draft revised to remove the unsupported refund promise and to instruct the agent to review the premium-tier threshold before offering any exception.",
    overrideRationale: "The initial answer overreached beyond the retrieved threshold rule, so the human reviewer removed the unsupported refund language.",
    confidenceScore: 68,
    uncertaintyScore: 31,
    explainabilityFactors: ["retrieved_policy_match", "customer_segment_rule", "dispute_history"],
    outcome30d: { firstContactResolutionPct: 74 },
    outcome60d: { unsupportedExceptionMessages: 0 },
    outcome90d: { overrideRate: 22, complaints: 1 },
    outcomeSummary: "Policy-grounded overrides reduced unsupported refund language and kept agent-approved exceptions within threshold rules.",
    createdBy: "Marcus Dean",
    reviewedBy: "Compliance Lead Test User",
    sources: [
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.nistAiRmf.title,
        metadata: { url: sourceCatalog.nistAiRmf.url, focus: "governance and monitoring of customer-facing AI support" },
      },
    ],
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Catastrophe Claims Severity Triage",
    workflowTitle: "Approve catastrophe claims triage rollout for storm season",
    title: "Catastrophe claim severity recommendation with adjuster override",
    businessObjective: "Reduce catastrophe claim backlog while preserving vulnerable-customer escalation and documented adjuster overrides.",
    decisionContext: "The triage model was used to prioritize a weather-related home claim with potential habitability concerns. An adjuster reviewed the recommendation before deciding escalation timing.",
    modelName: "CAT Severity Ranker",
    modelVersion: "2026-storm-ops-rc2",
    promptText: "Recommend claims triage priority and vulnerability-routing notes for adjuster review only. Do not finalize payout or denial decisions.",
    inputSources: [
      { type: "claim_intake", system: "claims-core", version: "2026-03-05" },
      { type: "weather_event_feed", provider: "NOAA", version: "storm-alert-v4" },
      { type: "policy_summary", source: "policy-admin", version: "claims-pack-2026-Q1" },
    ],
    inputSnapshot: {
      propertyDamageBand: "major",
      vulnerabilityFlagPresent: true,
      regionStormSeverity: "high",
      priorClaimCount: 0,
    },
    decisionConstraints: [
      "Human adjuster must approve any vulnerable-customer escalation path.",
      "No automated denial or payout recommendation may be issued.",
      "Escalation rationale must cite approved claims policy factors.",
    ],
    aiOutput: "Recommend priority band A2 with expedited contact path. Primary factors: major property damage indicators, severe regional storm conditions, and vulnerability flag.",
    humanOutput: "Recommend priority band A1 with same-day adjuster outreach because the vulnerability flag and habitability note warrant faster escalation than the model suggested.",
    overrideRationale: "The model underweighted the habitability note, so the adjuster moved the claim into the highest manual-priority band.",
    confidenceScore: 79,
    uncertaintyScore: 26,
    explainabilityFactors: ["damage_indicator_score", "regional_storm_severity", "vulnerability_flag"],
    outcome30d: { backlogReductionPct: 18, vulnerableEscalationsReviewed: true },
    outcome60d: { complaintCount: 0, priorityBandOverrides: 29 },
    outcome90d: { payoutAccuracyLiftPct: 1.9, customerContactSlaMetPct: 96 },
    outcomeSummary: "The workflow reduced backlog pressure while keeping vulnerable-customer escalations under documented adjuster control.",
    createdBy: "Imani Rhodes",
    reviewedBy: "Admin Test User",
    sources: [
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.nistAiRmf.title,
        metadata: { url: sourceCatalog.nistAiRmf.url, focus: "governance and human review for consequential financial workflows" },
      },
      {
        sourceType: "incident_reference",
        sourceName: sourceCatalog.oecdIncidents.title,
        metadata: { url: sourceCatalog.oecdIncidents.url, note: "Used to structure claim-handling incident and hazard scenarios." },
      },
    ],
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Vegetation Outage Risk Forecaster",
    workflowTitle: "Approve grid-operations model for wildfire season dispatch planning",
    title: "Wildfire-season dispatch recommendation with field-ops override",
    businessObjective: "Improve preventive dispatch planning before severe weather while preserving field-operations authority and safety controls.",
    decisionContext: "The model was used to prioritize vegetation-management work orders before a forecasted high-wind period. Field operations reviewed the model ranking before dispatch.",
    modelName: "GridReliant Vegetation Forecaster",
    modelVersion: "ws-2026-04",
    promptText: "Rank work orders by outage-prevention urgency for field-ops review. Highlight uncertainty and safety notes for dispatch managers.",
    inputSources: [
      { type: "asset_registry", system: "grid-asset-service", version: "asset-v12" },
      { type: "vegetation_survey", source: "field-inspection-app", version: "2026-spring" },
      { type: "weather_forecast", provider: "NOAA", version: "wx-grid-v7" },
    ],
    inputSnapshot: {
      circuitType: "distribution",
      windRiskBand: "severe",
      treeContactProbability: "high",
      protectedHabitatConstraint: true,
    },
    decisionConstraints: [
      "Dispatch managers must approve all preventive work orders.",
      "Protected-habitat constraints require environmental review before dispatch.",
      "Safety-critical recommendations require uncertainty review during severe weather windows.",
    ],
    aiOutput: "Recommend immediate dispatch for circuits 14A, 14B, and 21C with severe-wind exposure and likely vegetation contact risk.",
    humanOutput: "Approve immediate dispatch for circuits 14A and 21C, but defer 14B until environmental review confirms protected-habitat restrictions can be safely managed.",
    overrideRationale: "The model correctly prioritized risk but did not fully account for habitat constraints that affect dispatch sequencing.",
    confidenceScore: 74,
    uncertaintyScore: 35,
    explainabilityFactors: ["wind_exposure_score", "tree_contact_probability", "asset_criticality"],
    outcome30d: { outagePreventionWorkOrdersCompleted: 12, fieldOverrideRate: 25 },
    outcome60d: { preventedOutagesEstimate: 4, environmentalEscalations: 1 },
    outcome90d: { averageDispatchLeadTimeImprovementHours: 7.4, safetyIncidents: 0 },
    outcomeSummary: "Preventive dispatch planning improved, but field-ops overrides remained necessary for environmental and safety constraints.",
    createdBy: "Owen Mercer",
    reviewedBy: "CISO Test User",
    sources: [
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.cisaAiRoadmap.title,
        metadata: { url: sourceCatalog.cisaAiRoadmap.url, focus: "critical infrastructure resilience and AI deployment governance" },
      },
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.nistPlaybook.title,
        metadata: { url: sourceCatalog.nistPlaybook.url, focus: "measure and manage field-risk decision support" },
      },
    ],
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Scholarship Eligibility Support Model",
    workflowTitle: "Approve scholarship support model for counselor pilot",
    title: "Scholarship priority recommendation with counselor override",
    businessObjective: "Shorten counselor triage time for scholarship reviews while preserving equitable review and explanation capture.",
    decisionContext: "The model produced a scholarship review priority recommendation for a first-generation applicant with incomplete extracurricular metadata. A counselor reviewed the recommendation before assigning final priority.",
    modelName: "Summit Scholarship Supporter",
    modelVersion: "pilot-2026-q2",
    promptText: "Generate scholarship review priority and explanation tokens for counselor review only. Do not make a final award recommendation.",
    inputSources: [
      { type: "application_packet", system: "student-records", version: "2026-spring" },
      { type: "financial_aid_profile", source: "aid-service", version: "aid-v5" },
      { type: "scholarship_policy", source: "policy-repo", version: "2026-cycle" },
    ],
    inputSnapshot: {
      firstGenerationFlag: true,
      householdIncomeBand: "low",
      extracurricularCompleteness: "partial",
      counselorPriorityQueue: "general_merit",
    },
    decisionConstraints: [
      "Counselors must approve final scholarship review priority.",
      "Incomplete metadata cannot be used as a stand-alone deprioritization factor.",
      "Bias monitoring remains mandatory during the pilot.",
    ],
    aiOutput: "Recommend medium review priority due to partial extracurricular metadata and moderate merit indicators.",
    humanOutput: "Recommend high review priority because the applicant meets first-generation and financial-need criteria that deserve faster counselor review despite incomplete extracurricular metadata.",
    overrideRationale: "The model underweighted contextual support criteria and overweighted incomplete extracurricular fields in the pilot cohort.",
    confidenceScore: 69,
    uncertaintyScore: 40,
    explainabilityFactors: ["financial_need_score", "academic_signal_score", "metadata_completeness"],
    outcome30d: { counselorTimeSavedHours: 9, overrideRate: 34 },
    outcome60d: { fairnessReviewFlagged: true, cohortGapPct: 5.8 },
    outcome90d: { followUpCompletedPct: 100, counselorTrustRating: "cautious_positive" },
    outcomeSummary: "The pilot improved counselor throughput, but override and fairness reviews remained essential to prevent deprioritizing incomplete-yet-eligible applicants.",
    createdBy: "Leah Moreno",
    reviewedBy: "Admin Test User",
    sources: [
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.unescoEducationGuidance.title,
        metadata: { url: sourceCatalog.unescoEducationGuidance.url, focus: "human-centered oversight and data protection in education AI" },
      },
      {
        sourceType: "framework_reference",
        sourceName: sourceCatalog.euAiAct.title,
        metadata: { url: sourceCatalog.euAiAct.url, applicability: "education and vocational training risk scenarios" },
      },
    ],
  },
];

const manualIncidents: ManualIncidentSpec[] = [
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Candidate Screening Ranker",
    workflowTitle: "Approve recruiter pilot for candidate screening ranker",
    linkedDecisionTitle: "Candidate shortlist recommendation with recruiter override",
    title: "Bias review triggered for candidate screening ranker",
    category: "bias",
    severity: "critical",
    status: "postmortem",
    description: "Recruiter overrides and cohort-gap analysis indicated the model was overweighting continuous-tenure signals and disadvantaging candidates with non-linear career histories.",
    owner: "Jordan Alvarez",
    escalatedTo: "People Operations and Governance Committee",
    detectedDaysAgo: 19,
    rootCause: "Continuous-tenure and recent-employer stability features acted as proxies for non-job-related screening preferences in the pilot cohort.",
    review: {
      summary: "Pilot paused, feature set narrowed, and recruiter override review thresholds were tightened before any wider rollout.",
      remediation: [
        "Removed continuous-tenure proxy feature",
        "Added cohort-level override review",
        "Required rationale capture for shortlist removals",
      ],
    },
    regulatoryNotifications: [
      {
        authority: "Internal legal and DPO review",
        status: "completed",
        note: "No external filing required during pilot; internal employment-law review completed.",
      },
    ],
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Retail Support Resolution Copilot",
    workflowTitle: "Approve support-copilot fee dispute prompt update",
    linkedDecisionTitle: "Fee-dispute support answer with policy-grounded override",
    title: "Unsupported refund guidance drafted by retail support copilot",
    category: "reliability",
    severity: "high",
    status: "resolved",
    description: "A support draft suggested a fee-refund path that was not fully supported by the retrieved policy threshold rules. Human review blocked the message before customer delivery.",
    owner: "Marcus Dean",
    escalatedTo: "Customer Operations Lead",
    detectedDaysAgo: 8,
    rootCause: "Prompt pack allowed goodwill refund language without sufficiently emphasizing the premium-tier threshold article.",
    review: {
      summary: "Prompt template was narrowed and retrieval ranking was updated to pin the threshold rule higher in the answer context.",
    },
    regulatoryNotifications: [],
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Policy Servicing Assistant",
    workflowTitle: "Approve policy-servicing assistant coverage pack refresh",
    title: "Unsupported exclusion language drafted in policy servicing assistant",
    category: "reliability",
    severity: "high",
    status: "resolved",
    description: "A service draft cited an exclusion phrase that was not in the active policy pack. Human review blocked the response before it reached the policyholder.",
    owner: "Rhea Collins",
    escalatedTo: "Service Operations Lead",
    detectedDaysAgo: 6,
    rootCause: "A stale coverage article remained in the retrieval index after the latest policy pack refresh.",
    review: {
      summary: "The retrieval index was rebuilt, stale exclusions were removed, and service agents were instructed to require explicit policy citations on all draft responses.",
    },
    regulatoryNotifications: [],
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Vegetation Outage Risk Forecaster",
    workflowTitle: "Approve grid-operations model for wildfire season dispatch planning",
    linkedDecisionTitle: "Wildfire-season dispatch recommendation with field-ops override",
    title: "Field dispatch review triggered for outage-risk forecaster",
    category: "safety",
    severity: "critical",
    status: "contained",
    description: "Field-operations review found the model was elevating work orders in environmentally restricted zones without sufficient constraint weighting.",
    owner: "Owen Mercer",
    escalatedTo: "Grid Operations and Environmental Safety Committee",
    detectedDaysAgo: 11,
    rootCause: "Habitat and environmental restriction features were insufficiently weighted in the dispatch-ranking model.",
    review: {
      summary: "Dispatch recommendations for constrained zones were paused, environmental review was made mandatory, and weighting for habitat constraints was increased before resumed use.",
      remediation: [
        "Added hard constraint check for protected habitats",
        "Required field-ops rationale on overridden dispatch rankings",
        "Expanded pre-season validation cohort",
      ],
    },
    regulatoryNotifications: [
      {
        authority: "Internal environmental compliance office",
        status: "completed",
        note: "Internal review completed; no external filing required because no dispatch occurred in restricted areas.",
      },
    ],
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Scholarship Eligibility Support Model",
    workflowTitle: "Approve scholarship support model for counselor pilot",
    linkedDecisionTitle: "Scholarship priority recommendation with counselor override",
    title: "Bias review initiated for scholarship support pilot",
    category: "bias",
    severity: "critical",
    status: "postmortem",
    description: "Counselor overrides indicated the model was systematically underprioritizing applicants with incomplete extracurricular metadata despite strong need-based indicators.",
    owner: "Leah Moreno",
    escalatedTo: "Student Success Governance Council",
    detectedDaysAgo: 15,
    rootCause: "Metadata completeness signals were overweighted relative to contextual support and need-based review criteria.",
    review: {
      summary: "The pilot was narrowed to counselor-assist only, metadata completeness weight was reduced, and rationale capture became mandatory for deprioritizations.",
      remediation: [
        "Reduced metadata completeness feature weight",
        "Added fairness cohort review for first-generation applicants",
        "Introduced counselor rationale requirement on downward priority adjustments",
      ],
    },
    regulatoryNotifications: [
      {
        authority: "Internal legal and student equity review",
        status: "completed",
        note: "Internal education equity review completed; no external filing required during pilot stage.",
      },
    ],
  },
];

const telemetryEvents: TelemetrySpec[] = [
  {
    organizationSlug: "harborview-diagnostics-demo",
    systemName: "Mammography Triage Model",
    modelName: "Mammo Priority Net",
    provider: "Internal",
    gateway: "clinical-model-gateway",
    eventType: "drift_monitor",
    severity: "critical",
    driftScore: 8,
    summary: "Dense-tissue false-negative drift crossed the warning threshold during the mammography pilot.",
    metadata: {
      safetyFlags: ["false_negative_drift"],
      validationWindowDays: 14,
      cohort: "dense_tissue_cases",
    },
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Candidate Screening Ranker",
    modelName: "Meridian Ranker",
    provider: "Internal",
    gateway: "talent-ranking-gateway",
    eventType: "bias_monitor",
    severity: "critical",
    biasFlags: ["gender_gap", "career_break_proxy"],
    summary: "Bias monitoring flagged a cohort gap in recruiter shortlist outcomes for the screening ranker pilot.",
    metadata: {
      overrideRate: 52,
      monitoredCohort: "career_break_candidates",
    },
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Retail Support Resolution Copilot",
    modelName: "Claude 3.7 Sonnet",
    provider: "Anthropic",
    gateway: "customer-support-gateway",
    eventType: "error_rate_anomaly",
    severity: "warning",
    summary: "Support copilot error rate increased after the latest knowledge-pack refresh.",
    metadata: {
      errorRate: 6,
      affectedIntent: "fee_disputes",
    },
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Credit Eligibility Decision Engine",
    modelName: "XGBoost Lending Scorecard",
    provider: "Internal",
    gateway: "underwriting-gateway",
    eventType: "override_spike",
    severity: "warning",
    summary: "Underwriter overrides increased above the portfolio warning threshold after the latest adverse-action policy refresh.",
    metadata: {
      overrideRate: 44,
      monitoredWindowDays: 30,
    },
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Catastrophe Claims Severity Triage",
    modelName: "CAT Severity Ranker",
    provider: "Internal",
    gateway: "claims-priority-gateway",
    eventType: "override_spike",
    severity: "warning",
    summary: "Adjuster overrides increased after storm-event triage prioritization rules were expanded.",
    metadata: {
      overrideRate: 41,
      monitoredWindowDays: 14,
    },
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Policy Servicing Assistant",
    modelName: "GPT-4.1",
    provider: "OpenAI",
    gateway: "policy-service-gateway",
    eventType: "error_rate_anomaly",
    severity: "warning",
    summary: "Coverage-draft citation errors increased after the latest policy knowledge pack refresh.",
    metadata: {
      errorRate: 7,
      affectedIntent: "coverage_explanations",
    },
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Vegetation Outage Risk Forecaster",
    modelName: "GridReliant Vegetation Forecaster",
    provider: "Internal",
    gateway: "grid-ops-gateway",
    eventType: "drift_monitor",
    severity: "critical",
    driftScore: 9,
    summary: "Dispatch-risk drift crossed the critical threshold for constrained environmental zones.",
    metadata: {
      safetyFlags: ["environmental_constraint_miss"],
      validationWindowDays: 21,
      cohort: "protected_habitat_zones",
    },
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Scholarship Eligibility Support Model",
    modelName: "Summit Scholarship Supporter",
    provider: "Internal",
    gateway: "student-support-gateway",
    eventType: "bias_monitor",
    severity: "critical",
    biasFlags: ["first_generation_gap", "metadata_completeness_proxy"],
    summary: "Bias monitoring flagged a counselor-override pattern for first-generation applicants in the scholarship pilot.",
    metadata: {
      overrideRate: 47,
      monitoredCohort: "first_generation_applicants",
    },
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Admissions Document Review Copilot",
    modelName: "GPT-4o",
    provider: "Azure OpenAI",
    gateway: "admissions-review-gateway",
    eventType: "error_rate_anomaly",
    severity: "warning",
    summary: "Admissions document review prompts produced a rise in missing-material false positives after prompt tuning.",
    metadata: {
      errorRate: 6,
      affectedIntent: "missing_document_flags",
    },
  },
];

const evidence: EvidenceSpec[] = [
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Credit Eligibility Decision Engine",
    fileName: "credit-model-card-q1-2026.pdf",
    fileSize: 834112,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/northstar/credit-model-card-q1-2026.pdf",
    uploadedBy: "Avery Brooks",
  },
  {
    organizationSlug: "northstar-consumer-bank-demo",
    systemName: "Credit Eligibility Decision Engine",
    fileName: "adverse-action-control-test-results.xlsx",
    fileSize: 214099,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filePath: "/demo-evidence/northstar/adverse-action-control-test-results.xlsx",
    uploadedBy: "Compliance Lead Test User",
  },
  {
    organizationSlug: "harborview-diagnostics-demo",
    systemName: "Mammography Triage Model",
    fileName: "clinical-safety-review-pack.pdf",
    fileSize: 1053012,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/harborview/clinical-safety-review-pack.pdf",
    uploadedBy: "Dr. Elena Markovic",
  },
  {
    organizationSlug: "meridian-talent-systems-demo",
    systemName: "Candidate Screening Ranker",
    fileName: "pilot-bias-review-findings.pdf",
    fileSize: 553204,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/meridian/pilot-bias-review-findings.pdf",
    uploadedBy: "Jordan Alvarez",
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Catastrophe Claims Severity Triage",
    fileName: "cat-claims-governance-review-pack.pdf",
    fileSize: 742610,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/silverline/cat-claims-governance-review-pack.pdf",
    uploadedBy: "Imani Rhodes",
  },
  {
    organizationSlug: "silverline-insurance-operations-demo",
    systemName: "Policy Servicing Assistant",
    fileName: "policy-pack-retrieval-validation.xlsx",
    fileSize: 188420,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filePath: "/demo-evidence/silverline/policy-pack-retrieval-validation.xlsx",
    uploadedBy: "Rhea Collins",
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Vegetation Outage Risk Forecaster",
    fileName: "wildfire-season-dispatch-controls.pdf",
    fileSize: 917204,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/gridreliant/wildfire-season-dispatch-controls.pdf",
    uploadedBy: "Owen Mercer",
  },
  {
    organizationSlug: "gridreliant-utilities-demo",
    systemName: "Outage Communications Copilot",
    fileName: "outage-message-grounding-test-results.pdf",
    fileSize: 311220,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/gridreliant/outage-message-grounding-test-results.pdf",
    uploadedBy: "Clara Bennett",
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Scholarship Eligibility Support Model",
    fileName: "scholarship-fairness-review-pack.pdf",
    fileSize: 604500,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/summit/scholarship-fairness-review-pack.pdf",
    uploadedBy: "Leah Moreno",
  },
  {
    organizationSlug: "summit-education-services-demo",
    systemName: "Admissions Document Review Copilot",
    fileName: "admissions-document-copilot-validation.pdf",
    fileSize: 287100,
    mimeType: "application/pdf",
    filePath: "/demo-evidence/summit/admissions-document-copilot-validation.pdf",
    uploadedBy: "Mira Thompson",
  },
];

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function ensureBaselineUsers() {
  const existing = await db.select().from(users).where(inArray(users.username, baselineUsers.map((user) => user.username)));
  const existingByUsername = new Map(existing.map((user) => [user.username, user]));
  const passwordHash = await hashPassword(demoUserPassword);

  const missing = baselineUsers
    .filter((user) => !existingByUsername.has(user.username))
    .map((user) => ({
      username: user.username,
      password: passwordHash,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin ?? false,
    }));

  if (missing.length > 0) {
    await db.insert(users).values(missing);
  }

  const refreshed = await db.select().from(users).where(inArray(users.username, baselineUsers.map((user) => user.username)));
  const refreshedByUsername = new Map(refreshed.map((user) => [user.username, user]));
  for (const user of baselineUsers) {
    const persistedUser = refreshedByUsername.get(user.username);
    if (!persistedUser) continue;
    await db
      .update(users)
      .set({ isPlatformAdmin: user.isPlatformAdmin === true })
      .where(eq(users.id, persistedUser.id));
  }

  const finalRows = await db
    .select()
    .from(users)
    .where(inArray(users.username, baselineUsers.map((user) => user.username)));
  return new Map(finalRows.map((user) => [user.username, user]));
}

async function ensureOrganizations() {
  await ensureTenantBootstrap();
  await db.insert(organizations).values(
    demoOrganizations.map((org) => ({
      slug: org.slug,
      name: org.name,
      status: "active",
      plan: org.plan,
      settings: {
        demoSeed: "real-world-demo",
        demoNarrative:
          org.slug === "northstar-consumer-bank-demo"
            ? "Primary end-to-end demo tenant for the Northstar collections hardship assistant."
            : "Supporting portfolio company used in the real-world governance showcase.",
        sourceReferences: Object.values(sourceCatalog).map((source) => source.url),
        auth: {
          mode: "local",
          allowedDomains: org.domains.filter((domain) => domain.isVerified).map((domain) => domain.domain),
          jitProvisioning: false,
          enforceSso: false,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    })),
  ).onConflictDoNothing();

  const orgs = await db.select().from(organizations).where(inArray(organizations.slug, demoOrganizations.map((org) => org.slug)));
  return new Map(orgs.map((org) => [org.slug, org]));
}

async function ensureMembership(userId: string, organizationId: string, role: string, isDefault: boolean) {
  const [existing] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.organizationId, organizationId)))
    .limit(1);

  if (existing) {
    await db
      .update(memberships)
      .set({ role, membershipState: "active", isDefault, provisioningSource: "seed", updatedAt: new Date() })
      .where(eq(memberships.id, existing.id));
    return;
  }

  await db.insert(memberships).values({
    userId,
    organizationId,
    role,
    membershipState: "active",
    isDefault,
    invitedBy: null,
    provisioningSource: "seed",
    onboardingState: {
      currentStep: 4,
      completedSteps: ["inventory", "controls", "identity", "approvals"],
      dismissedAlerts: [],
      snoozedAlerts: {},
      updatedAt: new Date().toISOString(),
    },
  });
}

async function ensurePortfolio(orgMap: Map<string, Organization>, userMap: Map<string, User>) {
  const portfolioSlug = "pilotwave-holdings-demo";
  await db.insert(portfolios).values({
    slug: portfolioSlug,
    name: "PilotWave Holdings Demo Portfolio",
    sponsorName: "PilotWave Holdings",
    investmentThesis: "Acquire regulated and operationally complex businesses, then lift governance maturity with AI systems that survive diligence.",
  }).onConflictDoNothing();

  const [portfolio] = await db.select().from(portfolios).where(eq(portfolios.slug, portfolioSlug)).limit(1);
  if (!portfolio) {
    throw new Error("Failed to create or load demo portfolio");
  }

  for (const org of orgMap.values()) {
    const [existing] = await db
      .select()
      .from(portfolioOrganizations)
      .where(and(eq(portfolioOrganizations.portfolioId, portfolio.id), eq(portfolioOrganizations.organizationId, org.id)))
      .limit(1);

    if (!existing) {
      await db.insert(portfolioOrganizations).values({
        portfolioId: portfolio.id,
        organizationId: org.id,
        operatingStatus: "active",
      });
    }
  }

  const portfolioRoles = [
    { username: "olivia.grant", role: "portfolio_admin" },
    { username: "marcus.reed", role: "portfolio_operator" },
    { username: "clara.wells", role: "portfolio_viewer" },
  ];

  for (const membership of portfolioRoles) {
    const user = userMap.get(membership.username);
    if (!user) continue;

    const [existing] = await db
      .select()
      .from(portfolioMemberships)
      .where(and(eq(portfolioMemberships.portfolioId, portfolio.id), eq(portfolioMemberships.userId, user.id)))
      .limit(1);

    if (existing) {
      await db.update(portfolioMemberships).set({ role: membership.role, updatedAt: new Date() }).where(eq(portfolioMemberships.id, existing.id));
    } else {
      await db.insert(portfolioMemberships).values({
        portfolioId: portfolio.id,
        userId: user.id,
        role: membership.role,
      });
    }
  }

  await telemetryPolicyService.updateForPortfolio(portfolio.id, {
    driftAlertThreshold: 5,
    driftCriticalThreshold: 8,
    biasFlagThreshold: 1,
    safetyFlagThreshold: 1,
    overrideRateWarningThreshold: 35,
    overrideRateCriticalThreshold: 50,
    errorRateWarningThreshold: 5,
    errorRateCriticalThreshold: 8,
    autoEscalateCritical: true,
    notifyOnWarning: true,
  });

  return portfolio;
}

async function ensureOrgAdminData(orgMap: Map<string, Organization>, userMap: Map<string, User>) {
  let primaryOrgTelemetryKey: string | null = null;

  for (const orgSpec of demoOrganizations) {
    const organization = orgMap.get(orgSpec.slug);
    if (!organization) continue;

    for (const domain of orgSpec.domains) {
      const [existingDomain] = await db
        .select()
        .from(organizationDomains)
        .where(and(eq(organizationDomains.organizationId, organization.id), eq(organizationDomains.domain, domain.domain)))
        .limit(1);

      const domainValues = {
        organizationId: organization.id,
        domain: domain.domain,
        isVerified: domain.isVerified,
        isPrimary: domain.isPrimary,
        verificationToken: `demo-${organization.slug}-${domain.domain}`,
        verifiedAt: domain.isVerified ? daysAgo(30) : null,
      };

      if (existingDomain) {
        await db.update(organizationDomains).set(domainValues).where(eq(organizationDomains.id, existingDomain.id));
      } else {
        await db.insert(organizationDomains).values(domainValues);
      }
    }

    const pendingInviteEmail = `review.board@${orgSpec.domains[0]?.domain ?? "example.com"}`;
    const revokedInviteEmail = `external.assessor@${orgSpec.domains[0]?.domain ?? "example.com"}`;
    const invites = [
      {
        email: pendingInviteEmail,
        role: "reviewer",
        status: "pending",
        token: `demo-pending-${organization.slug}`,
        expiresAt: daysFromNow(5),
        resendCount: 1,
      },
      {
        email: revokedInviteEmail,
        role: "auditor",
        status: "revoked",
        token: `demo-revoked-${organization.slug}`,
        expiresAt: daysAgo(2),
        resendCount: 0,
        revokedAt: daysAgo(1),
      },
    ];

    for (const invite of invites) {
      const [existingInvite] = await db
        .select()
        .from(organizationInvites)
        .where(and(eq(organizationInvites.organizationId, organization.id), eq(organizationInvites.email, invite.email)))
        .limit(1);

      const invitedBy = userMap.get("olivia.grant")?.id ?? null;
      const values = {
        organizationId: organization.id,
        email: invite.email,
        role: invite.role,
        status: invite.status,
        token: digestInviteToken(invite.token),
        invitedBy,
        expiresAt: invite.expiresAt,
        acceptedBy: null,
        acceptedAt: null,
        revokedAt: "revokedAt" in invite ? invite.revokedAt ?? null : null,
        resendCount: invite.resendCount,
        updatedAt: new Date(),
      };

      if (existingInvite) {
        await db.update(organizationInvites).set(values).where(eq(organizationInvites.id, existingInvite.id));
      } else {
        await db.insert(organizationInvites).values(values);
      }
    }

    const [existingJira] = await db
      .select()
      .from(jiraIntegrations)
      .where(eq(jiraIntegrations.organizationId, organization.id))
      .limit(1);

    const jiraValues = {
      organizationId: organization.id,
      enabled: orgSpec.jira.enabled,
      baseUrl: orgSpec.jira.baseUrl,
      projectKey: orgSpec.jira.projectKey,
      userEmail: orgSpec.jira.userEmail,
      apiToken: orgSpec.jira.apiToken,
      issueType: orgSpec.jira.issueType,
      labels: orgSpec.jira.labels,
      updatedAt: new Date(),
    };

    if (existingJira) {
      await db.update(jiraIntegrations).set(jiraValues).where(eq(jiraIntegrations.id, existingJira.id));
    } else {
      await db.insert(jiraIntegrations).values(jiraValues);
    }

    await subscriptionService.updateForOrg(organization.id, {
      tier: orgSpec.subscription.tier,
      status: orgSpec.subscription.status,
      billingEmail: orgSpec.subscription.billingEmail,
      seatLimit: orgSpec.subscription.seatLimit,
      currentPeriodStart: daysAgo(25),
      currentPeriodEnd: daysFromNow(5),
      trialEndsAt: orgSpec.subscription.status === "trialing" ? daysFromNow(14) : null,
      renewalAt: daysFromNow(35),
    });
  }

  const primaryOrg = orgMap.get("northstar-consumer-bank-demo");
  const healthOrg = orgMap.get("harborview-diagnostics-demo");
  const utilitiesOrg = orgMap.get("gridreliant-utilities-demo");
  const educationOrg = orgMap.get("summit-education-services-demo");

  if (primaryOrg) {
    const effectivePolicy = await telemetryPolicyService.getEffectiveForOrg(primaryOrg.id);
    if (effectivePolicy.source !== "portfolio") {
      await telemetryPolicyService.resetOrgOverride(primaryOrg.id);
    }
    await telemetryAdapterService.getForOrg(primaryOrg.id);
    await telemetryAdapterService.updateForOrg(primaryOrg.id, {
      enabled: true,
      allowedGateways: ["underwriting-gateway", "customer-support-gateway", "clinical-model-gateway"],
    });
    const rotated = await telemetryAdapterService.rotateKeyForOrg(primaryOrg.id);
    primaryOrgTelemetryKey = rotated.plainTextKey;
    console.log(`[seed:real-world-demo] Telemetry SDK key for ${primaryOrg.slug}: ${rotated.plainTextKey}`);
  }

  if (healthOrg) {
    await telemetryPolicyService.updateForOrg(healthOrg.id, {
      driftAlertThreshold: 4,
      driftCriticalThreshold: 7,
      safetyFlagThreshold: 1,
      overrideRateWarningThreshold: 30,
      overrideRateCriticalThreshold: 45,
      autoEscalateCritical: true,
      notifyOnWarning: true,
    });
  }

  if (utilitiesOrg) {
    await telemetryPolicyService.updateForOrg(utilitiesOrg.id, {
      driftAlertThreshold: 4,
      driftCriticalThreshold: 7,
      safetyFlagThreshold: 1,
      overrideRateWarningThreshold: 30,
      overrideRateCriticalThreshold: 45,
      autoEscalateCritical: true,
      notifyOnWarning: true,
    });
  }

  if (educationOrg) {
    await telemetryPolicyService.updateForOrg(educationOrg.id, {
      biasFlagThreshold: 1,
      overrideRateWarningThreshold: 32,
      overrideRateCriticalThreshold: 45,
      errorRateWarningThreshold: 5,
      errorRateCriticalThreshold: 7,
      autoEscalateCritical: true,
      notifyOnWarning: true,
    });
  }

  return {
    primaryOrgTelemetryKey,
  };
}

async function ensureSystems(orgMap: Map<string, Organization>) {
  const names = systems.map((system) => system.name);
  const orgIds = Array.from(orgMap.values()).map((org) => org.id);
  const existing = orgIds.length > 0
    ? await db.select().from(aiSystems).where(inArray(aiSystems.organizationId, orgIds))
    : [];

  const existingKeys = new Set(existing.map((system) => `${system.organizationId}::${system.name}`));

  const missing = systems
    .map((system) => {
      const org = orgMap.get(system.organizationSlug);
      if (!org) return null;
      const key = `${org.id}::${system.name}`;
      if (existingKeys.has(key)) return null;
      return {
        organizationId: org.id,
        name: system.name,
        description: system.description,
        owner: system.owner,
        department: system.department,
        vendor: system.vendor,
        modelType: system.modelType,
        riskLevel: system.riskLevel,
        status: system.status,
        deploymentContext: system.deploymentContext,
        dataSensitivity: system.dataSensitivity,
        geography: system.geography,
        purpose: system.purpose,
        usersImpacted: system.usersImpacted,
        lastAssessment: daysAgo(system.lastAssessmentDaysAgo),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (missing.length > 0) {
    await db.insert(aiSystems).values(missing);
  }

  const created = orgIds.length > 0
    ? await db.select().from(aiSystems).where(inArray(aiSystems.organizationId, orgIds))
    : [];
  return new Map(created.map((system) => [`${system.organizationId}::${system.name}`, system]));
}

async function ensureSystemControls(systemMap: Map<string, AiSystem>, orgMap: Map<string, Organization>) {
  const allControls = await db.select().from(complianceControls);
  const byFramework = {
    eu_ai_act: allControls.filter((control) => control.framework === "eu_ai_act").slice(0, 3),
    nist_ai_rmf: allControls.filter((control) => control.framework === "nist_ai_rmf").slice(0, 3),
    iso_42001: allControls.filter((control) => control.framework === "iso_42001").slice(0, 3),
  };

  for (const spec of systems) {
    const org = orgMap.get(spec.organizationSlug);
    const system = org ? systemMap.get(`${org.id}::${spec.name}`) : null;
    if (!org || !system) continue;

    const [existing] = await db.select().from(systemControls).where(eq(systemControls.systemId, system.id)).limit(1);
    if (existing) continue;

    const rows = [
      ...byFramework.eu_ai_act,
      ...byFramework.nist_ai_rmf,
      ...byFramework.iso_42001,
    ].map((control, index) => ({
      organizationId: org.id,
      systemId: system.id,
      controlId: control.id,
      status: ["verified", "implemented", "in_progress", "not_started"][index % 4],
      evidence: index < 2 ? `${control.controlName} evidence linked to ${system.name}` : null,
      notes: `Real-world demo control mapping for ${system.name}`,
      assignee: spec.owner,
      dueDate: daysFromNow(14 + index * 3),
      completedAt: index < 2 ? daysAgo(10 - index) : null,
    }));

    await db.insert(systemControls).values(rows);
  }
}

async function ensureWorkflows(systemMap: Map<string, AiSystem>, orgMap: Map<string, Organization>) {
  const orgIds = Array.from(orgMap.values()).map((org) => org.id);
  const existing = orgIds.length > 0
    ? await db.select().from(approvalWorkflows).where(inArray(approvalWorkflows.organizationId, orgIds))
    : [];
  const existingKeys = new Set(existing.map((workflow) => `${workflow.organizationId}::${workflow.title}`));

  const missing = workflows
    .map((workflow) => {
      const org = orgMap.get(workflow.organizationSlug);
      const system = org ? systemMap.get(`${org.id}::${workflow.systemName}`) : null;
      if (!org || !system) return null;
      const key = `${org.id}::${workflow.title}`;
      if (existingKeys.has(key)) return null;
      return {
        organizationId: org.id,
        systemId: system.id,
        title: workflow.title,
        description: workflow.description,
        status: workflow.status,
        requestedBy: workflow.requestedBy,
        reviewer: workflow.reviewer,
        priority: workflow.priority,
        estimatedFinancialImpact: workflow.estimatedFinancialImpact,
        usesPii: workflow.usesPii,
        customerFacing: workflow.customerFacing,
        reversible: workflow.reversible,
        strategicImpact: workflow.strategicImpact,
        safetyCritical: workflow.safetyCritical,
        decisionTier: workflow.decisionTier,
        committeeType: workflow.committeeType,
        blockedReason: workflow.blockedReason ?? null,
        requiredApprovers: workflow.requiredApprovers,
        decision: workflow.decision ?? null,
        decisionNotes: workflow.decisionNotes ?? null,
        jiraSyncStatus: "not_configured",
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));

  if (missing.length > 0) {
    await db.insert(approvalWorkflows).values(missing);
  }

  const refreshed = orgIds.length > 0
    ? await db.select().from(approvalWorkflows).where(inArray(approvalWorkflows.organizationId, orgIds))
    : [];
  return new Map(refreshed.map((workflow) => [`${workflow.organizationId}::${workflow.title}`, workflow]));
}

async function ensureRiskAssessments(systemMap: Map<string, AiSystem>, orgMap: Map<string, Organization>) {
  const controls = await db.select().from(complianceControls);
  const suggested = controls.slice(0, 6).map((control) => control.controlId);

  for (const spec of systems) {
    const org = orgMap.get(spec.organizationSlug);
    const system = org ? systemMap.get(`${org.id}::${spec.name}`) : null;
    if (!org || !system) continue;

    const [existing] = await db.select().from(riskAssessments).where(eq(riskAssessments.systemId, system.id)).limit(1);
    if (existing) continue;

    await db.insert(riskAssessments).values({
      organizationId: org.id,
      systemId: system.id,
      systemName: system.name,
      answers: {
        sourceReference: sourceCatalog.euAiAct.url,
        dataSensitivity: spec.dataSensitivity,
        geography: spec.geography,
        usersImpacted: spec.usersImpacted,
        customerFacing: spec.riskLevel !== "minimal",
      },
      riskOutcome: spec.riskLevel,
      riskScore: spec.riskLevel === "high" ? 91 : spec.riskLevel === "limited" ? 57 : 19,
      riskExplanation: spec.description,
      suggestedControls: suggested,
      completedBy: spec.owner,
    });
  }
}

async function ensureEvidence(systemMap: Map<string, AiSystem>, orgMap: Map<string, Organization>) {
  for (const file of evidence) {
    const org = orgMap.get(file.organizationSlug);
    const system = org ? systemMap.get(`${org.id}::${file.systemName}`) : null;
    if (!org || !system) continue;

    const [existing] = await db
      .select()
      .from(evidenceFiles)
      .where(and(eq(evidenceFiles.systemId, system.id), eq(evidenceFiles.fileName, file.fileName)))
      .limit(1);

    if (existing) continue;

    await db.insert(evidenceFiles).values({
      organizationId: org.id,
      systemId: system.id,
      controlId: null,
      workflowId: null,
      fileName: file.fileName,
      fileSize: file.fileSize,
      mimeType: file.mimeType,
      filePath: file.filePath,
      uploadedBy: file.uploadedBy,
    });
  }
}

async function ensureDecisionTraces(workflowMap: Map<string, ApprovalWorkflow>, systemMap: Map<string, AiSystem>, orgMap: Map<string, Organization>) {
  const orgIds = Array.from(orgMap.values()).map((org) => org.id);
  const existing = orgIds.length > 0
    ? await db.select().from(decisionAudits).where(inArray(decisionAudits.organizationId, orgIds))
    : [];
  const existingKeys = new Map(existing.map((trace) => [`${trace.organizationId}::${trace.title}`, trace]));

  for (const trace of decisionTraces) {
    const org = orgMap.get(trace.organizationSlug);
    const system = org ? systemMap.get(`${org.id}::${trace.systemName}`) : null;
    const workflow = org ? workflowMap.get(`${org.id}::${trace.workflowTitle}`) : null;
    if (!org || !system || !workflow) continue;

    const key = `${org.id}::${trace.title}`;
    let created = existingKeys.get(key);
    if (!created) {
      created = await decisionAuditService.createForOrg(org.id, {
        systemId: system.id,
        workflowId: workflow.id,
        title: trace.title,
        businessObjective: trace.businessObjective,
        decisionContext: trace.decisionContext,
        modelName: trace.modelName,
        modelVersion: trace.modelVersion,
        promptText: trace.promptText,
        inputSources: trace.inputSources,
        inputSnapshot: trace.inputSnapshot,
        decisionConstraints: trace.decisionConstraints,
        aiOutput: trace.aiOutput,
        humanOutput: trace.humanOutput,
        overrideRationale: trace.overrideRationale,
        confidenceScore: trace.confidenceScore,
        uncertaintyScore: trace.uncertaintyScore,
        explainabilityFactors: trace.explainabilityFactors,
        documentationStatus: "sealed",
        retentionUntil: daysFromNow(365 * 7),
        outcome30d: trace.outcome30d,
        outcome60d: trace.outcome60d,
        outcome90d: trace.outcome90d,
        outcomeSummary: trace.outcomeSummary,
        createdBy: trace.createdBy,
        reviewedBy: trace.reviewedBy,
      });
      existingKeys.set(key, created);
    }

    const [existingSource] = await db.select().from(decisionAuditSources).where(eq(decisionAuditSources.decisionAuditId, created.id)).limit(1);
    if (!existingSource) {
      await db.insert(decisionAuditSources).values(
        trace.sources.map((source) => ({
          decisionAuditId: created!.id,
          sourceType: source.sourceType,
          sourceName: source.sourceName,
          sourceVersion: source.sourceVersion ?? null,
          qualityFlags: source.qualityFlags ?? [],
          metadata: source.metadata ?? {},
        })),
      );
    }
  }

  return new Map(Array.from(existingKeys.values()).map((trace) => [`${trace.organizationId}::${trace.title}`, trace]));
}

async function ensureManualIncidents(orgMap: Map<string, Organization>, systemMap: Map<string, AiSystem>, workflowMap: Map<string, ApprovalWorkflow>, traceMap: Map<string, typeof decisionAudits.$inferSelect>) {
  const orgIds = Array.from(orgMap.values()).map((org) => org.id);
  const existing = orgIds.length > 0
    ? await db.select().from(aiIncidents).where(inArray(aiIncidents.organizationId, orgIds))
    : [];
  const existingKeys = new Map(existing.map((incident) => [`${incident.organizationId}::${incident.title}`, incident]));

  for (const incident of manualIncidents) {
    const org = orgMap.get(incident.organizationSlug);
    const system = org ? systemMap.get(`${org.id}::${incident.systemName}`) : null;
    const workflow = org && incident.workflowTitle ? workflowMap.get(`${org.id}::${incident.workflowTitle}`) : null;
    const trace = org && incident.linkedDecisionTitle ? traceMap.get(`${org.id}::${incident.linkedDecisionTitle}`) : null;
    if (!org || !system) continue;

    const key = `${org.id}::${incident.title}`;
    let created = existingKeys.get(key);
    if (!created) {
      created = await incidentService.createForOrg(org.id, {
        systemId: system.id,
        workflowId: workflow?.id ?? null,
        title: incident.title,
        category: incident.category,
        severity: incident.severity,
        status: "open",
        description: incident.description,
        playbook: {},
        rootCause: incident.rootCause,
        postIncidentReview: incident.review,
        affectedDecisionTraceIds: trace ? [trace.id] : [],
        regulatoryNotifications: incident.regulatoryNotifications,
        owner: incident.owner,
        escalatedTo: incident.escalatedTo,
        detectedAt: daysAgo(incident.detectedDaysAgo),
        dueAt: null,
        containedAt: null,
        resolvedAt: null,
        postmortemCompletedAt: null,
      });
      existingKeys.set(key, created);
    }

    if (incident.status !== "open") {
      await incidentService.updateForOrg(org.id, created.id, {
        rootCause: incident.rootCause,
        postIncidentReview: incident.review,
        affectedDecisionTraceIds: trace ? [trace.id] : [],
        regulatoryNotifications: incident.regulatoryNotifications,
        status: incident.status,
      });
    }
  }
}

async function ensureTelemetry(orgMap: Map<string, Organization>, systemMap: Map<string, AiSystem>) {
  const orgIds = Array.from(orgMap.values()).map((org) => org.id);
  const existing = orgIds.length > 0
    ? await db.select().from(notifications).where(inArray(notifications.organizationId, orgIds))
    : [];
  const notificationCountBefore = existing.length;

  const existingTelemetry = orgIds.length > 0
    ? await db.select().from(aiTelemetryEvents).where(inArray(aiTelemetryEvents.organizationId, orgIds))
    : [];
  const existingSummaries = new Set(existingTelemetry.map((event) => `${event.organizationId}::${event.summary}`));

  for (const event of telemetryEvents) {
    const org = orgMap.get(event.organizationSlug);
    const system = org ? systemMap.get(`${org.id}::${event.systemName}`) : null;
    if (!org || !system) continue;
    const key = `${org.id}::${event.summary}`;
    if (existingSummaries.has(key)) continue;

    await telemetryService.createForOrg(org.id, {
      systemId: system.id,
      modelName: event.modelName,
      provider: event.provider,
      gateway: event.gateway,
      eventType: event.eventType,
      severity: event.severity,
      driftScore: event.driftScore ?? null,
      biasFlags: event.biasFlags ?? [],
      summary: event.summary,
      metadata: event.metadata ?? {},
      detectedAt: new Date(),
      resolvedAt: null,
    });
  }

  const notificationsAfter = orgIds.length > 0
    ? await db.select().from(notifications).where(inArray(notifications.organizationId, orgIds))
    : [];
  console.log(`[seed:real-world-demo] Telemetry notifications added: ${notificationsAfter.length - notificationCountBefore}`);
}

async function ensureNotifications(orgMap: Map<string, Organization>, userMap: Map<string, User>, workflowMap: Map<string, ApprovalWorkflow>) {
  const notificationSpecs = [
    {
      organizationSlug: "northstar-consumer-bank-demo",
      username: "olivia.grant",
      title: "Tier 3 workflow awaiting executive review",
      message: "Credit Eligibility Decision Engine rollout is blocked pending Governance Committee + CEO approval.",
      type: "approval_assigned",
      entityType: "workflow",
      entityTitle: "Expand credit eligibility model to new adverse-action policy set",
    },
    {
      organizationSlug: "harborview-diagnostics-demo",
      username: "irene.cho",
      title: "Clinical drift threshold breached",
      message: "Mammography Triage Model crossed the drift alert threshold for dense-tissue cases.",
      type: "high_risk_created",
      entityType: "telemetry_event",
      entityTitle: null,
    },
    {
      organizationSlug: "meridian-talent-systems-demo",
      username: "noah.bennett",
      title: "Bias review reopened for screening pilot",
      message: "Candidate Screening Ranker requires reviewer follow-up after override-rate and cohort-gap findings.",
      type: "workflow_status_changed",
      entityType: "incident",
      entityTitle: null,
    },
    {
      organizationSlug: "gridreliant-utilities-demo",
      username: "irene.cho",
      title: "Critical infrastructure drift incident opened",
      message: "Vegetation Outage Risk Forecaster breached the critical drift threshold for constrained environmental zones.",
      type: "high_risk_created",
      entityType: "incident",
      entityTitle: null,
    },
    {
      organizationSlug: "silverline-insurance-operations-demo",
      username: "olivia.grant",
      title: "Claims triage workflow escalated",
      message: "Catastrophe Claims Severity Triage is awaiting Governance Committee and CEO approval before rollout.",
      type: "approval_assigned",
      entityType: "workflow",
      entityTitle: "Approve catastrophe claims triage rollout for storm season",
    },
    {
      organizationSlug: "summit-education-services-demo",
      username: "sophia.malik",
      title: "Scholarship pilot fairness review required",
      message: "Scholarship Eligibility Support Model triggered a bias review for first-generation applicant prioritization.",
      type: "workflow_status_changed",
      entityType: "incident",
      entityTitle: null,
    },
  ];

  const orgIds = Array.from(orgMap.values()).map((org) => org.id);
  const existing = orgIds.length > 0 ? await db.select().from(notifications).where(inArray(notifications.organizationId, orgIds)) : [];
  const existingKeys = new Set(existing.map((notification) => `${notification.organizationId}::${notification.userId}::${notification.title}`));

  for (const spec of notificationSpecs) {
    const org = orgMap.get(spec.organizationSlug);
    const user = userMap.get(spec.username);
    if (!org || !user) continue;
    const key = `${org.id}::${user.id}::${spec.title}`;
    if (existingKeys.has(key)) continue;

    const entityId = spec.entityTitle ? workflowMap.get(`${org.id}::${spec.entityTitle}`)?.id ?? randomUUID() : randomUUID();
    await db.insert(notifications).values({
      organizationId: org.id,
      userId: user.id,
      title: spec.title,
      message: spec.message,
      type: spec.type,
      entityType: spec.entityType,
      entityId,
      read: false,
    });
  }
}

async function ensureBackgroundJobs(orgMap: Map<string, Organization>, userMap: Map<string, User>) {
  const adminUserId = userMap.get("olivia.grant")?.id ?? null;
  const primaryOrgId = orgMap.get("northstar-consumer-bank-demo")?.id;
  if (!primaryOrgId || !adminUserId) return;

  const existing = await db.select().from(backgroundJobs).where(eq(backgroundJobs.organizationId, primaryOrgId));
  const existingTypes = new Set(existing.map((job) => `${job.type}::${job.status}`));

  const jobs = [
    {
      type: "invite_delivery",
      status: "failed",
      payload: { recipient: "review.board@northstarbank.example", channel: "smtp", seed: "real-world-demo" },
      result: {},
      attempts: 3,
      maxAttempts: 3,
      lastError: "SMTP sandbox quota exceeded for demo invite delivery.",
    },
    {
      type: "monitoring_webhook",
      status: "succeeded",
      payload: { destination: "ops-monitoring-demo", seed: "real-world-demo" },
      result: { delivered: true },
      attempts: 1,
      maxAttempts: 3,
      lastError: null,
    },
    {
      type: "monitoring_webhook",
      status: "pending",
      payload: { destination: "client-demo-threshold-alerts", seed: "real-world-demo" },
      result: {},
      attempts: 0,
      maxAttempts: 3,
      lastError: null,
    },
  ];

  for (const job of jobs) {
    const key = `${job.type}::${job.status}`;
    if (existingTypes.has(key)) continue;

    await db.insert(backgroundJobs).values({
      type: job.type,
      status: job.status,
      organizationId: primaryOrgId,
      createdBy: adminUserId,
      payload: job.payload,
      result: job.result,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAt: daysAgo(1),
      lockedAt: null,
      lockedBy: null,
      lastError: job.lastError,
      updatedAt: new Date(),
    });
  }
}

async function ensureAuditLogs(orgMap: Map<string, Organization>, workflowMap: Map<string, ApprovalWorkflow>, traceMap: Map<string, typeof decisionAudits.$inferSelect>, userMap: Map<string, User>) {
  const admin = userMap.get("olivia.grant");
  if (!admin) {
    throw new Error("olivia.grant not found");
  }

  const actor = {
    id: admin.id,
    username: admin.username,
    fullName: admin.fullName,
    email: admin.email,
    role: admin.role,
  };

  const logSpecs = [
    {
      organizationSlug: "northstar-consumer-bank-demo",
      entityType: "workflow",
      entityTitle: "Expand credit eligibility model to new adverse-action policy set",
      action: "workflow.seeded",
      details: "Real-world demo workflow seeded from EU AI Act essential private services scenario.",
    },
    {
      organizationSlug: "harborview-diagnostics-demo",
      entityType: "decision_audit",
      entityTitle: "Clinical triage recommendation with radiologist override",
      action: "decision_audit.seeded",
      details: "Real-world demo decision trace seeded for safety-critical clinical pilot testing.",
    },
    {
      organizationSlug: "meridian-talent-systems-demo",
      entityType: "seed_batch",
      entityTitle: "real-world-demo-v1",
      action: "real_world_demo.seeded",
      details: "Real-world portfolio, system, workflow, incident, telemetry, and retention test dataset loaded.",
    },
  ];

  for (const spec of logSpecs) {
    const org = orgMap.get(spec.organizationSlug);
    if (!org) continue;

    let entityId = spec.entityTitle;
    if (spec.entityType === "workflow") {
      entityId = workflowMap.get(`${org.id}::${spec.entityTitle}`)?.id ?? spec.entityTitle;
    }
    if (spec.entityType === "decision_audit") {
      entityId = traceMap.get(`${org.id}::${spec.entityTitle}`)?.id ?? spec.entityTitle;
    }

    const [existing] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, org.id), eq(auditLogs.action, spec.action), eq(auditLogs.entityId, entityId)))
      .limit(1);

    if (existing) continue;

    await auditService.createLog({
      organizationId: org.id,
      actor,
      input: {
        entityType: spec.entityType,
        entityId,
        action: spec.action,
        performedBy: actor.fullName,
        details: spec.details,
      },
    });
  }
}

export async function seedRealWorldDemo(): Promise<DemoSeedSummary> {
  console.log("[seed:real-world-demo] Starting real-world demo seed");
  const userMap = await ensureBaselineUsers();
  const orgMap = await ensureOrganizations();

  const primaryOrg = orgMap.get("northstar-consumer-bank-demo");
  if (!primaryOrg) {
    throw new Error("Primary demo organization missing");
  }

  for (const user of baselineUsers) {
    const row = userMap.get(user.username);
    if (!row) continue;

    await db.update(memberships).set({ isDefault: false, updatedAt: new Date() }).where(eq(memberships.userId, row.id));
    for (const org of orgMap.values()) {
      await ensureMembership(row.id, org.id, user.membershipRole, org.id === primaryOrg.id);
    }
  }

  const portfolio = await ensurePortfolio(orgMap, userMap);
  const adminData = await ensureOrgAdminData(orgMap, userMap);

  const systemMap = await ensureSystems(orgMap);
  await ensureSystemControls(systemMap, orgMap);
  const workflowMap = await ensureWorkflows(systemMap, orgMap);
  await ensureRiskAssessments(systemMap, orgMap);
  await ensureEvidence(systemMap, orgMap);
  const traceMap = await ensureDecisionTraces(workflowMap, systemMap, orgMap);
  await ensureManualIncidents(orgMap, systemMap, workflowMap, traceMap);
  await ensureTelemetry(orgMap, systemMap);
  await ensureNotifications(orgMap, userMap, workflowMap);
  await ensureBackgroundJobs(orgMap, userMap);
  await ensureAuditLogs(orgMap, workflowMap, traceMap, userMap);

  for (const org of orgMap.values()) {
    await subscriptionService.getForOrg(org.id);
  }

  console.log(`[seed:real-world-demo] Portfolio ready: ${portfolio.name}`);
  console.log(`[seed:real-world-demo] Organizations: ${Array.from(orgMap.values()).map((org) => org.name).join(", ")}`);
  console.log(`[seed:real-world-demo] Systems seeded: ${systems.length}`);
  console.log(`[seed:real-world-demo] Workflows seeded: ${workflows.length}`);
  console.log(`[seed:real-world-demo] Decision traces seeded: ${decisionTraces.length}`);
  console.log(`[seed:real-world-demo] Manual incidents seeded: ${manualIncidents.length}`);
  console.log(`[seed:real-world-demo] Telemetry events seeded: ${telemetryEvents.length}`);
  console.log(`[seed:real-world-demo] Control Grid login: ${baselineUsers[0].email} / ${demoUserPassword}`);
  console.log(`[seed:real-world-demo] Linked runtime system: ${primaryOrg.name} / Collections Hardship Assistant`);
  console.log(`[seed:real-world-demo] Complete`);

  const linkedRuntimeSystemName = "Collections Hardship Assistant";
  const linkedRuntimeGateway = "customer-support-gateway";
  const linkedRuntimeSystem = systemMap.get(`${primaryOrg.id}::${linkedRuntimeSystemName}`);
  if (!linkedRuntimeSystem) {
    throw new Error(`Linked runtime demo system missing: ${linkedRuntimeSystemName}`);
  }
  if (!adminData.primaryOrgTelemetryKey) {
    throw new Error("Linked runtime telemetry key missing after demo seed");
  }

  return {
    portfolioSlug: "pilotwave-holdings-demo",
    portfolioName: portfolio.name,
    controlTowerLogins: baselineUsers.map((user) => ({
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      password: demoUserPassword,
      defaultOrganizationSlug: primaryOrg.slug,
    })),
    linkedRuntime: {
      organizationSlug: primaryOrg.slug,
      organizationName: primaryOrg.name,
      systemName: linkedRuntimeSystemName,
      systemId: linkedRuntimeSystem.id,
      gateway: linkedRuntimeGateway,
      telemetryKey: adminData.primaryOrgTelemetryKey,
    },
  };
}

async function main() {
  await seedRealWorldDemo();
}

const isDirectRun = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isDirectRun) {
  main().catch((error) => {
    console.error("[seed:real-world-demo] Failed:", error);
    process.exit(1);
  });
}
