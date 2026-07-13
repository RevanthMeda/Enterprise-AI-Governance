import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import {
  aiSystems,
  approvalWorkflows,
  auditLogs,
  evidenceFiles,
  memberships,
  notifications,
  organizations,
  riskAssessments,
  systemControls,
  users,
} from "@shared/schema";

export function mapLegacyUserRoleToMembershipRole(role: string): string {
  if (role === "admin") return "admin";
  return role;
}

export async function backfillTenantBoundRows(organizationId: string): Promise<void> {
  await db.execute(sql`UPDATE ai_systems SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
  await db.execute(sql`UPDATE system_controls SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
  await db.execute(sql`UPDATE approval_workflows SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
  await db.execute(sql`UPDATE audit_logs SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
  await db.execute(sql`UPDATE notifications SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
  await db.execute(sql`UPDATE evidence_files SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
  await db.execute(sql`UPDATE risk_assessments SET organization_id = ${organizationId} WHERE organization_id IS NULL`);
}

export async function ensureTenantBootstrap(): Promise<{ organizationId: string }> {
  let [defaultOrg] = await db.select().from(organizations).where(eq(organizations.slug, "default-org"));
  if (!defaultOrg) {
    [defaultOrg] = await db
      .insert(organizations)
      .values({
        slug: "default-org",
        name: "Default Organization",
        status: "active",
        plan: "starter",
      })
      .returning();
  }

  const allUsers = await db.select().from(users);
  for (const user of allUsers) {
    const [existingMembership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.organizationId, defaultOrg.id)));
    if (existingMembership) continue;

    const [existingDefaultMembership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.isDefault, true)));

    await db.insert(memberships).values({
      userId: user.id,
      organizationId: defaultOrg.id,
      role: mapLegacyUserRoleToMembershipRole(user.role),
      membershipState: "active",
      isDefault: !existingDefaultMembership,
      invitedBy: null,
    });
  }

  await backfillTenantBoundRows(defaultOrg.id);
  return { organizationId: defaultOrg.id };
}
