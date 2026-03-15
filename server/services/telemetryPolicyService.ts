import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  portfolioOrganizations,
  portfolioTelemetryPolicies,
  portfolios,
  organizationTelemetryPolicies,
  type InsertOrganizationTelemetryPolicy,
  type OrganizationTelemetryPolicy,
  type InsertPortfolioTelemetryPolicy,
  type PortfolioTelemetryPolicy,
} from "@shared/schema";

export const defaultTelemetryPolicy = {
  driftAlertThreshold: 5,
  driftCriticalThreshold: 10,
  biasFlagThreshold: 1,
  safetyFlagThreshold: 1,
  overrideRateWarningThreshold: 40,
  overrideRateCriticalThreshold: 60,
  errorRateWarningThreshold: 5,
  errorRateCriticalThreshold: 10,
  autoEscalateCritical: true,
  notifyOnWarning: true,
};

export type EffectiveTelemetryPolicy = {
  id: string | null;
  organizationId: string;
  source: "organization" | "portfolio" | "default";
  inheritedFromPortfolioId: string | null;
  inheritedFromPortfolioName: string | null;
  hasExplicitOverride: boolean;
} & typeof defaultTelemetryPolicy;

function toEffectivePolicy(params: {
  organizationId: string;
  source: "organization" | "portfolio" | "default";
  inheritedFromPortfolioId?: string | null;
  inheritedFromPortfolioName?: string | null;
  hasExplicitOverride: boolean;
  id?: string | null;
  policy: typeof defaultTelemetryPolicy;
}): EffectiveTelemetryPolicy {
  return {
    id: params.id ?? null,
    organizationId: params.organizationId,
    source: params.source,
    inheritedFromPortfolioId: params.inheritedFromPortfolioId ?? null,
    inheritedFromPortfolioName: params.inheritedFromPortfolioName ?? null,
    hasExplicitOverride: params.hasExplicitOverride,
    ...params.policy,
  };
}

export class TelemetryPolicyService {
  private async getOrganizationOverride(organizationId: string): Promise<OrganizationTelemetryPolicy | null> {
    const [existing] = await db
      .select()
      .from(organizationTelemetryPolicies)
      .where(eq(organizationTelemetryPolicies.organizationId, organizationId))
      .limit(1);

    return existing ?? null;
  }

  private async getInheritedPortfolioPolicy(organizationId: string): Promise<{
    policy: PortfolioTelemetryPolicy;
    portfolioId: string;
    portfolioName: string;
  } | null> {
    const [row] = await db
      .select({
        policy: portfolioTelemetryPolicies,
        portfolioId: portfolios.id,
        portfolioName: portfolios.name,
      })
      .from(portfolioOrganizations)
      .innerJoin(portfolios, eq(portfolioOrganizations.portfolioId, portfolios.id))
      .innerJoin(portfolioTelemetryPolicies, eq(portfolios.id, portfolioTelemetryPolicies.portfolioId))
      .where(eq(portfolioOrganizations.organizationId, organizationId))
      .orderBy(asc(portfolios.createdAt))
      .limit(1);

    return row ?? null;
  }

  async getEffectiveForOrg(organizationId: string): Promise<EffectiveTelemetryPolicy> {
    const override = await this.getOrganizationOverride(organizationId);
    if (override) {
      return toEffectivePolicy({
        id: override.id,
        organizationId,
        source: "organization",
        hasExplicitOverride: true,
        policy: {
          driftAlertThreshold: override.driftAlertThreshold,
          driftCriticalThreshold: override.driftCriticalThreshold,
          biasFlagThreshold: override.biasFlagThreshold,
          safetyFlagThreshold: override.safetyFlagThreshold,
          overrideRateWarningThreshold: override.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: override.overrideRateCriticalThreshold,
          errorRateWarningThreshold: override.errorRateWarningThreshold,
          errorRateCriticalThreshold: override.errorRateCriticalThreshold,
          autoEscalateCritical: override.autoEscalateCritical,
          notifyOnWarning: override.notifyOnWarning,
        },
      });
    }

    const inherited = await this.getInheritedPortfolioPolicy(organizationId);
    if (inherited) {
      return toEffectivePolicy({
        id: inherited.policy.id,
        organizationId,
        source: "portfolio",
        inheritedFromPortfolioId: inherited.portfolioId,
        inheritedFromPortfolioName: inherited.portfolioName,
        hasExplicitOverride: false,
        policy: {
          driftAlertThreshold: inherited.policy.driftAlertThreshold,
          driftCriticalThreshold: inherited.policy.driftCriticalThreshold,
          biasFlagThreshold: inherited.policy.biasFlagThreshold,
          safetyFlagThreshold: inherited.policy.safetyFlagThreshold,
          overrideRateWarningThreshold: inherited.policy.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: inherited.policy.overrideRateCriticalThreshold,
          errorRateWarningThreshold: inherited.policy.errorRateWarningThreshold,
          errorRateCriticalThreshold: inherited.policy.errorRateCriticalThreshold,
          autoEscalateCritical: inherited.policy.autoEscalateCritical,
          notifyOnWarning: inherited.policy.notifyOnWarning,
        },
      });
    }

    return toEffectivePolicy({
      id: null,
      organizationId,
      source: "default",
      hasExplicitOverride: false,
      policy: defaultTelemetryPolicy,
    });
  }

  async updateForOrg(
    organizationId: string,
    input: Partial<Omit<InsertOrganizationTelemetryPolicy, "organizationId">>,
  ): Promise<EffectiveTelemetryPolicy> {
    const current = await this.getOrganizationOverride(organizationId);
    if (current) {
      await db
        .update(organizationTelemetryPolicies)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(organizationTelemetryPolicies.id, current.id));
    } else {
      await db
        .insert(organizationTelemetryPolicies)
        .values({
          organizationId,
          ...defaultTelemetryPolicy,
          ...input,
          updatedAt: new Date(),
        });
    }

    return this.getEffectiveForOrg(organizationId);
  }

  async resetOrgOverride(organizationId: string): Promise<EffectiveTelemetryPolicy> {
    await db
      .delete(organizationTelemetryPolicies)
      .where(eq(organizationTelemetryPolicies.organizationId, organizationId));

    return this.getEffectiveForOrg(organizationId);
  }

  async getForPortfolio(portfolioId: string): Promise<PortfolioTelemetryPolicy> {
    const [existing] = await db
      .select()
      .from(portfolioTelemetryPolicies)
      .where(eq(portfolioTelemetryPolicies.portfolioId, portfolioId))
      .limit(1);

    if (existing) {
      return existing;
    }

    const [created] = await db
      .insert(portfolioTelemetryPolicies)
      .values({
        portfolioId,
        ...defaultTelemetryPolicy,
        updatedAt: new Date(),
      })
      .returning();

    return created;
  }

  async updateForPortfolio(
    portfolioId: string,
    input: Partial<Omit<InsertPortfolioTelemetryPolicy, "portfolioId">>,
  ): Promise<PortfolioTelemetryPolicy> {
    const current = await this.getForPortfolio(portfolioId);
    const [updated] = await db
      .update(portfolioTelemetryPolicies)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(eq(portfolioTelemetryPolicies.id, current.id))
      .returning();

    return updated;
  }
}

export const telemetryPolicyService = new TelemetryPolicyService();
