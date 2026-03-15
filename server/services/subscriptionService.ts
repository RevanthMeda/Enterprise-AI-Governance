import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  aiIncidents,
  aiSystems,
  approvalWorkflows,
  memberships,
  organizations,
  organizationSubscriptions,
  type InsertOrganizationSubscription,
} from "@shared/schema";

function normalizeTierFromPlan(plan: string | null | undefined) {
  if (plan === "enterprise") return "enterprise";
  if (plan === "growth") return "growth";
  return "pilot";
}

export class SubscriptionService {
  private async buildUsageSummary(organizationId: string) {
    const [members] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(memberships)
      .where(and(eq(memberships.organizationId, organizationId), eq(memberships.membershipState, "active")));

    const [systems] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiSystems)
      .where(eq(aiSystems.organizationId, organizationId));

    const [workflows] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(approvalWorkflows)
      .where(eq(approvalWorkflows.organizationId, organizationId));

    const [incidents] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(aiIncidents)
      .where(eq(aiIncidents.organizationId, organizationId));

    return {
      activeMembers: members?.count ?? 0,
      systems: systems?.count ?? 0,
      workflows: workflows?.count ?? 0,
      incidents: incidents?.count ?? 0,
    };
  }

  async getForOrg(organizationId: string) {
    const [organization] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    const usageSummary = await this.buildUsageSummary(organizationId);
    const [existing] = await db
      .select()
      .from(organizationSubscriptions)
      .where(eq(organizationSubscriptions.organizationId, organizationId));

    if (existing) {
      const [updated] = await db
        .update(organizationSubscriptions)
        .set({ usageSummary, updatedAt: new Date() })
        .where(eq(organizationSubscriptions.organizationId, organizationId))
        .returning();
      return updated;
    }

    const tier = normalizeTierFromPlan(organization?.plan);
    const [created] = await db
      .insert(organizationSubscriptions)
      .values({
        organizationId,
        tier,
        status: "trialing",
        seatLimit: tier === "enterprise" ? 500 : tier === "growth" ? 100 : 25,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        usageSummary,
      })
      .returning();
    return created;
  }

  async updateForOrg(organizationId: string, input: Partial<Omit<InsertOrganizationSubscription, "organizationId">>) {
    await this.getForOrg(organizationId);
    const usageSummary = await this.buildUsageSummary(organizationId);
    const [updated] = await db
      .update(organizationSubscriptions)
      .set({ ...input, usageSummary, updatedAt: new Date() })
      .where(eq(organizationSubscriptions.organizationId, organizationId))
      .returning();
    return updated;
  }
}

export const subscriptionService = new SubscriptionService();
