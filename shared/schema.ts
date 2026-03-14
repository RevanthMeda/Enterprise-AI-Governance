import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as const;
export const authProviders = ["local", "saml", "oidc"] as const;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  passwordHistory: jsonb("password_history").notNull().default(sql`'[]'::jsonb`),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  passwordExpiresAt: timestamp("password_expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '90 days'`),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaRecoveryCodes: jsonb("mfa_recovery_codes").notNull().default(sql`'[]'::jsonb`),
  fullName: text("full_name").notNull().default(""),
  email: text("email"),
  authProvider: text("auth_provider").default("local"),
  authProviderSubject: text("auth_provider_subject"),
  emailVerified: boolean("email_verified").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  role: text("role").notNull().default("reviewer"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  email: true,
  authProvider: true,
  authProviderSubject: true,
  emailVerified: true,
  lastLoginAt: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("active"),
  plan: text("plan").notNull().default("starter"),
  settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizations.$inferSelect;

export const membershipProvisioningSources = ["manual", "invite", "jit", "seed"] as const;

export const memberships = pgTable("memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  membershipState: text("membership_state").notNull().default("active"),
  isDefault: boolean("is_default").notNull().default(false),
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: "set null" }),
  provisioningSource: text("provisioning_source").notNull().default("manual"),
  externalGroup: text("external_group"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  onboardingState: jsonb("onboarding_state").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userOrgUnique: uniqueIndex("memberships_user_org_unique").on(table.userId, table.organizationId),
  userIdIdx: index("memberships_user_id_idx").on(table.userId),
  orgIdIdx: index("memberships_org_id_idx").on(table.organizationId),
  userDefaultIdx: index("memberships_user_default_idx").on(table.userId, table.isDefault),
}));

export const insertMembershipSchema = createInsertSchema(memberships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMembership = z.infer<typeof insertMembershipSchema>;
export type Membership = typeof memberships.$inferSelect;

export const organizationDomains = pgTable("organization_domains", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  domain: text("domain").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
  verificationToken: text("verification_token").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("organization_domains_org_id_idx").on(table.organizationId),
  domainIdx: index("organization_domains_domain_idx").on(table.domain),
  orgDomainUnique: uniqueIndex("organization_domains_org_domain_unique").on(table.organizationId, table.domain),
}));

export const insertOrganizationDomainSchema = createInsertSchema(organizationDomains).omit({
  id: true,
  createdAt: true,
});

export type InsertOrganizationDomain = z.infer<typeof insertOrganizationDomainSchema>;
export type OrganizationDomain = typeof organizationDomains.$inferSelect;

export const organizationInviteStatuses = ["pending", "accepted", "revoked", "expired"] as const;
export const membershipRoles = ["owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as const;

export const organizationInvites = pgTable("organization_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").notNull().default("reviewer"),
  status: text("status").notNull().default("pending"),
  token: text("token").notNull().unique(),
  invitedBy: varchar("invited_by").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedBy: varchar("accepted_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  resendCount: integer("resend_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgIdIdx: index("organization_invites_org_id_idx").on(table.organizationId),
  orgStatusIdx: index("organization_invites_org_status_idx").on(table.organizationId, table.status),
  emailIdx: index("organization_invites_email_idx").on(table.email),
}));

export const insertOrganizationInviteSchema = createInsertSchema(organizationInvites).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationInvite = z.infer<typeof insertOrganizationInviteSchema>;
export type OrganizationInvite = typeof organizationInvites.$inferSelect;

export const backgroundJobTypes = ["invite_delivery", "monitoring_webhook"] as const;
export const backgroundJobStatuses = ["pending", "processing", "succeeded", "failed"] as const;

export const backgroundJobs = pgTable("background_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  result: jsonb("result").notNull().default(sql`'{}'::jsonb`),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  statusRunAtIdx: index("background_jobs_status_run_at_idx").on(table.status, table.runAt),
  orgCreatedIdx: index("background_jobs_org_created_idx").on(table.organizationId, table.createdAt),
  typeStatusIdx: index("background_jobs_type_status_idx").on(table.type, table.status),
}));

export const insertBackgroundJobSchema = createInsertSchema(backgroundJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBackgroundJob = z.infer<typeof insertBackgroundJobSchema>;
export type BackgroundJob = typeof backgroundJobs.$inferSelect;

export const adminAuditEvents = pgTable("admin_audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  actorUserId: varchar("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: varchar("target_id"),
  targetUserId: varchar("target_user_id").references(() => users.id, { onDelete: "set null" }),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgCreatedIdx: index("admin_audit_events_org_created_idx").on(table.organizationId, table.createdAt),
  actionIdx: index("admin_audit_events_action_idx").on(table.action),
}));

export const insertAdminAuditEventSchema = createInsertSchema(adminAuditEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAdminAuditEvent = z.infer<typeof insertAdminAuditEventSchema>;
export type AdminAuditEvent = typeof adminAuditEvents.$inferSelect;

export const riskLevels = ["unacceptable", "high", "limited", "minimal"] as const;
export const systemStatuses = ["active", "under_review", "approved", "deprecated", "draft"] as const;
export const dataSensitivities = ["public", "internal", "confidential", "restricted"] as const;
export const frameworks = ["eu_ai_act", "nist_ai_rmf", "iso_42001"] as const;
export const controlStatuses = ["not_started", "in_progress", "implemented", "verified"] as const;
export const workflowStatuses = ["pending", "in_review", "approved", "rejected", "escalated"] as const;

export const aiSystems = pgTable("ai_systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  owner: text("owner").notNull(),
  department: text("department"),
  vendor: text("vendor"),
  modelType: text("model_type"),
  riskLevel: text("risk_level").notNull().default("minimal"),
  status: text("status").notNull().default("draft"),
  deploymentContext: text("deployment_context"),
  dataSensitivity: text("data_sensitivity").default("internal"),
  geography: text("geography"),
  purpose: text("purpose"),
  usersImpacted: integer("users_impacted").default(0),
  lastAssessment: timestamp("last_assessment"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAiSystemSchema = createInsertSchema(aiSystems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiSystem = z.infer<typeof insertAiSystemSchema>;
export type AiSystem = typeof aiSystems.$inferSelect;

export const complianceControls = pgTable("compliance_controls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  framework: text("framework").notNull(),
  controlId: text("control_id").notNull(),
  controlName: text("control_name").notNull(),
  description: text("description"),
  category: text("category"),
  riskLevelApplicable: text("risk_level_applicable"),
});

export const insertComplianceControlSchema = createInsertSchema(complianceControls).omit({
  id: true,
});

export type InsertComplianceControl = z.infer<typeof insertComplianceControlSchema>;
export type ComplianceControl = typeof complianceControls.$inferSelect;

export const systemControls = pgTable("system_controls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id").notNull(),
  controlId: varchar("control_id").notNull(),
  status: text("status").notNull().default("not_started"),
  evidence: text("evidence"),
  notes: text("notes"),
  assignee: text("assignee"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
});

export const insertSystemControlSchema = createInsertSchema(systemControls).omit({
  id: true,
});

export type InsertSystemControl = z.infer<typeof insertSystemControlSchema>;
export type SystemControl = typeof systemControls.$inferSelect;

export const approvalWorkflows = pgTable("approval_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  requestedBy: text("requested_by").notNull(),
  reviewer: text("reviewer"),
  priority: text("priority").default("medium"),
  decision: text("decision"),
  decisionNotes: text("decision_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertApprovalWorkflowSchema = createInsertSchema(approvalWorkflows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertApprovalWorkflow = z.infer<typeof insertApprovalWorkflowSchema>;
export type ApprovalWorkflow = typeof approvalWorkflows.$inferSelect;

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(),
  performedBy: text("performed_by").notNull(),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const notificationTypes = [
  "approval_assigned",
  "control_overdue",
  "workflow_status_changed",
  "evidence_requested",
  "high_risk_created",
  "system_modified",
] as const;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(),
  entityType: text("entity_type"),
  entityId: varchar("entity_id"),
  read: boolean("read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

export const evidenceFiles = pgTable("evidence_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id").notNull(),
  controlId: varchar("control_id"),
  workflowId: varchar("workflow_id"),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  filePath: text("file_path").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEvidenceFileSchema = createInsertSchema(evidenceFiles).omit({
  id: true,
  createdAt: true,
});

export type InsertEvidenceFile = z.infer<typeof insertEvidenceFileSchema>;
export type EvidenceFile = typeof evidenceFiles.$inferSelect;

export const riskAssessments = pgTable("risk_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id"),
  systemName: text("system_name").notNull(),
  answers: jsonb("answers").notNull(),
  riskOutcome: text("risk_outcome").notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  riskExplanation: text("risk_explanation").notNull(),
  suggestedControls: jsonb("suggested_controls"),
  completedBy: text("completed_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRiskAssessmentSchema = createInsertSchema(riskAssessments).omit({
  id: true,
  createdAt: true,
});

export type InsertRiskAssessment = z.infer<typeof insertRiskAssessmentSchema>;
export type RiskAssessment = typeof riskAssessments.$inferSelect;

export const leads = pgTable("leads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  workEmail: text("work_email").notNull(),
  company: text("company").notNull(),
  role: text("role").notNull(),
  teamSize: text("team_size").notNull(),
  primaryChallenge: text("primary_challenge").notNull(),
  formType: text("form_type").notNull(),
  source: text("source"),
  ctaSource: text("cta_source"),
  campaign: text("campaign"),
  lifecycleStage: text("lifecycle_stage").notNull().default("new"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  createdAtIdx: index("leads_created_at_idx").on(table.createdAt),
  workEmailIdx: index("leads_work_email_idx").on(table.workEmail),
  lifecycleStageIdx: index("leads_lifecycle_stage_idx").on(table.lifecycleStage),
}));

export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertLead = z.infer<typeof insertLeadSchema>;
export type Lead = typeof leads.$inferSelect;

export const marketingEvents = pgTable("marketing_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  eventName: text("event_name").notNull(),
  pagePath: text("page_path"),
  section: text("section"),
  cta: text("cta"),
  source: text("source"),
  campaign: text("campaign"),
  referrer: text("referrer"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  eventNameIdx: index("marketing_events_event_name_idx").on(table.eventName),
  createdAtIdx: index("marketing_events_created_at_idx").on(table.createdAt),
}));

export const insertMarketingEventSchema = createInsertSchema(marketingEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertMarketingEvent = z.infer<typeof insertMarketingEventSchema>;
export type MarketingEvent = typeof marketingEvents.$inferSelect;
