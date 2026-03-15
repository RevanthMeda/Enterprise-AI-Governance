import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { memberships, organizations, portfolioMemberships, portfolioOrganizations, portfolios } from "@shared/schema";
import { dashboardService } from "./dashboardService";
import { telemetryPolicyService } from "./telemetryPolicyService";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class PortfolioService {
  private async ensureBootstrapPortfolioForUser(userId: string, actorName: string) {
    const existingMemberships = await db
      .select({
        portfolioId: portfolioMemberships.portfolioId,
      })
      .from(portfolioMemberships)
      .where(eq(portfolioMemberships.userId, userId))
      .limit(1);

    if (existingMemberships.length > 0) {
      return;
    }

    const orgMemberships = await db
      .select({
        organizationId: memberships.organizationId,
      })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.membershipState, "active")));

    if (orgMemberships.length === 0) {
      return;
    }

    const slug = `portfolio-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
    const [portfolio] = await db
      .insert(portfolios)
      .values({
        slug,
        name: `${actorName.split(" ")[0] || "Operator"} Portfolio`,
        sponsorName: "PilotWave Holdings",
        investmentThesis: "Roll-up governance, decision traceability, and exit-readiness oversight.",
        updatedAt: new Date(),
      })
      .returning();

    await db.insert(portfolioMemberships).values({
      portfolioId: portfolio.id,
      userId,
      role: "portfolio_admin",
      updatedAt: new Date(),
    });

    await db.insert(portfolioOrganizations).values(
      orgMemberships.map((membership) => ({
        portfolioId: portfolio.id,
        organizationId: membership.organizationId,
        operatingStatus: "active",
      })),
    );
  }

  async listForUser(userId: string, actorName: string) {
    await this.ensureBootstrapPortfolioForUser(userId, actorName);

    return db
      .select({
        id: portfolios.id,
        slug: portfolios.slug,
        name: portfolios.name,
        sponsorName: portfolios.sponsorName,
        investmentThesis: portfolios.investmentThesis,
        role: portfolioMemberships.role,
        createdAt: portfolios.createdAt,
      })
      .from(portfolios)
      .innerJoin(portfolioMemberships, eq(portfolios.id, portfolioMemberships.portfolioId))
      .where(eq(portfolioMemberships.userId, userId));
  }

  async getControlPlane(params: {
    userId: string;
    actor: Actor;
    portfolioId?: string;
  }) {
    const portfoliosForUser = await this.listForUser(params.userId, params.actor.fullName || params.actor.username);
    const selectedPortfolio =
      portfoliosForUser.find((portfolio) => portfolio.id === params.portfolioId) ?? portfoliosForUser[0] ?? null;

    if (!selectedPortfolio) {
      return {
        portfolios: [],
        selectedPortfolio: null,
        organizations: [],
        summary: null,
      };
    }

    const portfolioOrgs = await db
      .select({
        linkId: portfolioOrganizations.id,
        organizationId: organizations.id,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        operatingStatus: portfolioOrganizations.operatingStatus,
      })
      .from(portfolioOrganizations)
      .innerJoin(organizations, eq(portfolioOrganizations.organizationId, organizations.id))
      .where(eq(portfolioOrganizations.portfolioId, selectedPortfolio.id));

    const organizationDetails = await Promise.all(
      portfolioOrgs.map(async (org) => {
        const exitReadiness = await dashboardService.getExitReadiness({
          organizationId: org.organizationId,
          actor: params.actor,
        });

        const documentationMetric = exitReadiness.metrics.find(
          (metric) => metric.key === "decision_documentation_rate",
        );
        const containmentMetric = exitReadiness.metrics.find(
          (metric) => metric.key === "incident_response_time",
        );
        const telemetryPolicy = await telemetryPolicyService.getEffectiveForOrg(org.organizationId);

        return {
          ...org,
          metrics: exitReadiness.metrics,
          documentationRate: documentationMetric?.value ?? null,
          containmentHours: containmentMetric?.value ?? null,
          openIncidents: exitReadiness.summary.openIncidents,
          telemetryAlerts: exitReadiness.summary.telemetryAlerts,
          tierBreakdown: exitReadiness.summary.tierBreakdown,
          telemetryPolicySource: telemetryPolicy.source,
          telemetryPolicyInheritedFrom: telemetryPolicy.inheritedFromPortfolioName,
        };
      }),
    );

    const portfolioPolicy = await telemetryPolicyService.getForPortfolio(selectedPortfolio.id);

    const aggregate = {
      organizations: organizationDetails.length,
      tracedWorkflows: organizationDetails.reduce((sum, org) => {
        const metric = org.metrics.find((entry) => entry.key === "decision_documentation_rate");
        return sum + (metric?.value ?? 0);
      }, 0),
      openIncidents: organizationDetails.reduce((sum, org) => sum + org.openIncidents, 0),
      telemetryAlerts: organizationDetails.reduce((sum, org) => sum + org.telemetryAlerts, 0),
      tier3Exposure: organizationDetails.reduce((sum, org) => sum + org.tierBreakdown.tier3, 0),
      averageDocumentationRate:
        organizationDetails.length > 0
          ? Math.round(
              organizationDetails.reduce((sum, org) => sum + (org.documentationRate ?? 0), 0) /
                organizationDetails.length,
            )
          : 0,
      averageContainmentHours:
        organizationDetails.filter((org) => typeof org.containmentHours === "number").length > 0
          ? Math.round(
              (organizationDetails.reduce((sum, org) => sum + (org.containmentHours ?? 0), 0) /
                organizationDetails.filter((org) => typeof org.containmentHours === "number").length) *
                10,
            ) / 10
          : null,
      telemetryPolicySources: {
        organization: organizationDetails.filter((org) => org.telemetryPolicySource === "organization").length,
        portfolio: organizationDetails.filter((org) => org.telemetryPolicySource === "portfolio").length,
        default: organizationDetails.filter((org) => org.telemetryPolicySource === "default").length,
      },
    };

    return {
      portfolios: portfoliosForUser,
      selectedPortfolio,
      portfolioPolicy,
      organizations: organizationDetails,
      summary: aggregate,
    };
  }
}

export const portfolioService = new PortfolioService();
