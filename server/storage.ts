import {
  type User, type InsertUser,
  type Organization, type InsertOrganization,
  type Membership, type InsertMembership,
  type OrganizationDomain, type InsertOrganizationDomain,
  type AiSystem, type InsertAiSystem,
  type ComplianceControl, type InsertComplianceControl,
  type SystemControl, type InsertSystemControl,
  type ApprovalWorkflow, type InsertApprovalWorkflow,
  type AuditLog, type InsertAuditLog,
  type Notification, type InsertNotification,
  type EvidenceFile, type InsertEvidenceFile,
  type RiskAssessment, type InsertRiskAssessment,
  organizations, memberships, organizationDomains,
  users, aiSystems, complianceControls, systemControls, approvalWorkflows, auditLogs,
  notifications, evidenceFiles, riskAssessments,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, or, ilike, gte, lte, inArray, SQL } from "drizzle-orm";

function throwUnscopedTenantMethod(method: string, scopedAlternative: string): never {
  throw new Error(
    `[TENANT_GUARD] Unscoped storage method "${method}" is disabled. Use "${scopedAlternative}" with organizationId.`,
  );
}

export interface UserMembershipContext {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
  membershipState: string;
  isDefault: boolean;
  invitedBy: string | null;
  onboardingState: unknown;
  organizationName: string;
  organizationSlug: string;
  organizationStatus: string;
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  findUserByProviderSubject(
    authProvider: NonNullable<User["authProvider"]>,
    authProviderSubject: string,
  ): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserAuthIdentity(
    userId: string,
    data: {
      authProvider?: User["authProvider"];
      authProviderSubject?: string | null;
      emailVerified?: boolean;
      lastLoginAt?: Date | null;
    },
  ): Promise<User | undefined>;
  updateUserLastLogin(userId: string, at?: Date): Promise<User | undefined>;
  updateUserPassword(
    userId: string,
    data: {
      password: string;
      passwordChangedAt: Date;
      passwordExpiresAt: Date;
      passwordHistory: string[];
    },
  ): Promise<User | undefined>;
  updateUserMfa(
    userId: string,
    data: {
      mfaEnabled: boolean;
      mfaSecret: string | null;
      mfaRecoveryCodes: string[];
    },
  ): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getOrganizationById(id: string): Promise<Organization | undefined>;
  getOrganizationBySlug(slug: string): Promise<Organization | undefined>;
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganizationDomainsByOrg(organizationId: string): Promise<OrganizationDomain[]>;
  replaceOrganizationDomainsForOrg(
    organizationId: string,
    domains: Array<{
      id?: string;
      domain: string;
      isVerified?: boolean;
      isPrimary?: boolean;
      verificationToken?: string;
      verifiedAt?: Date | null;
      createdAt?: Date;
    }>,
  ): Promise<OrganizationDomain[]>;
  createOrganizationDomain(domain: InsertOrganizationDomain): Promise<OrganizationDomain>;
  deleteOrganizationDomainByIdForOrg(organizationId: string, domainId: string): Promise<void>;
  findOrganizationByEmailDomain(domain: string): Promise<Organization | undefined>;
  getMembershipsByUserId(userId: string): Promise<UserMembershipContext[]>;
  createMembership(membership: InsertMembership): Promise<Membership>;
  updateMembershipProvisioningMetadata(
    membershipId: string,
    data: {
      provisioningSource?: Membership["provisioningSource"];
      externalGroup?: string | null;
      lastSyncedAt?: Date | null;
    },
  ): Promise<Membership | undefined>;
  updateMembershipOnboardingState(
    membershipId: string,
    onboardingState: Record<string, unknown>,
  ): Promise<Membership | undefined>;
  getUsersByOrganization(organizationId: string): Promise<User[]>;
  getUsersByOrganizationRoles(organizationId: string, roles: string[]): Promise<User[]>;

  getAiSystemsByOrg(organizationId: string, filters?: AiSystemFilters): Promise<AiSystem[]>;
  getAiSystemById(organizationId: string, id: string): Promise<AiSystem | undefined>;
  createAiSystemForOrg(organizationId: string, system: InsertAiSystem): Promise<AiSystem>;
  updateAiSystemByOrg(organizationId: string, id: string, data: Partial<InsertAiSystem>): Promise<AiSystem | undefined>;
  deleteAiSystemByOrg(organizationId: string, id: string): Promise<void>;

  getAiSystems(filters?: AiSystemFilters): Promise<AiSystem[]>;
  getAiSystem(id: string): Promise<AiSystem | undefined>;
  createAiSystem(system: InsertAiSystem): Promise<AiSystem>;
  updateAiSystem(id: string, data: Partial<InsertAiSystem>): Promise<AiSystem | undefined>;
  deleteAiSystem(id: string): Promise<void>;

  getComplianceControls(): Promise<ComplianceControl[]>;
  getComplianceControl(id: string): Promise<ComplianceControl | undefined>;
  createComplianceControl(control: InsertComplianceControl): Promise<ComplianceControl>;

  getSystemControls(): Promise<SystemControl[]>;
  getSystemControlsByOrg(organizationId: string, filters?: SystemControlFilters): Promise<SystemControl[]>;
  getSystemControlsBySystem(systemId: string): Promise<SystemControl[]>;
  getSystemControlsBySystemForOrg(organizationId: string, systemId: string): Promise<SystemControl[]>;
  getSystemControlsByAssigneeForOrg(organizationId: string, assignee: string): Promise<SystemControl[]>;
  getSystemControlByIdForOrg(organizationId: string, id: string): Promise<SystemControl | undefined>;
  getSystemControlBySystemAndControlForOrg(
    organizationId: string,
    systemId: string,
    controlId: string,
  ): Promise<SystemControl | undefined>;
  createSystemControlForOrg(organizationId: string, sc: InsertSystemControl): Promise<SystemControl>;
  updateSystemControlForOrg(
    organizationId: string,
    id: string,
    data: Partial<InsertSystemControl>,
  ): Promise<SystemControl | undefined>;
  deleteSystemControlForOrg(organizationId: string, id: string): Promise<void>;
  createSystemControl(sc: InsertSystemControl): Promise<SystemControl>;
  updateSystemControl(id: string, data: Partial<InsertSystemControl>): Promise<SystemControl | undefined>;

  getApprovalWorkflows(filters?: ApprovalWorkflowFilters): Promise<ApprovalWorkflow[]>;
  getApprovalWorkflow(id: string): Promise<ApprovalWorkflow | undefined>;
  getApprovalWorkflowsByOrg(organizationId: string, filters?: ApprovalWorkflowFilters): Promise<ApprovalWorkflow[]>;
  getApprovalWorkflowById(organizationId: string, id: string): Promise<ApprovalWorkflow | undefined>;
  getApprovalWorkflowsByReviewerForOrg(organizationId: string, reviewer: string): Promise<ApprovalWorkflow[]>;
  getApprovalWorkflowsBySystemForOrg(organizationId: string, systemId: string): Promise<ApprovalWorkflow[]>;
  createApprovalWorkflowForOrg(organizationId: string, wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow>;
  updateApprovalWorkflowByOrg(organizationId: string, id: string, data: Partial<InsertApprovalWorkflow>): Promise<ApprovalWorkflow | undefined>;
  deleteApprovalWorkflowByOrg(organizationId: string, id: string): Promise<void>;
  getApprovalWorkflowsBySystem(systemId: string): Promise<ApprovalWorkflow[]>;
  createApprovalWorkflow(wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow>;
  updateApprovalWorkflow(id: string, data: Partial<InsertApprovalWorkflow>): Promise<ApprovalWorkflow | undefined>;

  getAuditLogs(filters?: AuditLogFilters): Promise<AuditLog[]>;
  getAuditLogsByOrg(organizationId: string, filters?: AuditLogFilters): Promise<AuditLog[]>;
  getAuditLogsByEntityForOrg(organizationId: string, entityId: string): Promise<AuditLog[]>;
  createAuditLogForOrg(organizationId: string, log: Omit<InsertAuditLog, "organizationId">): Promise<AuditLog>;
  getAuditLogsByEntity(entityId: string): Promise<AuditLog[]>;
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;

  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getNotificationsByOrgUser(organizationId: string, userId: string): Promise<Notification[]>;
  getNotificationByIdForOrgUser(organizationId: string, userId: string, id: string): Promise<Notification | undefined>;
  createNotificationForOrg(organizationId: string, notification: Omit<InsertNotification, "organizationId">): Promise<Notification>;
  markNotificationReadByOrgUser(organizationId: string, userId: string, id: string): Promise<Notification | undefined>;
  markAllNotificationsReadByOrgUser(organizationId: string, userId: string): Promise<void>;
  getUnreadNotificationCountByOrgUser(organizationId: string, userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<void>;
  getUnreadNotificationCount(userId: string): Promise<number>;

  getEvidenceFiles(filters?: EvidenceFileFilters): Promise<EvidenceFile[]>;
  getEvidenceFilesByOrg(organizationId: string, filters?: EvidenceFileFilters): Promise<EvidenceFile[]>;
  getEvidenceFilesBySystemForOrg(organizationId: string, systemId: string): Promise<EvidenceFile[]>;
  getEvidenceFileByIdForOrg(organizationId: string, id: string): Promise<EvidenceFile | undefined>;
  createEvidenceFileForOrg(organizationId: string, file: Omit<InsertEvidenceFile, "organizationId">): Promise<EvidenceFile>;
  deleteEvidenceFileForOrg(organizationId: string, id: string): Promise<void>;
  getEvidenceFile(id: string): Promise<EvidenceFile | undefined>;
  createEvidenceFile(file: InsertEvidenceFile): Promise<EvidenceFile>;
  deleteEvidenceFile(id: string): Promise<void>;

  getRiskAssessments(): Promise<RiskAssessment[]>;
  getRiskAssessmentsByOrg(organizationId: string): Promise<RiskAssessment[]>;
  getRiskAssessmentsBySystemForOrg(organizationId: string, systemId: string): Promise<RiskAssessment[]>;
  getRiskAssessmentByIdForOrg(organizationId: string, id: string): Promise<RiskAssessment | undefined>;
  createRiskAssessmentForOrg(
    organizationId: string,
    assessment: Omit<InsertRiskAssessment, "organizationId">,
  ): Promise<RiskAssessment>;
  updateRiskAssessmentForOrg(
    organizationId: string,
    id: string,
    data: Partial<Omit<InsertRiskAssessment, "organizationId">>,
  ): Promise<RiskAssessment | undefined>;
  getRiskAssessmentsBySystem(systemId: string): Promise<RiskAssessment[]>;
  createRiskAssessment(assessment: InsertRiskAssessment): Promise<RiskAssessment>;

  bulkCreateSystemControls(items: { systemId: string; controlId: string }[]): Promise<SystemControl[]>;
  bulkCreateSystemControlsForOrg(
    organizationId: string,
    items: { systemId: string; controlId: string }[],
  ): Promise<SystemControl[]>;
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

export interface SystemControlFilters {
  status?: string;
  systemId?: string;
  assignee?: string;
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

  async findUserByProviderSubject(
    authProvider: NonNullable<User["authProvider"]>,
    authProviderSubject: string,
  ): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.authProvider, authProvider),
          eq(users.authProviderSubject, authProviderSubject),
        ),
      );
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserAuthIdentity(
    userId: string,
    data: {
      authProvider?: User["authProvider"];
      authProviderSubject?: string | null;
      emailVerified?: boolean;
      lastLoginAt?: Date | null;
    },
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        authProvider: data.authProvider,
        authProviderSubject: data.authProviderSubject,
        emailVerified: data.emailVerified,
        lastLoginAt: data.lastLoginAt,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserLastLogin(userId: string, at: Date = new Date()): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        lastLoginAt: at,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserPassword(
    userId: string,
    data: {
      password: string;
      passwordChangedAt: Date;
      passwordExpiresAt: Date;
      passwordHistory: string[];
    },
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        password: data.password,
        passwordHistory: data.passwordHistory,
        passwordChangedAt: data.passwordChangedAt,
        passwordExpiresAt: data.passwordExpiresAt,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserMfa(
    userId: string,
    data: {
      mfaEnabled: boolean;
      mfaSecret: string | null;
      mfaRecoveryCodes: string[];
    },
  ): Promise<User | undefined> {
    const [updated] = await db
      .update(users)
      .set({
        mfaEnabled: data.mfaEnabled,
        mfaSecret: data.mfaSecret,
        mfaRecoveryCodes: data.mfaRecoveryCodes,
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async getOrganizationById(id: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, id));
    return organization;
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | undefined> {
    const [organization] = await db.select().from(organizations).where(eq(organizations.slug, slug));
    return organization;
  }

  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [organization] = await db.insert(organizations).values(org).returning();
    return organization;
  }

  async getOrganizationDomainsByOrg(organizationId: string): Promise<OrganizationDomain[]> {
    return db
      .select()
      .from(organizationDomains)
      .where(eq(organizationDomains.organizationId, organizationId));
  }

  async replaceOrganizationDomainsForOrg(
    organizationId: string,
    domains: Array<{
      id?: string;
      domain: string;
      isVerified?: boolean;
      isPrimary?: boolean;
      verificationToken?: string;
      verifiedAt?: Date | null;
      createdAt?: Date;
    }>,
  ): Promise<OrganizationDomain[]> {
    type NormalizedDomainRow = {
      id?: string;
      domain: string;
      isVerified: boolean;
      isPrimary: boolean;
      verificationToken: string;
      verifiedAt: Date | null;
      createdAt?: Date;
    };

    const normalizedMap = new Map<string, NormalizedDomainRow>();
    for (const entry of domains) {
      const normalized = entry.domain.trim().toLowerCase();
      if (!normalized) continue;

      normalizedMap.set(normalized, {
        id: entry.id,
        domain: normalized,
        isVerified: entry.isVerified ?? false,
        isPrimary: entry.isPrimary ?? false,
        verificationToken: entry.verificationToken ?? normalized,
        verifiedAt: entry.verifiedAt ?? null,
        createdAt: entry.createdAt,
      });
    }

    const normalizedDomains = Array.from(normalizedMap.values());

    await db.delete(organizationDomains).where(eq(organizationDomains.organizationId, organizationId));

    if (normalizedDomains.length === 0) {
      return [];
    }

    const primaryDomain = normalizedDomains.find((entry) => entry.isPrimary)?.domain ?? normalizedDomains[0].domain;

    return db
      .insert(organizationDomains)
      .values(
        normalizedDomains.map((entry) => ({
          id: entry.id,
          organizationId,
          domain: entry.domain,
          isVerified: entry.isVerified,
          isPrimary: entry.domain === primaryDomain,
          verificationToken: entry.verificationToken,
          verifiedAt: entry.isVerified ? entry.verifiedAt ?? new Date() : null,
          createdAt: entry.createdAt,
        })),
      )
      .returning();
  }

  async createOrganizationDomain(domain: InsertOrganizationDomain): Promise<OrganizationDomain> {
    const [created] = await db.insert(organizationDomains).values(domain).returning();
    return created;
  }

  async deleteOrganizationDomainByIdForOrg(organizationId: string, domainId: string): Promise<void> {
    await db
      .delete(organizationDomains)
      .where(
        and(
          eq(organizationDomains.organizationId, organizationId),
          eq(organizationDomains.id, domainId),
        ),
      );
  }

  async findOrganizationByEmailDomain(domain: string): Promise<Organization | undefined> {
    const normalizedDomain = domain.trim().toLowerCase();
    const [row] = await db
      .select({
        organization: organizations,
      })
      .from(organizationDomains)
      .innerJoin(organizations, eq(organizationDomains.organizationId, organizations.id))
      .where(eq(organizationDomains.domain, normalizedDomain));
    return row?.organization;
  }

  async getMembershipsByUserId(userId: string): Promise<UserMembershipContext[]> {
    return db
      .select({
        id: memberships.id,
        userId: memberships.userId,
        organizationId: memberships.organizationId,
        role: memberships.role,
        membershipState: memberships.membershipState,
        isDefault: memberships.isDefault,
        invitedBy: memberships.invitedBy,
        onboardingState: memberships.onboardingState,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        organizationStatus: organizations.status,
      })
      .from(memberships)
      .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
      .where(eq(memberships.userId, userId));
  }

  async createMembership(membership: InsertMembership): Promise<Membership> {
    const [created] = await db.insert(memberships).values(membership).returning();
    return created;
  }

  async updateMembershipProvisioningMetadata(
    membershipId: string,
    data: {
      provisioningSource?: Membership["provisioningSource"];
      externalGroup?: string | null;
      lastSyncedAt?: Date | null;
    },
  ): Promise<Membership | undefined> {
    const [updated] = await db
      .update(memberships)
      .set({
        provisioningSource: data.provisioningSource,
        externalGroup: data.externalGroup,
        lastSyncedAt: data.lastSyncedAt,
      })
      .where(eq(memberships.id, membershipId))
      .returning();
    return updated;
  }

  async updateMembershipOnboardingState(
    membershipId: string,
    onboardingState: Record<string, unknown>,
  ): Promise<Membership | undefined> {
    const [updated] = await db
      .update(memberships)
      .set({
        onboardingState,
        updatedAt: new Date(),
      })
      .where(eq(memberships.id, membershipId))
      .returning();
    return updated;
  }

  async getUsersByOrganization(organizationId: string): Promise<User[]> {
    return db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        passwordHistory: users.passwordHistory,
        passwordChangedAt: users.passwordChangedAt,
        passwordExpiresAt: users.passwordExpiresAt,
        mfaEnabled: users.mfaEnabled,
        mfaSecret: users.mfaSecret,
        mfaRecoveryCodes: users.mfaRecoveryCodes,
        fullName: users.fullName,
        email: users.email,
        authProvider: users.authProvider,
        authProviderSubject: users.authProviderSubject,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        role: users.role,
      })
      .from(users)
      .innerJoin(memberships, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.membershipState, "active"),
        ),
      );
  }

  async getUsersByOrganizationRoles(organizationId: string, roles: string[]): Promise<User[]> {
    if (roles.length === 0) return [];
    return db
      .select({
        id: users.id,
        username: users.username,
        password: users.password,
        passwordHistory: users.passwordHistory,
        passwordChangedAt: users.passwordChangedAt,
        passwordExpiresAt: users.passwordExpiresAt,
        mfaEnabled: users.mfaEnabled,
        mfaSecret: users.mfaSecret,
        mfaRecoveryCodes: users.mfaRecoveryCodes,
        fullName: users.fullName,
        email: users.email,
        authProvider: users.authProvider,
        authProviderSubject: users.authProviderSubject,
        emailVerified: users.emailVerified,
        lastLoginAt: users.lastLoginAt,
        role: users.role,
      })
      .from(users)
      .innerJoin(memberships, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.membershipState, "active"),
          inArray(memberships.role, roles),
        ),
      );
  }

  async getAiSystemsByOrg(organizationId: string, filters?: AiSystemFilters): Promise<AiSystem[]> {
    const conditions: SQL[] = [eq(aiSystems.organizationId, organizationId)];
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
    return db
      .select()
      .from(aiSystems)
      .where(and(...conditions))
      .orderBy(desc(aiSystems.createdAt));
  }

  async getAiSystemById(organizationId: string, id: string): Promise<AiSystem | undefined> {
    const [system] = await db
      .select()
      .from(aiSystems)
      .where(and(eq(aiSystems.id, id), eq(aiSystems.organizationId, organizationId)));
    return system;
  }

  async createAiSystemForOrg(organizationId: string, system: InsertAiSystem): Promise<AiSystem> {
    const [created] = await db.insert(aiSystems).values({ ...system, organizationId }).returning();
    return created;
  }

  async updateAiSystemByOrg(organizationId: string, id: string, data: Partial<InsertAiSystem>): Promise<AiSystem | undefined> {
    const { organizationId: _ignoredOrganizationId, ...safeData } = data as Partial<InsertAiSystem> & { organizationId?: string };
    const [updated] = await db
      .update(aiSystems)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(aiSystems.id, id), eq(aiSystems.organizationId, organizationId)))
      .returning();
    return updated;
  }

  async deleteAiSystemByOrg(organizationId: string, id: string): Promise<void> {
    await db.delete(aiSystems).where(and(eq(aiSystems.id, id), eq(aiSystems.organizationId, organizationId)));
  }

  async getAiSystems(_filters?: AiSystemFilters): Promise<AiSystem[]> {
    throwUnscopedTenantMethod("getAiSystems", "getAiSystemsByOrg");
  }

  async getAiSystem(_id: string): Promise<AiSystem | undefined> {
    throwUnscopedTenantMethod("getAiSystem", "getAiSystemById");
  }

  async createAiSystem(_system: InsertAiSystem): Promise<AiSystem> {
    throwUnscopedTenantMethod("createAiSystem", "createAiSystemForOrg");
  }

  async updateAiSystem(_id: string, _data: Partial<InsertAiSystem>): Promise<AiSystem | undefined> {
    throwUnscopedTenantMethod("updateAiSystem", "updateAiSystemByOrg");
  }

  async deleteAiSystem(_id: string): Promise<void> {
    throwUnscopedTenantMethod("deleteAiSystem", "deleteAiSystemByOrg");
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
    throwUnscopedTenantMethod("getSystemControls", "getSystemControlsByOrg");
  }

  async getSystemControlsByOrg(
    organizationId: string,
    filters?: SystemControlFilters,
  ): Promise<SystemControl[]> {
    const conditions: SQL[] = [eq(systemControls.organizationId, organizationId)];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(systemControls.status, filters.status));
    }
    if (filters?.systemId && filters.systemId !== "all") {
      conditions.push(eq(systemControls.systemId, filters.systemId));
    }
    if (filters?.assignee && filters.assignee !== "all") {
      conditions.push(ilike(systemControls.assignee, `%${filters.assignee}%`));
    }
    return db.select().from(systemControls).where(and(...conditions));
  }

  async getSystemControlsBySystem(_systemId: string): Promise<SystemControl[]> {
    throwUnscopedTenantMethod("getSystemControlsBySystem", "getSystemControlsBySystemForOrg");
  }

  async getSystemControlsBySystemForOrg(organizationId: string, systemId: string): Promise<SystemControl[]> {
    return db
      .select()
      .from(systemControls)
      .where(and(eq(systemControls.organizationId, organizationId), eq(systemControls.systemId, systemId)));
  }

  async getSystemControlsByAssigneeForOrg(organizationId: string, assignee: string): Promise<SystemControl[]> {
    return db
      .select()
      .from(systemControls)
      .where(
        and(
          eq(systemControls.organizationId, organizationId),
          or(ilike(systemControls.assignee, assignee))!,
        ),
      );
  }

  async getSystemControlByIdForOrg(organizationId: string, id: string): Promise<SystemControl | undefined> {
    const [control] = await db
      .select()
      .from(systemControls)
      .where(and(eq(systemControls.organizationId, organizationId), eq(systemControls.id, id)));
    return control;
  }

  async getSystemControlBySystemAndControlForOrg(
    organizationId: string,
    systemId: string,
    controlId: string,
  ): Promise<SystemControl | undefined> {
    const [control] = await db
      .select()
      .from(systemControls)
      .where(
        and(
          eq(systemControls.organizationId, organizationId),
          eq(systemControls.systemId, systemId),
          eq(systemControls.controlId, controlId),
        ),
      );
    return control;
  }

  async createSystemControlForOrg(organizationId: string, sc: InsertSystemControl): Promise<SystemControl> {
    const [created] = await db.insert(systemControls).values({ ...sc, organizationId }).returning();
    return created;
  }

  async updateSystemControlForOrg(
    organizationId: string,
    id: string,
    data: Partial<InsertSystemControl>,
  ): Promise<SystemControl | undefined> {
    const { organizationId: _ignoredOrganizationId, ...safeData } = data as Partial<InsertSystemControl> & { organizationId?: string };
    const [updated] = await db
      .update(systemControls)
      .set(safeData)
      .where(and(eq(systemControls.organizationId, organizationId), eq(systemControls.id, id)))
      .returning();
    return updated;
  }

  async deleteSystemControlForOrg(organizationId: string, id: string): Promise<void> {
    await db.delete(systemControls).where(and(eq(systemControls.organizationId, organizationId), eq(systemControls.id, id)));
  }

  async createSystemControl(_sc: InsertSystemControl): Promise<SystemControl> {
    throwUnscopedTenantMethod("createSystemControl", "createSystemControlForOrg");
  }

  async updateSystemControl(_id: string, _data: Partial<InsertSystemControl>): Promise<SystemControl | undefined> {
    throwUnscopedTenantMethod("updateSystemControl", "updateSystemControlForOrg");
  }

  async getApprovalWorkflows(_filters?: ApprovalWorkflowFilters): Promise<ApprovalWorkflow[]> {
    throwUnscopedTenantMethod("getApprovalWorkflows", "getApprovalWorkflowsByOrg");
  }

  async getApprovalWorkflow(_id: string): Promise<ApprovalWorkflow | undefined> {
    throwUnscopedTenantMethod("getApprovalWorkflow", "getApprovalWorkflowById");
  }

  async getApprovalWorkflowsByOrg(organizationId: string, filters?: ApprovalWorkflowFilters): Promise<ApprovalWorkflow[]> {
    const conditions: SQL[] = [eq(approvalWorkflows.organizationId, organizationId)];
    if (filters?.status && filters.status !== "all") {
      conditions.push(eq(approvalWorkflows.status, filters.status));
    }
    if (filters?.priority && filters.priority !== "all") {
      conditions.push(eq(approvalWorkflows.priority, filters.priority));
    }
    if (filters?.systemId && filters.systemId !== "all") {
      conditions.push(eq(approvalWorkflows.systemId, filters.systemId));
    }
    return db
      .select()
      .from(approvalWorkflows)
      .where(and(...conditions))
      .orderBy(desc(approvalWorkflows.createdAt));
  }

  async getApprovalWorkflowById(organizationId: string, id: string): Promise<ApprovalWorkflow | undefined> {
    const [workflow] = await db
      .select()
      .from(approvalWorkflows)
      .where(and(eq(approvalWorkflows.id, id), eq(approvalWorkflows.organizationId, organizationId)));
    return workflow;
  }

  async getApprovalWorkflowsByReviewerForOrg(organizationId: string, reviewer: string): Promise<ApprovalWorkflow[]> {
    return db
      .select()
      .from(approvalWorkflows)
      .where(
        and(
          eq(approvalWorkflows.organizationId, organizationId),
          or(eq(approvalWorkflows.reviewer, reviewer))!,
          or(eq(approvalWorkflows.status, "pending"), eq(approvalWorkflows.status, "in_review"))!,
        ),
      )
      .orderBy(desc(approvalWorkflows.createdAt));
  }

  async getApprovalWorkflowsBySystemForOrg(organizationId: string, systemId: string): Promise<ApprovalWorkflow[]> {
    return db
      .select()
      .from(approvalWorkflows)
      .where(and(eq(approvalWorkflows.organizationId, organizationId), eq(approvalWorkflows.systemId, systemId)))
      .orderBy(desc(approvalWorkflows.createdAt));
  }

  async createApprovalWorkflowForOrg(organizationId: string, wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow> {
    const [created] = await db.insert(approvalWorkflows).values({ ...wf, organizationId }).returning();
    return created;
  }

  async updateApprovalWorkflowByOrg(
    organizationId: string,
    id: string,
    data: Partial<InsertApprovalWorkflow>,
  ): Promise<ApprovalWorkflow | undefined> {
    const { organizationId: _ignoredOrganizationId, ...safeData } = data as Partial<InsertApprovalWorkflow> & { organizationId?: string };
    const [updated] = await db
      .update(approvalWorkflows)
      .set({ ...safeData, updatedAt: new Date() })
      .where(and(eq(approvalWorkflows.id, id), eq(approvalWorkflows.organizationId, organizationId)))
      .returning();
    return updated;
  }

  async deleteApprovalWorkflowByOrg(organizationId: string, id: string): Promise<void> {
    await db
      .delete(approvalWorkflows)
      .where(and(eq(approvalWorkflows.id, id), eq(approvalWorkflows.organizationId, organizationId)));
  }

  async getApprovalWorkflowsBySystem(_systemId: string): Promise<ApprovalWorkflow[]> {
    throwUnscopedTenantMethod("getApprovalWorkflowsBySystem", "getApprovalWorkflowsBySystemForOrg");
  }

  async createApprovalWorkflow(_wf: InsertApprovalWorkflow): Promise<ApprovalWorkflow> {
    throwUnscopedTenantMethod("createApprovalWorkflow", "createApprovalWorkflowForOrg");
  }

  async updateApprovalWorkflow(_id: string, _data: Partial<InsertApprovalWorkflow>): Promise<ApprovalWorkflow | undefined> {
    throwUnscopedTenantMethod("updateApprovalWorkflow", "updateApprovalWorkflowByOrg");
  }

  async getAuditLogs(_filters?: AuditLogFilters): Promise<AuditLog[]> {
    throwUnscopedTenantMethod("getAuditLogs", "getAuditLogsByOrg");
  }

  async getAuditLogsByOrg(organizationId: string, filters?: AuditLogFilters): Promise<AuditLog[]> {
    const conditions: SQL[] = [eq(auditLogs.organizationId, organizationId)];
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
    return db
      .select()
      .from(auditLogs)
      .where(and(...conditions))
      .orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsByEntityForOrg(organizationId: string, entityId: string): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.organizationId, organizationId), eq(auditLogs.entityId, entityId)))
      .orderBy(desc(auditLogs.createdAt));
  }

  async createAuditLogForOrg(organizationId: string, log: Omit<InsertAuditLog, "organizationId">): Promise<AuditLog> {
    const [created] = await db.insert(auditLogs).values({ ...log, organizationId }).returning();
    return created;
  }

  async getAuditLogsByEntity(_entityId: string): Promise<AuditLog[]> {
    throwUnscopedTenantMethod("getAuditLogsByEntity", "getAuditLogsByEntityForOrg");
  }

  async createAuditLog(_log: InsertAuditLog): Promise<AuditLog> {
    throwUnscopedTenantMethod("createAuditLog", "createAuditLogForOrg");
  }

  async getNotificationsByUser(_userId: string): Promise<Notification[]> {
    throwUnscopedTenantMethod("getNotificationsByUser", "getNotificationsByOrgUser");
  }

  async getNotificationsByOrgUser(organizationId: string, userId: string): Promise<Notification[]> {
    return db
      .select()
      .from(notifications)
      .where(and(eq(notifications.organizationId, organizationId), eq(notifications.userId, userId)))
      .orderBy(desc(notifications.createdAt));
  }

  async getNotificationByIdForOrgUser(organizationId: string, userId: string, id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
        ),
      );
    return notification;
  }

  async createNotificationForOrg(
    organizationId: string,
    notification: Omit<InsertNotification, "organizationId">,
  ): Promise<Notification> {
    const [created] = await db.insert(notifications).values({ ...notification, organizationId }).returning();
    return created;
  }

  async markNotificationReadByOrgUser(
    organizationId: string,
    userId: string,
    id: string,
  ): Promise<Notification | undefined> {
    const [updated] = await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
        ),
      )
      .returning();
    return updated;
  }

  async markAllNotificationsReadByOrgUser(organizationId: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          eq(notifications.read, false),
        ),
      );
  }

  async getUnreadNotificationCountByOrgUser(organizationId: string, userId: string): Promise<number> {
    const result = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.organizationId, organizationId),
          eq(notifications.userId, userId),
          eq(notifications.read, false),
        ),
      );
    return result.length;
  }

  async createNotification(_notification: InsertNotification): Promise<Notification> {
    throwUnscopedTenantMethod("createNotification", "createNotificationForOrg");
  }

  async markNotificationRead(_id: string): Promise<Notification | undefined> {
    throwUnscopedTenantMethod("markNotificationRead", "markNotificationReadByOrgUser");
  }

  async markAllNotificationsRead(_userId: string): Promise<void> {
    throwUnscopedTenantMethod("markAllNotificationsRead", "markAllNotificationsReadByOrgUser");
  }

  async getUnreadNotificationCount(_userId: string): Promise<number> {
    throwUnscopedTenantMethod("getUnreadNotificationCount", "getUnreadNotificationCountByOrgUser");
  }

  async getEvidenceFiles(_filters?: EvidenceFileFilters): Promise<EvidenceFile[]> {
    throwUnscopedTenantMethod("getEvidenceFiles", "getEvidenceFilesByOrg");
  }

  async getEvidenceFilesByOrg(organizationId: string, filters?: EvidenceFileFilters): Promise<EvidenceFile[]> {
    const conditions: SQL[] = [eq(evidenceFiles.organizationId, organizationId)];
    if (filters?.systemId) {
      conditions.push(eq(evidenceFiles.systemId, filters.systemId));
    }
    if (filters?.controlId) {
      conditions.push(eq(evidenceFiles.controlId, filters.controlId));
    }
    if (filters?.workflowId) {
      conditions.push(eq(evidenceFiles.workflowId, filters.workflowId));
    }
    return db
      .select()
      .from(evidenceFiles)
      .where(and(...conditions))
      .orderBy(desc(evidenceFiles.createdAt));
  }

  async getEvidenceFilesBySystemForOrg(organizationId: string, systemId: string): Promise<EvidenceFile[]> {
    return db
      .select()
      .from(evidenceFiles)
      .where(and(eq(evidenceFiles.organizationId, organizationId), eq(evidenceFiles.systemId, systemId)))
      .orderBy(desc(evidenceFiles.createdAt));
  }

  async getEvidenceFileByIdForOrg(organizationId: string, id: string): Promise<EvidenceFile | undefined> {
    const [file] = await db
      .select()
      .from(evidenceFiles)
      .where(and(eq(evidenceFiles.organizationId, organizationId), eq(evidenceFiles.id, id)));
    return file;
  }

  async createEvidenceFileForOrg(
    organizationId: string,
    file: Omit<InsertEvidenceFile, "organizationId">,
  ): Promise<EvidenceFile> {
    const [created] = await db.insert(evidenceFiles).values({ ...file, organizationId }).returning();
    return created;
  }

  async deleteEvidenceFileForOrg(organizationId: string, id: string): Promise<void> {
    await db
      .delete(evidenceFiles)
      .where(and(eq(evidenceFiles.organizationId, organizationId), eq(evidenceFiles.id, id)));
  }

  async getEvidenceFile(_id: string): Promise<EvidenceFile | undefined> {
    throwUnscopedTenantMethod("getEvidenceFile", "getEvidenceFileByIdForOrg");
  }

  async createEvidenceFile(_file: InsertEvidenceFile): Promise<EvidenceFile> {
    throwUnscopedTenantMethod("createEvidenceFile", "createEvidenceFileForOrg");
  }

  async deleteEvidenceFile(_id: string): Promise<void> {
    throwUnscopedTenantMethod("deleteEvidenceFile", "deleteEvidenceFileForOrg");
  }

  async getRiskAssessments(): Promise<RiskAssessment[]> {
    throwUnscopedTenantMethod("getRiskAssessments", "getRiskAssessmentsByOrg");
  }

  async getRiskAssessmentsByOrg(organizationId: string): Promise<RiskAssessment[]> {
    return db
      .select()
      .from(riskAssessments)
      .where(eq(riskAssessments.organizationId, organizationId))
      .orderBy(desc(riskAssessments.createdAt));
  }

  async getRiskAssessmentsBySystemForOrg(organizationId: string, systemId: string): Promise<RiskAssessment[]> {
    return db
      .select()
      .from(riskAssessments)
      .where(and(eq(riskAssessments.organizationId, organizationId), eq(riskAssessments.systemId, systemId)))
      .orderBy(desc(riskAssessments.createdAt));
  }

  async getRiskAssessmentByIdForOrg(organizationId: string, id: string): Promise<RiskAssessment | undefined> {
    const [assessment] = await db
      .select()
      .from(riskAssessments)
      .where(and(eq(riskAssessments.organizationId, organizationId), eq(riskAssessments.id, id)));
    return assessment;
  }

  async createRiskAssessmentForOrg(
    organizationId: string,
    assessment: Omit<InsertRiskAssessment, "organizationId">,
  ): Promise<RiskAssessment> {
    const [created] = await db.insert(riskAssessments).values({ ...assessment, organizationId }).returning();
    return created;
  }

  async updateRiskAssessmentForOrg(
    organizationId: string,
    id: string,
    data: Partial<Omit<InsertRiskAssessment, "organizationId">>,
  ): Promise<RiskAssessment | undefined> {
    const { organizationId: _ignoredOrganizationId, ...safeData } = data as Partial<InsertRiskAssessment> & { organizationId?: string };
    const [updated] = await db
      .update(riskAssessments)
      .set(safeData)
      .where(and(eq(riskAssessments.organizationId, organizationId), eq(riskAssessments.id, id)))
      .returning();
    return updated;
  }

  async getRiskAssessmentsBySystem(_systemId: string): Promise<RiskAssessment[]> {
    throwUnscopedTenantMethod("getRiskAssessmentsBySystem", "getRiskAssessmentsBySystemForOrg");
  }

  async createRiskAssessment(_assessment: InsertRiskAssessment): Promise<RiskAssessment> {
    throwUnscopedTenantMethod("createRiskAssessment", "createRiskAssessmentForOrg");
  }

  async getSystemControlsByAssignee(_assignee: string): Promise<SystemControl[]> {
    throwUnscopedTenantMethod("getSystemControlsByAssignee", "getSystemControlsByAssigneeForOrg");
  }

  async getApprovalWorkflowsByReviewer(_reviewer: string): Promise<ApprovalWorkflow[]> {
    throwUnscopedTenantMethod("getApprovalWorkflowsByReviewer", "getApprovalWorkflowsByReviewerForOrg");
  }

  async getAiSystemsByOwner(_owner: string): Promise<AiSystem[]> {
    throwUnscopedTenantMethod("getAiSystemsByOwner", "getAiSystemsByOrg");
  }

  async bulkCreateSystemControls(_items: { systemId: string; controlId: string }[]): Promise<SystemControl[]> {
    throwUnscopedTenantMethod("bulkCreateSystemControls", "bulkCreateSystemControlsForOrg");
  }

  async bulkCreateSystemControlsForOrg(
    organizationId: string,
    items: { systemId: string; controlId: string }[],
  ): Promise<SystemControl[]> {
    if (items.length === 0) return [];
    const values = items.map((item) => ({
      organizationId,
      systemId: item.systemId,
      controlId: item.controlId,
      status: "not_started" as const,
    }));
    return db.insert(systemControls).values(values).returning();
  }
}

export const storage = new DatabaseStorage();
