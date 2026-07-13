import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
  private createStatusError(message: string, status: number) {
    return Object.assign(new Error(message), { status });
  }

  async listForUser(userId: string) {
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
      .where(eq(portfolioMemberships.userId, userId))
      .orderBy(asc(portfolios.createdAt));
  }

  async provisionForOrganization(params: {
    userId: string;
    organizationId: string;
    name?: string;
    sponsorName?: string;
    investmentThesis?: string;
  }) {
    return db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`portfolio-parent:${params.organizationId}`}))`,
      );

      const [organization] = await tx
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, params.organizationId))
        .limit(1);
      if (!organization) {
        throw this.createStatusError("Organization not found", 404);
      }

      const [organizationMembership] = await tx
        .select({ role: memberships.role, membershipState: memberships.membershipState })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, params.userId),
            eq(memberships.organizationId, params.organizationId),
          ),
        )
        .limit(1);
      if (
        organizationMembership?.membershipState !== "active" ||
        (organizationMembership.role !== "owner" && organizationMembership.role !== "admin")
      ) {
        throw this.createStatusError("Owner or admin access is required to provision a portfolio", 403);
      }

      const existingLinks = await tx
        .select({
          portfolioId: portfolioOrganizations.portfolioId,
          portfolioName: portfolios.name,
        })
        .from(portfolioOrganizations)
        .innerJoin(portfolios, eq(portfolioOrganizations.portfolioId, portfolios.id))
        .where(eq(portfolioOrganizations.organizationId, params.organizationId));

      if (existingLinks.length > 1) {
        throw this.createStatusError(
          "Organization has multiple parent portfolios; resolve the assignments before provisioning",
          409,
        );
      }

      const existingLink = existingLinks[0];
      if (existingLink) {
        const [existingMembership] = await tx
          .select({ role: portfolioMemberships.role })
          .from(portfolioMemberships)
          .where(
            and(
              eq(portfolioMemberships.portfolioId, existingLink.portfolioId),
              eq(portfolioMemberships.userId, params.userId),
            ),
          )
          .limit(1);

        if (existingMembership?.role !== "portfolio_admin") {
          throw this.createStatusError(
            "Organization already belongs to a portfolio managed by another portfolio administrator",
            409,
          );
        }

        return {
          created: false,
          portfolioId: existingLink.portfolioId,
          portfolioName: existingLink.portfolioName,
        };
      }

      const slug = `portfolio-${params.organizationId.slice(0, 8)}-${Date.now().toString(36)}`;
      const [portfolio] = await tx
        .insert(portfolios)
        .values({
          slug,
          name: params.name?.trim() || `${organization.name} Portfolio`,
          sponsorName: params.sponsorName?.trim() || organization.name,
          investmentThesis:
            params.investmentThesis?.trim() ||
            "Governance, decision traceability, and exit-readiness oversight.",
          updatedAt: new Date(),
        })
        .returning();
      if (!portfolio) {
        throw this.createStatusError("Failed to provision portfolio", 500);
      }

      await tx.insert(portfolioMemberships).values({
        portfolioId: portfolio.id,
        userId: params.userId,
        role: "portfolio_admin",
        updatedAt: new Date(),
      });
      await tx.insert(portfolioOrganizations).values({
        portfolioId: portfolio.id,
        organizationId: params.organizationId,
        operatingStatus: "active",
      });

      return {
        created: true,
        portfolioId: portfolio.id,
        portfolioName: portfolio.name,
      };
    });
  }

  async assertCanManagePolicy(params: {
    userId: string;
    portfolioId: string;
    currentOrganizationId: string;
  }) {
    const [portfolioMembership] = await db
      .select({ role: portfolioMemberships.role })
      .from(portfolioMemberships)
      .where(
        and(
          eq(portfolioMemberships.portfolioId, params.portfolioId),
          eq(portfolioMemberships.userId, params.userId),
        ),
      )
      .limit(1);
    if (portfolioMembership?.role !== "portfolio_admin") {
      throw this.createStatusError("Portfolio admin access required", 403);
    }

    const links = await db
      .select({ organizationId: portfolioOrganizations.organizationId })
      .from(portfolioOrganizations)
      .where(eq(portfolioOrganizations.portfolioId, params.portfolioId));
    const linkedOrganizationIds = Array.from(new Set(links.map((link) => link.organizationId)));
    if (linkedOrganizationIds.length === 0) {
      throw this.createStatusError("Portfolio has no linked organizations", 409);
    }
    if (!linkedOrganizationIds.includes(params.currentOrganizationId)) {
      throw this.createStatusError("Current organization is not linked to this portfolio", 403);
    }

    const parentCounts = await db
      .select({
        organizationId: portfolioOrganizations.organizationId,
        count: sql<number>`count(distinct ${portfolioOrganizations.portfolioId})::int`,
      })
      .from(portfolioOrganizations)
      .where(inArray(portfolioOrganizations.organizationId, linkedOrganizationIds))
      .groupBy(portfolioOrganizations.organizationId);
    if (parentCounts.some((row) => row.count > 1)) {
      throw this.createStatusError(
        "One or more organizations have multiple parent portfolios; resolve the assignments before changing policy",
        409,
      );
    }

    const organizationMemberships = await db
      .select({
        organizationId: memberships.organizationId,
        role: memberships.role,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, params.userId),
          eq(memberships.membershipState, "active"),
          inArray(memberships.organizationId, linkedOrganizationIds),
        ),
      );
    const rolesByOrganization = new Map(
      organizationMemberships.map((membership) => [membership.organizationId, membership.role]),
    );
    const hasAuthorityForEveryOrganization = linkedOrganizationIds.every((organizationId) => {
      const role = rolesByOrganization.get(organizationId);
      return role === "owner" || role === "admin";
    });
    if (!hasAuthorityForEveryOrganization) {
      throw this.createStatusError(
        "Owner or admin access is required for every organization linked to this portfolio",
        403,
      );
    }
  }

  async getControlPlane(params: {
    userId: string;
    actor: Actor;
    portfolioId?: string;
  }) {
    const portfoliosForUser = await this.listForUser(params.userId);
    const selectedPortfolio = params.portfolioId
      ? portfoliosForUser.find((portfolio) => portfolio.id === params.portfolioId) ?? null
      : portfoliosForUser[0] ?? null;

    if (params.portfolioId && !selectedPortfolio) {
      throw this.createStatusError("Portfolio not found", 404);
    }

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
