import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  portfolioOrganizations,
  portfolioTelemetryPolicies,
  portfolios,
  organizationTelemetryPolicies,
  systemTelemetryPolicies,
  type InsertOrganizationTelemetryPolicy,
  type OrganizationTelemetryPolicy,
  type InsertPortfolioTelemetryPolicy,
  type PortfolioTelemetryPolicy,
  type InsertSystemTelemetryPolicy,
  type SystemTelemetryPolicy,
} from "@shared/schema";

export const defaultTelemetryPolicy = {
  driftAlertThreshold: 5,
  driftCriticalThreshold: 10,
  biasFlagThreshold: 1,
  safetyFlagThreshold: 1,
  toxicityWarningThreshold: 60,
  toxicityCriticalThreshold: 80,
  piiFlagThreshold: 1,
  overrideRateWarningThreshold: 40,
  overrideRateCriticalThreshold: 60,
  errorRateWarningThreshold: 5,
  errorRateCriticalThreshold: 10,
  autoEscalateCritical: true,
  notifyOnWarning: true,
  enforceBlocking: false,
  blockOnPii: true,
  blockOnSafetyCritical: true,
  blockOnRestrictedPrompt: true,
  restrictedPromptPatterns: [] as string[],
  shadowModeEnabled: false,
  shadowModeLabel: "stricter-preview",
};

export type EffectiveTelemetryPolicy = {
  id: string | null;
  organizationId: string;
  systemId: string | null;
  source: "system" | "organization" | "portfolio" | "default";
  inheritedFromPortfolioId: string | null;
  inheritedFromPortfolioName: string | null;
  hasExplicitOverride: boolean;
} & typeof defaultTelemetryPolicy;

function toEffectivePolicy(params: {
  organizationId: string;
  source: "system" | "organization" | "portfolio" | "default";
  systemId?: string | null;
  inheritedFromPortfolioId?: string | null;
  inheritedFromPortfolioName?: string | null;
  hasExplicitOverride: boolean;
  id?: string | null;
  policy: typeof defaultTelemetryPolicy;
}): EffectiveTelemetryPolicy {
  return {
    id: params.id ?? null,
    organizationId: params.organizationId,
    systemId: params.systemId ?? null,
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

  private async getSystemOverride(organizationId: string, systemId: string): Promise<SystemTelemetryPolicy | null> {
    const [existing] = await db
      .select()
      .from(systemTelemetryPolicies)
      .where(
        and(
          eq(systemTelemetryPolicies.organizationId, organizationId),
          eq(systemTelemetryPolicies.systemId, systemId),
        ),
      )
      .limit(1);

    return existing ?? null;
  }

  private async getInheritedPortfolioPolicy(organizationId: string): Promise<{
    policy: PortfolioTelemetryPolicy;
    portfolioId: string;
    portfolioName: string;
  } | null> {
    const rows = await db
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
      .limit(2);

    if (rows.length > 1) {
      throw Object.assign(
        new Error("Organization has multiple parent portfolio policies; resolve the assignments before evaluation"),
        { status: 409 },
      );
    }

    return rows[0] ?? null;
  }

  async getEffectiveForOrg(organizationId: string): Promise<EffectiveTelemetryPolicy> {
    const override = await this.getOrganizationOverride(organizationId);
    if (override) {
      return toEffectivePolicy({
        id: override.id,
        organizationId,
        systemId: null,
        source: "organization",
        hasExplicitOverride: true,
        policy: {
          driftAlertThreshold: override.driftAlertThreshold,
          driftCriticalThreshold: override.driftCriticalThreshold,
          biasFlagThreshold: override.biasFlagThreshold,
          safetyFlagThreshold: override.safetyFlagThreshold,
          toxicityWarningThreshold: override.toxicityWarningThreshold,
          toxicityCriticalThreshold: override.toxicityCriticalThreshold,
          piiFlagThreshold: override.piiFlagThreshold,
          overrideRateWarningThreshold: override.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: override.overrideRateCriticalThreshold,
          errorRateWarningThreshold: override.errorRateWarningThreshold,
          errorRateCriticalThreshold: override.errorRateCriticalThreshold,
          autoEscalateCritical: override.autoEscalateCritical,
          notifyOnWarning: override.notifyOnWarning,
          enforceBlocking: override.enforceBlocking,
          blockOnPii: override.blockOnPii,
          blockOnSafetyCritical: override.blockOnSafetyCritical,
          blockOnRestrictedPrompt: override.blockOnRestrictedPrompt,
          restrictedPromptPatterns: Array.isArray(override.restrictedPromptPatterns)
            ? override.restrictedPromptPatterns.filter((entry): entry is string => typeof entry === "string")
            : [],
          shadowModeEnabled: override.shadowModeEnabled,
          shadowModeLabel: override.shadowModeLabel,
        },
      });
    }

    const inherited = await this.getInheritedPortfolioPolicy(organizationId);
    if (inherited) {
      return toEffectivePolicy({
        id: inherited.policy.id,
        organizationId,
        systemId: null,
        source: "portfolio",
        inheritedFromPortfolioId: inherited.portfolioId,
        inheritedFromPortfolioName: inherited.portfolioName,
        hasExplicitOverride: false,
        policy: {
          driftAlertThreshold: inherited.policy.driftAlertThreshold,
          driftCriticalThreshold: inherited.policy.driftCriticalThreshold,
          biasFlagThreshold: inherited.policy.biasFlagThreshold,
          safetyFlagThreshold: inherited.policy.safetyFlagThreshold,
          toxicityWarningThreshold: inherited.policy.toxicityWarningThreshold,
          toxicityCriticalThreshold: inherited.policy.toxicityCriticalThreshold,
          piiFlagThreshold: inherited.policy.piiFlagThreshold,
          overrideRateWarningThreshold: inherited.policy.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: inherited.policy.overrideRateCriticalThreshold,
          errorRateWarningThreshold: inherited.policy.errorRateWarningThreshold,
          errorRateCriticalThreshold: inherited.policy.errorRateCriticalThreshold,
          autoEscalateCritical: inherited.policy.autoEscalateCritical,
          notifyOnWarning: inherited.policy.notifyOnWarning,
          enforceBlocking: inherited.policy.enforceBlocking,
          blockOnPii: inherited.policy.blockOnPii,
          blockOnSafetyCritical: inherited.policy.blockOnSafetyCritical,
          blockOnRestrictedPrompt: inherited.policy.blockOnRestrictedPrompt,
          restrictedPromptPatterns: Array.isArray(inherited.policy.restrictedPromptPatterns)
            ? inherited.policy.restrictedPromptPatterns.filter((entry): entry is string => typeof entry === "string")
            : [],
          shadowModeEnabled: inherited.policy.shadowModeEnabled,
          shadowModeLabel: inherited.policy.shadowModeLabel,
        },
      });
    }

    return toEffectivePolicy({
      id: null,
      organizationId,
      systemId: null,
      source: "default",
      hasExplicitOverride: false,
      policy: defaultTelemetryPolicy,
    });
  }

  async getEffectiveForSystem(organizationId: string, systemId: string): Promise<EffectiveTelemetryPolicy> {
    const override = await this.getSystemOverride(organizationId, systemId);
    if (override) {
      return toEffectivePolicy({
        id: override.id,
        organizationId,
        systemId,
        source: "system",
        hasExplicitOverride: true,
        policy: {
          driftAlertThreshold: override.driftAlertThreshold,
          driftCriticalThreshold: override.driftCriticalThreshold,
          biasFlagThreshold: override.biasFlagThreshold,
          safetyFlagThreshold: override.safetyFlagThreshold,
          toxicityWarningThreshold: override.toxicityWarningThreshold,
          toxicityCriticalThreshold: override.toxicityCriticalThreshold,
          piiFlagThreshold: override.piiFlagThreshold,
          overrideRateWarningThreshold: override.overrideRateWarningThreshold,
          overrideRateCriticalThreshold: override.overrideRateCriticalThreshold,
          errorRateWarningThreshold: override.errorRateWarningThreshold,
          errorRateCriticalThreshold: override.errorRateCriticalThreshold,
          autoEscalateCritical: override.autoEscalateCritical,
          notifyOnWarning: override.notifyOnWarning,
          enforceBlocking: override.enforceBlocking,
          blockOnPii: override.blockOnPii,
          blockOnSafetyCritical: override.blockOnSafetyCritical,
          blockOnRestrictedPrompt: override.blockOnRestrictedPrompt,
          restrictedPromptPatterns: Array.isArray(override.restrictedPromptPatterns)
            ? override.restrictedPromptPatterns.filter((entry): entry is string => typeof entry === "string")
            : [],
          shadowModeEnabled: override.shadowModeEnabled,
          shadowModeLabel: override.shadowModeLabel,
        },
      });
    }

    const inherited = await this.getEffectiveForOrg(organizationId);
    return {
      ...inherited,
      systemId,
    };
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

  async updateForSystem(
    organizationId: string,
    systemId: string,
    input: Partial<Omit<InsertSystemTelemetryPolicy, "organizationId" | "systemId">>,
  ): Promise<EffectiveTelemetryPolicy> {
    const current = await this.getSystemOverride(organizationId, systemId);
    if (current) {
      await db
        .update(systemTelemetryPolicies)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(systemTelemetryPolicies.id, current.id));
    } else {
      await db
        .insert(systemTelemetryPolicies)
        .values({
          organizationId,
          systemId,
          ...defaultTelemetryPolicy,
          ...input,
          updatedAt: new Date(),
        });
    }

    return this.getEffectiveForSystem(organizationId, systemId);
  }

  async resetSystemOverride(organizationId: string, systemId: string): Promise<EffectiveTelemetryPolicy> {
    await db
      .delete(systemTelemetryPolicies)
      .where(
        and(
          eq(systemTelemetryPolicies.organizationId, organizationId),
          eq(systemTelemetryPolicies.systemId, systemId),
        ),
      );

    return this.getEffectiveForSystem(organizationId, systemId);
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
