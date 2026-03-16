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

export const portfolioRoles = ["portfolio_admin", "portfolio_operator", "portfolio_viewer"] as const;

export const portfolios = pgTable("portfolios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sponsorName: text("sponsor_name"),
  investmentThesis: text("investment_thesis"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPortfolioSchema = createInsertSchema(portfolios).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPortfolio = z.infer<typeof insertPortfolioSchema>;
export type Portfolio = typeof portfolios.$inferSelect;

export const portfolioOrganizations = pgTable("portfolio_organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  operatingStatus: text("operating_status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  portfolioIdx: index("portfolio_organizations_portfolio_idx").on(table.portfolioId),
  organizationIdx: index("portfolio_organizations_organization_idx").on(table.organizationId),
  uniquePortfolioOrg: uniqueIndex("portfolio_organizations_unique").on(table.portfolioId, table.organizationId),
}));

export const insertPortfolioOrganizationSchema = createInsertSchema(portfolioOrganizations).omit({
  id: true,
  createdAt: true,
});

export type InsertPortfolioOrganization = z.infer<typeof insertPortfolioOrganizationSchema>;
export type PortfolioOrganization = typeof portfolioOrganizations.$inferSelect;

export const portfolioMemberships = pgTable("portfolio_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("portfolio_viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  portfolioIdx: index("portfolio_memberships_portfolio_idx").on(table.portfolioId),
  userIdx: index("portfolio_memberships_user_idx").on(table.userId),
  uniquePortfolioUser: uniqueIndex("portfolio_memberships_unique").on(table.portfolioId, table.userId),
}));

export const insertPortfolioMembershipSchema = createInsertSchema(portfolioMemberships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPortfolioMembership = z.infer<typeof insertPortfolioMembershipSchema>;
export type PortfolioMembership = typeof portfolioMemberships.$inferSelect;

export const portfolioTelemetryPolicies = pgTable("portfolio_telemetry_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: varchar("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
  driftAlertThreshold: integer("drift_alert_threshold").notNull().default(5),
  driftCriticalThreshold: integer("drift_critical_threshold").notNull().default(10),
  biasFlagThreshold: integer("bias_flag_threshold").notNull().default(1),
  safetyFlagThreshold: integer("safety_flag_threshold").notNull().default(1),
  toxicityWarningThreshold: integer("toxicity_warning_threshold").notNull().default(60),
  toxicityCriticalThreshold: integer("toxicity_critical_threshold").notNull().default(80),
  piiFlagThreshold: integer("pii_flag_threshold").notNull().default(1),
  overrideRateWarningThreshold: integer("override_rate_warning_threshold").notNull().default(40),
  overrideRateCriticalThreshold: integer("override_rate_critical_threshold").notNull().default(60),
  errorRateWarningThreshold: integer("error_rate_warning_threshold").notNull().default(5),
  errorRateCriticalThreshold: integer("error_rate_critical_threshold").notNull().default(10),
  autoEscalateCritical: boolean("auto_escalate_critical").notNull().default(true),
  notifyOnWarning: boolean("notify_on_warning").notNull().default(true),
  enforceBlocking: boolean("enforce_blocking").notNull().default(false),
  blockOnPii: boolean("block_on_pii").notNull().default(true),
  blockOnSafetyCritical: boolean("block_on_safety_critical").notNull().default(true),
  blockOnRestrictedPrompt: boolean("block_on_restricted_prompt").notNull().default(true),
  restrictedPromptPatterns: jsonb("restricted_prompt_patterns").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  portfolioUnique: uniqueIndex("portfolio_telemetry_policies_portfolio_unique").on(table.portfolioId),
}));

export const insertPortfolioTelemetryPolicySchema = createInsertSchema(portfolioTelemetryPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPortfolioTelemetryPolicy = z.infer<typeof insertPortfolioTelemetryPolicySchema>;
export type PortfolioTelemetryPolicy = typeof portfolioTelemetryPolicies.$inferSelect;

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

export const subscriptionTiers = ["pilot", "growth", "enterprise"] as const;
export const subscriptionStatuses = ["trialing", "active", "past_due", "canceled"] as const;

export const organizationSubscriptions = pgTable("organization_subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("pilot"),
  status: text("status").notNull().default("trialing"),
  billingEmail: text("billing_email"),
  seatLimit: integer("seat_limit").notNull().default(25),
  currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  renewalAt: timestamp("renewal_at", { withTimezone: true }),
  usageSummary: jsonb("usage_summary").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgUnique: uniqueIndex("organization_subscriptions_org_unique").on(table.organizationId),
  tierIdx: index("organization_subscriptions_tier_idx").on(table.tier),
}));

export const insertOrganizationSubscriptionSchema = createInsertSchema(organizationSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationSubscription = z.infer<typeof insertOrganizationSubscriptionSchema>;
export type OrganizationSubscription = typeof organizationSubscriptions.$inferSelect;

export const organizationTelemetryPolicies = pgTable("organization_telemetry_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  driftAlertThreshold: integer("drift_alert_threshold").notNull().default(5),
  driftCriticalThreshold: integer("drift_critical_threshold").notNull().default(10),
  biasFlagThreshold: integer("bias_flag_threshold").notNull().default(1),
  safetyFlagThreshold: integer("safety_flag_threshold").notNull().default(1),
  toxicityWarningThreshold: integer("toxicity_warning_threshold").notNull().default(60),
  toxicityCriticalThreshold: integer("toxicity_critical_threshold").notNull().default(80),
  piiFlagThreshold: integer("pii_flag_threshold").notNull().default(1),
  overrideRateWarningThreshold: integer("override_rate_warning_threshold").notNull().default(40),
  overrideRateCriticalThreshold: integer("override_rate_critical_threshold").notNull().default(60),
  errorRateWarningThreshold: integer("error_rate_warning_threshold").notNull().default(5),
  errorRateCriticalThreshold: integer("error_rate_critical_threshold").notNull().default(10),
  autoEscalateCritical: boolean("auto_escalate_critical").notNull().default(true),
  notifyOnWarning: boolean("notify_on_warning").notNull().default(true),
  enforceBlocking: boolean("enforce_blocking").notNull().default(false),
  blockOnPii: boolean("block_on_pii").notNull().default(true),
  blockOnSafetyCritical: boolean("block_on_safety_critical").notNull().default(true),
  blockOnRestrictedPrompt: boolean("block_on_restricted_prompt").notNull().default(true),
  restrictedPromptPatterns: jsonb("restricted_prompt_patterns").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgUnique: uniqueIndex("organization_telemetry_policies_org_unique").on(table.organizationId),
}));

export const insertOrganizationTelemetryPolicySchema = createInsertSchema(organizationTelemetryPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationTelemetryPolicy = z.infer<typeof insertOrganizationTelemetryPolicySchema>;
export type OrganizationTelemetryPolicy = typeof organizationTelemetryPolicies.$inferSelect;

export const systemTelemetryPolicies = pgTable("system_telemetry_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id").notNull(),
  driftAlertThreshold: integer("drift_alert_threshold").notNull().default(5),
  driftCriticalThreshold: integer("drift_critical_threshold").notNull().default(10),
  biasFlagThreshold: integer("bias_flag_threshold").notNull().default(1),
  safetyFlagThreshold: integer("safety_flag_threshold").notNull().default(1),
  toxicityWarningThreshold: integer("toxicity_warning_threshold").notNull().default(60),
  toxicityCriticalThreshold: integer("toxicity_critical_threshold").notNull().default(80),
  piiFlagThreshold: integer("pii_flag_threshold").notNull().default(1),
  overrideRateWarningThreshold: integer("override_rate_warning_threshold").notNull().default(40),
  overrideRateCriticalThreshold: integer("override_rate_critical_threshold").notNull().default(60),
  errorRateWarningThreshold: integer("error_rate_warning_threshold").notNull().default(5),
  errorRateCriticalThreshold: integer("error_rate_critical_threshold").notNull().default(10),
  autoEscalateCritical: boolean("auto_escalate_critical").notNull().default(true),
  notifyOnWarning: boolean("notify_on_warning").notNull().default(true),
  enforceBlocking: boolean("enforce_blocking").notNull().default(false),
  blockOnPii: boolean("block_on_pii").notNull().default(true),
  blockOnSafetyCritical: boolean("block_on_safety_critical").notNull().default(true),
  blockOnRestrictedPrompt: boolean("block_on_restricted_prompt").notNull().default(true),
  restrictedPromptPatterns: jsonb("restricted_prompt_patterns").notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  systemUnique: uniqueIndex("system_telemetry_policies_system_unique").on(table.organizationId, table.systemId),
  orgSystemIdx: index("system_telemetry_policies_org_system_idx").on(table.organizationId, table.systemId),
}));

export const insertSystemTelemetryPolicySchema = createInsertSchema(systemTelemetryPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSystemTelemetryPolicy = z.infer<typeof insertSystemTelemetryPolicySchema>;
export type SystemTelemetryPolicy = typeof systemTelemetryPolicies.$inferSelect;

export const organizationTelemetryAdapters = pgTable("organization_telemetry_adapters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  ingestKeyHash: text("ingest_key_hash"),
  keyPrefix: text("key_prefix"),
  allowedGateways: jsonb("allowed_gateways").notNull().default(sql`'[]'::jsonb`),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgUnique: uniqueIndex("organization_telemetry_adapters_org_unique").on(table.organizationId),
  keyHashIdx: index("organization_telemetry_adapters_key_hash_idx").on(table.ingestKeyHash),
}));

export const insertOrganizationTelemetryAdapterSchema = createInsertSchema(organizationTelemetryAdapters).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertOrganizationTelemetryAdapter = z.infer<typeof insertOrganizationTelemetryAdapterSchema>;
export type OrganizationTelemetryAdapter = typeof organizationTelemetryAdapters.$inferSelect;

export const jiraSyncStatuses = ["not_configured", "pending", "linked", "error"] as const;
export const decisionTiers = ["tier_1", "tier_2", "tier_3"] as const;
export const committeeTypes = ["technical_team", "operations_committee", "governance_committee_ceo"] as const;

export const jiraIntegrations = pgTable("jira_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  baseUrl: text("base_url"),
  projectKey: text("project_key"),
  userEmail: text("user_email"),
  apiToken: text("api_token"),
  issueType: text("issue_type").notNull().default("Task"),
  labels: jsonb("labels").notNull().default(sql`'[]'::jsonb`),
  lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgUnique: uniqueIndex("jira_integrations_org_unique").on(table.organizationId),
}));

export const insertJiraIntegrationSchema = createInsertSchema(jiraIntegrations).omit({
  id: true,
  lastTestedAt: true,
  lastSyncAt: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertJiraIntegration = z.infer<typeof insertJiraIntegrationSchema>;
export type JiraIntegration = typeof jiraIntegrations.$inferSelect;

export const incidentCategories = ["bias", "security", "privacy", "reliability", "compliance", "safety"] as const;
export const incidentSeverities = ["critical", "high", "medium", "low"] as const;
export const incidentStatuses = ["open", "contained", "resolved", "postmortem"] as const;

export const aiIncidents = pgTable("ai_incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id"),
  workflowId: varchar("workflow_id"),
  title: text("title").notNull(),
  category: text("category").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  description: text("description").notNull(),
  playbook: jsonb("playbook").notNull().default(sql`'{}'::jsonb`),
  rootCause: text("root_cause"),
  postIncidentReview: jsonb("post_incident_review").notNull().default(sql`'{}'::jsonb`),
  affectedDecisionTraceIds: jsonb("affected_decision_trace_ids").notNull().default(sql`'[]'::jsonb`),
  regulatoryNotifications: jsonb("regulatory_notifications").notNull().default(sql`'[]'::jsonb`),
  owner: text("owner"),
  escalatedTo: text("escalated_to"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }),
  containedAt: timestamp("contained_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  postmortemCompletedAt: timestamp("postmortem_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgSeverityIdx: index("ai_incidents_org_severity_idx").on(table.organizationId, table.severity),
  orgStatusIdx: index("ai_incidents_org_status_idx").on(table.organizationId, table.status),
}));

export const insertAiIncidentSchema = createInsertSchema(aiIncidents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiIncident = z.infer<typeof insertAiIncidentSchema>;
export type AiIncident = typeof aiIncidents.$inferSelect;

export const decisionAudits = pgTable("decision_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id").notNull(),
  workflowId: varchar("workflow_id"),
  title: text("title").notNull(),
  businessObjective: text("business_objective"),
  decisionContext: text("decision_context").notNull(),
  modelName: text("model_name"),
  modelVersion: text("model_version"),
  promptText: text("prompt_text"),
  inputSources: jsonb("input_sources").notNull().default(sql`'[]'::jsonb`),
  inputSnapshot: jsonb("input_snapshot").notNull().default(sql`'{}'::jsonb`),
  decisionConstraints: jsonb("decision_constraints").notNull().default(sql`'[]'::jsonb`),
  aiOutput: text("ai_output").notNull(),
  humanOutput: text("human_output"),
  overrideDiff: text("override_diff"),
  overrideRationale: text("override_rationale"),
  confidenceScore: integer("confidence_score"),
  uncertaintyScore: integer("uncertainty_score"),
  explainabilityFactors: jsonb("explainability_factors").notNull().default(sql`'[]'::jsonb`),
  documentationStatus: text("documentation_status").notNull().default("sealed"),
  retentionUntil: timestamp("retention_until", { withTimezone: true }).notNull().default(sql`now() + interval '7 years'`),
  legalHold: boolean("legal_hold").notNull().default(false),
  legalHoldReason: text("legal_hold_reason"),
  legalHoldAppliedAt: timestamp("legal_hold_applied_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  lastRetentionCheckAt: timestamp("last_retention_check_at", { withTimezone: true }),
  currentVersionNumber: integer("current_version_number").notNull().default(1),
  lastVersionedAt: timestamp("last_versioned_at", { withTimezone: true }),
  sealedRecordHash: text("sealed_record_hash"),
  outcome30d: jsonb("outcome_30d").notNull().default(sql`'{}'::jsonb`),
  outcome60d: jsonb("outcome_60d").notNull().default(sql`'{}'::jsonb`),
  outcome90d: jsonb("outcome_90d").notNull().default(sql`'{}'::jsonb`),
  outcomeSummary: text("outcome_summary"),
  createdBy: text("created_by").notNull(),
  reviewedBy: text("reviewed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgCreatedIdx: index("decision_audits_org_created_idx").on(table.organizationId, table.createdAt),
  orgSystemIdx: index("decision_audits_org_system_idx").on(table.organizationId, table.systemId),
  orgWorkflowIdx: index("decision_audits_org_workflow_idx").on(table.organizationId, table.workflowId),
  orgRetentionIdx: index("decision_audits_org_retention_idx").on(table.organizationId, table.retentionUntil),
}));

export const insertDecisionAuditSchema = createInsertSchema(decisionAudits).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDecisionAudit = z.infer<typeof insertDecisionAuditSchema>;
export type DecisionAudit = typeof decisionAudits.$inferSelect;

export const decisionAuditVersions = pgTable("decision_audit_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  decisionAuditId: varchar("decision_audit_id").notNull().references(() => decisionAudits.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  snapshot: jsonb("snapshot").notNull().default(sql`'{}'::jsonb`),
  sealedRecordHash: text("sealed_record_hash"),
  reason: text("reason"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  decisionVersionIdx: index("decision_audit_versions_decision_version_idx").on(table.decisionAuditId, table.versionNumber),
  orgCreatedIdx: index("decision_audit_versions_org_created_idx").on(table.organizationId, table.createdAt),
}));

export const insertDecisionAuditVersionSchema = createInsertSchema(decisionAuditVersions).omit({
  id: true,
  createdAt: true,
});

export type InsertDecisionAuditVersion = z.infer<typeof insertDecisionAuditVersionSchema>;
export type DecisionAuditVersion = typeof decisionAuditVersions.$inferSelect;

export const decisionAuditSources = pgTable("decision_audit_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  decisionAuditId: varchar("decision_audit_id").notNull().references(() => decisionAudits.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceName: text("source_name").notNull(),
  sourceVersion: text("source_version"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  qualityFlags: jsonb("quality_flags").notNull().default(sql`'[]'::jsonb`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
}, (table) => ({
  decisionIdx: index("decision_audit_sources_decision_idx").on(table.decisionAuditId),
}));

export const insertDecisionAuditSourceSchema = createInsertSchema(decisionAuditSources).omit({
  id: true,
  capturedAt: true,
});

export type InsertDecisionAuditSource = z.infer<typeof insertDecisionAuditSourceSchema>;
export type DecisionAuditSource = typeof decisionAuditSources.$inferSelect;

export const telemetrySeverities = ["info", "warning", "critical"] as const;

export const aiTelemetryEvents = pgTable("ai_telemetry_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  organizationId: varchar("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  systemId: varchar("system_id"),
  modelName: text("model_name"),
  provider: text("provider"),
  gateway: text("gateway"),
  eventType: text("event_type").notNull(),
  severity: text("severity").notNull().default("info"),
  driftScore: integer("drift_score"),
  biasFlags: jsonb("bias_flags").notNull().default(sql`'[]'::jsonb`),
  safetySignals: jsonb("safety_signals").notNull().default(sql`'[]'::jsonb`),
  toxicityScore: integer("toxicity_score"),
  piiFlags: jsonb("pii_flags").notNull().default(sql`'[]'::jsonb`),
  promptText: text("prompt_text"),
  modelOutput: text("model_output"),
  runtimeContext: jsonb("runtime_context").notNull().default(sql`'{}'::jsonb`),
  correlationId: text("correlation_id"),
  summary: text("summary").notNull(),
  actionTaken: text("action_taken").notNull().default("allow"),
  blocked: boolean("blocked").notNull().default(false),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgDetectedIdx: index("ai_telemetry_events_org_detected_idx").on(table.organizationId, table.detectedAt),
  orgSeverityIdx: index("ai_telemetry_events_org_severity_idx").on(table.organizationId, table.severity),
}));

export const insertAiTelemetryEventSchema = createInsertSchema(aiTelemetryEvents).omit({
  id: true,
  createdAt: true,
});

export type InsertAiTelemetryEvent = z.infer<typeof insertAiTelemetryEventSchema>;
export type AiTelemetryEvent = typeof aiTelemetryEvents.$inferSelect;

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
  estimatedFinancialImpact: integer("estimated_financial_impact").notNull().default(0),
  usesPii: boolean("uses_pii").notNull().default(false),
  customerFacing: boolean("customer_facing").notNull().default(false),
  reversible: boolean("reversible").notNull().default(true),
  strategicImpact: boolean("strategic_impact").notNull().default(false),
  safetyCritical: boolean("safety_critical").notNull().default(false),
  decisionTier: text("decision_tier").notNull().default("tier_1"),
  committeeType: text("committee_type").notNull().default("technical_team"),
  blockedReason: text("blocked_reason"),
  requiredApprovers: jsonb("required_approvers").notNull().default(sql`'[]'::jsonb`),
  decision: text("decision"),
  decisionNotes: text("decision_notes"),
  jiraIssueKey: text("jira_issue_key"),
  jiraIssueUrl: text("jira_issue_url"),
  jiraSyncStatus: text("jira_sync_status").notNull().default("not_configured"),
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
  previousHash: text("previous_hash"),
  recordHash: text("record_hash").notNull().default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
  previousHash: true,
  recordHash: true,
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
