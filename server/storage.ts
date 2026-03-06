import {
  type User, type InsertUser,
  type AiSystem, type InsertAiSystem,
  type ComplianceControl, type InsertComplianceControl,
  type SystemControl, type InsertSystemControl,
  type ApprovalWorkflow, type InsertApprovalWorkflow,
  type AuditLog, type InsertAuditLog,
  users, aiSystems, complianceControls, systemControls, approvalWorkflows, auditLogs,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  getAiSystems(): Promise<AiSystem[]>;
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

  getApprovalWorkflows(): Promise<ApprovalWorkflow[]>;
  getApprovalWorkflow(id: string): Promise<ApprovalWorkflow | undefined>;
  getApprovalWorkflowsBySystem(systemId: string): Promise<ApprovalWorkflow[]>;
  createApprovalWorkflow(wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow>;
  updateApprovalWorkflow(id: string, data: Partial<InsertApprovalWorkflow>): Promise<ApprovalWorkflow | undefined>;

  getAuditLogs(): Promise<AuditLog[]>;
  getAuditLogsByEntity(entityId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
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

  async getAiSystems(): Promise<AiSystem[]> {
    return db.select().from(aiSystems).orderBy(desc(aiSystems.createdAt));
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

  async getApprovalWorkflows(): Promise<ApprovalWorkflow[]> {
    return db.select().from(approvalWorkflows).orderBy(desc(approvalWorkflows.createdAt));
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

  async getAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsByEntity(entityId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.entityId, entityId)).orderBy(desc(auditLogs.createdAt));
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values(log).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
