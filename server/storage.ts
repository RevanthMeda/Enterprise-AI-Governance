import {
  type User, type InsertUser,
  type AiSystem, type InsertAiSystem,
  type ComplianceControl, type InsertComplianceControl,
  type SystemControl, type InsertSystemControl,
  type ApprovalWorkflow, type InsertApprovalWorkflow,
  type AuditLog, type InsertAuditLog,
  type Notification, type InsertNotification,
  type EvidenceFile, type InsertEvidenceFile,
  type RiskAssessment, type InsertRiskAssessment,
  users, aiSystems, complianceControls, systemControls, approvalWorkflows, auditLogs,
  notifications, evidenceFiles, riskAssessments,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, gte, lte, SQL } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  getAiSystems(filters?: AiSystemFilters): Promise<AiSystem[]>;
  getAiSystem(id: string): Promise<AiSystem | undefined>;
  createAiSystem(system: InsertAiSystem): Promise<AiSystem>;
  updateAiSystem(id: string, data: Partial<InsertAiSystem>): Promise<AiSystem | undefined>;
  deleteAiSystem(id: string): Promise<void>;

  getComplianceControls(): Promise<ComplianceControl[]>;
  getComplianceControl(id: string): Promise<ComplianceControl | undefined>;
  createComplianceControl(control: InsertComplianceControl): Promise<ComplianceControl>;

  getSystemControls(): Promise<SystemControl[]>;
  getSystemControlsBySystem(systemId: string): Promise<SystemControl[]>;
  createSystemControl(sc: InsertSystemControl): Promise<SystemControl>;
  updateSystemControl(id: string, data: Partial<InsertSystemControl>): Promise<SystemControl | undefined>;

  getApprovalWorkflows(filters?: ApprovalWorkflowFilters): Promise<ApprovalWorkflow[]>;
  getApprovalWorkflow(id: string): Promise<ApprovalWorkflow | undefined>;
  getApprovalWorkflowsBySystem(systemId: string): Promise<ApprovalWorkflow[]>;
  createApprovalWorkflow(wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow>;
  updateApprovalWorkflow(id: string, data: Partial<InsertApprovalWorkflow>): Promise<ApprovalWorkflow | undefined>;

  getAuditLogs(filters?: AuditLogFilters): Promise<AuditLog[]>;
  getAuditLogsByEntity(entityId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  getNotificationsByUser(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  getEvidenceFiles(filters?: EvidenceFileFilters): Promise<EvidenceFile[]>;
  getEvidenceFile(id: string): Promise<EvidenceFile | undefined>;
  createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile>;
  deleteEvidenceFile(id: string): Promise<void>;

  getRiskAssessments(): Promise<RiskAssessment[]>;
  getRiskAssessmentsBySystem(systemId: string): Promise<RiskAssessment[]>;
  createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment>;

  bulkCreateSystemControls(items: { systemId: string; controlId: string }[]): Promise<SystemControl[]>;
}

export interface AiSystemFilters {
  search?: string;
  riskLevel?: string;
  status?: string;
  dataSensitivity?: string;
  geography?: string;
  department?: string;
}

export interface AuditLogFilters {
  action?: string;
  entityType?: string;
  performedBy?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ApprovalWorkflowFilters {
  status?: string;
  priority?: string;
  systemId?: string;
}

export interface EvidenceFileFilters {
  systemId?: string;
  controlId?: string;
  workflowId?: string;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getAiSystems(filters?: AiSystemFilters): Promise<AiSystem[]> {
    const conditions: SQL[] = [];
    if (filters?.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        ilike(aiSystems.name, term),
        ilike(aiSystems.owner, term),
        ilike(aiSystems.department, term),
        ilike(aiSystems.vendor, term),
      )!);
    }
    if (filters?.riskLevel && filters.riskLevel !== "all") {
      conditions.push(eq(aiSystems.riskLevel, filters.riskLevel));
    }
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(aiSystems.status, filters.status));
    }
    if (filters?.dataSensitivity && filters.dataSensitivity !== "all") {
      conditions.push(eq(aiSystems.dataSensitivity, filters.dataSensitivity));
    }
    if (filters?.geography && filters.geography !== "all") {
      conditions.push(ilike(aiSystems.geography, `%${filters.geography}%`));
    }
    if (filters?.department && filters.department !== "all") {
      conditions.push(ilike(aiSystems.department, `%${filters.department}%`));
    }
    const query = db.select().from(aiSystems);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(aiSystems.createdAt));
    }
    return query.orderBy(desc(aiSystems.createdAt));
  }

  async getAiSystem(id: string): Promise<AiSystem | undefined> {
    const [system] = await db.select().from(aiSystems).where(eq(aiSystems.id, id));
    return system;
  }

  async createAiSystem(system: InsertAiSystem): Promise<AiSystem> {
    const [created] = await db.insert(aiSystems).values(system).returning();
    return created;
  }

  async updateAiSystem(id: string, data: Partial<InsertAiSystem>): Promise<AiSystem | undefined> {
    const [updated] = await db.update(aiSystems).set({ ...data, updatedAt: new Date() }).where(eq(aiSystems.id, id)).returning();
    return updated;
  }

  async deleteAiSystem(id: string): Promise<void> {
    await db.delete(aiSystems).where(eq(aiSystems.id, id));
  }

  async getComplianceControls(): Promise<ComplianceControl[]> {
    return db.select().from(complianceControls);
  }

  async getComplianceControl(id: string): Promise<ComplianceControl | undefined> {
    const [control] = await db.select().from(complianceControls).where(eq(complianceControls.id, id));
    return control;
  }

  async createComplianceControl(control: InsertComplianceControl): Promise<ComplianceControl> {
    const [created] = await db.insert(complianceControls).values(control).returning();
    return created;
  }

  async getSystemControls(): Promise<SystemControl[]> {
    return db.select().from(systemControls);
  }

  async getSystemControlsBySystem(systemId: string): Promise<SystemControl[]> {
    return db.select().from(systemControls).where(eq(systemControls.systemId, systemId));
  }

  async createSystemControl(sc: InsertSystemControl): Promise<SystemControl> {
    const [created] = await db.insert(systemControls).values(sc).returning();
    return created;
  }

  async updateSystemControl(id: string, data: Partial<InsertSystemControl>): Promise<SystemControl | undefined> {
    const [updated] = await db.update(systemControls).set(data).where(eq(systemControls.id, id)).returning();
    return updated;
  }

  async getApprovalWorkflows(filters?: ApprovalWorkflowFilters): Promise<ApprovalWorkflow[]> {
    const conditions: SQL[] = [];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(approvalWorkflows.status, filters.status));
    }
    if (filters?.priority && filters.priority !== "all") {
      conditions.push(eq(approvalWorkflows.priority, filters.priority));
    }
    if (filters?.systemId && filters.systemId !== "all") {
      conditions.push(eq(approvalWorkflows.systemId, filters.systemId));
    }
    const query = db.select().from(approvalWorkflows);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(approvalWorkflows.createdAt));
    }
    return query.orderBy(desc(approvalWorkflows.createdAt));
  }

  async getApprovalWorkflow(id: string): Promise<ApprovalWorkflow | undefined> {
    const [wf] = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, id));
    return wf;
  }

  async getApprovalWorkflowsBySystem(systemId: string): Promise<ApprovalWorkflow[]> {
    return db.select().from(approvalWorkflows).where(eq(approvalWorkflows.systemId, systemId)).orderBy(desc(approvalWorkflows.createdAt));
  }

  async createApprovalWorkflow(wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow> {
    const [created] = await db.insert(approvalWorkflows).values(wf).returning();
    return created;
  }

  async updateApprovalWorkflow(id: string, data: Partial<InsertApprovalWorkflow>): Promise<ApprovalWorkflow | undefined> {
    const [updated] = await db.update(approvalWorkflows).set({ ...data, updatedAt: new Date() }).where(eq(approvalWorkflows.id, id)).returning();
    return updated;
  }

  async getAuditLogs(filters?: AuditLogFilters): Promise<AuditLog[]> {
    const conditions: SQL[] = [];
    if (filters?.action && filters.action !== "all") {
      conditions.push(eq(auditLogs.action, filters.action));
    }
    if (filters?.entityType && filters.entityType !== "all") {
      conditions.push(eq(auditLogs.entityType, filters.entityType));
    }
    if (filters?.performedBy) {
      conditions.push(ilike(auditLogs.performedBy, `%${filters.performedBy}%`));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(auditLogs.createdAt, new Date(filters.dateFrom)));
    }
    if (filters?.dateTo) {
      conditions.push(lte(auditLogs.createdAt, new Date(filters.dateTo)));
    }
    const query = db.select().from(auditLogs);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(auditLogs.createdAt));
    }
    return query.orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsByEntity(entityId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId)).orderBy(desc(auditLogs.createdAt));
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt));
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async markNotificationRead(id: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications).set({ read: true }).where(eq(notifications.id, id)).returning();
    return updated;
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(notifications).set({ read: true }).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select().from(notifications).where(and(eq(notifications.userId, userId), eq(notifications.read, false)));
    return result.length;
  }

  async getEvidenceFiles(filters?: EvidenceFileFilters): Promise<EvidenceFile[]> {
    const conditions: SQL[] = [];
    if (filters?.systemId) {
      conditions.push(eq(evidenceFiles.systemId, filters.systemId));
    }
    if (filters?.controlId) {
      conditions.push(eq(evidenceFiles.controlId, filters.controlId));
    }
    if (filters?.workflowId) {
      conditions.push(eq(evidenceFiles.workflowId, filters.workflowId));
    }
    const query = db.select().from(evidenceFiles);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(evidenceFiles.createdAt));
    }
    return query.orderBy(desc(evidenceFiles.createdAt));
  }

  async getEvidenceFile(id: string): Promise<EvidenceFile | undefined> {
    const [file] = await db.select().from(evidenceFiles).where(eq(evidenceFiles.id, id));
    return file;
  }

  async createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile> {
    const [created] = await db.insert(evidenceFiles).values(file).returning();
    return created;
  }

  async deleteEvidenceFile(id: string): Promise<void> {
    await db.delete(evidenceFiles).where(eq(evidenceFiles.id, id));
  }

  async getRiskAssessments(): Promise<RiskAssessment[]> {
    return db.select().from(riskAssessments).orderBy(desc(riskAssessments.createdAt));
  }

  async getRiskAssessmentsBySystem(systemId: string): Promise<RiskAssessment[]> {
    return db.select().from(riskAssessments).where(eq(riskAssessments.systemId, systemId)).orderBy(desc(riskAssessments.createdAt));
  }

  async createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment> {
    const [created] = await db.insert(riskAssessments).values(assessment).returning();
    return created;
  }

  async getSystemControlsByAssignee(assignee: string): Promise<SystemControl[]> {
    return db.select().from(systemControls).where(
      or(ilike(systemControls.assignee, assignee))!
    );
  }

  async getApprovalWorkflowsByReviewer(reviewer: string): Promise<ApprovalWorkflow[]> {
    return db.select().from(approvalWorkflows).where(
      and(
        or(eq(approvalWorkflows.reviewer, reviewer))!,
        or(eq(approvalWorkflows.status, "pending"), eq(approvalWorkflows.status, "in_review"))!
      )
    ).orderBy(desc(approvalWorkflows.createdAt));
  }

  async getAiSystemsByOwner(owner: string): Promise<AiSystem[]> {
    return db.select().from(aiSystems).where(
      or(ilike(aiSystems.owner, owner))!
    ).orderBy(desc(aiSystems.createdAt));
  }

  async bulkCreateSystemControls(items: { systemId: string; controlId: string }[]): Promise<SystemControl[]> {
    if (items.length === 0) return [];
    const values = items.map((item) => ({
      systemId: item.systemId,
      controlId: item.controlId,
      status: "not_started" as const,
    }));
    return db.insert(systemControls).values(values).returning();
  }
}

export const storage = new DatabaseStorage();
