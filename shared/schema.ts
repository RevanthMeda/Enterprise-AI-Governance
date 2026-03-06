import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoles = ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as const;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull().default(""),
  email: text("email"),
  role: text("role").notNull().default("reviewer"),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
  fullName: true,
  email: true,
  role: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const riskLevels = ["unacceptable", "high", "limited", "minimal"] as const;
export const systemStatuses = ["active", "under_review", "approved", "deprecated", "draft"] as const;
export const dataSensitivities = ["public", "internal", "confidential", "restricted"] as const;
export const frameworks = ["eu_ai_act", "nist_ai_rmf", "iso_42001"] as const;
export const controlStatuses = ["not_started", "in_progress", "implemented", "verified"] as const;
export const workflowStatuses = ["pending", "in_review", "approved", "rejected", "escalated"] as const;

export const aiSystems = pgTable("ai_systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
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
