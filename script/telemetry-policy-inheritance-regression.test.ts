import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { eq, inArray } from "drizzle-orm";
import { hashPassword, setupAuth } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { telemetryPolicyService } from "../server/services/telemetryPolicyService";
import {
  memberships,
  organizationTelemetryPolicies,
  organizations,
  portfolioMemberships,
  portfolioOrganizations,
  portfolioTelemetryPolicies,
  portfolios,
  users,
} from "../shared/schema";

type ApiResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
};

function makeSuffix() {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
}

function cookieFromSetCookie(setCookie?: string): string | undefined {
  if (!setCookie) return undefined;
  const firstCookie = setCookie.split(",")[0] ?? "";
  const pair = firstCookie.split(";")[0] ?? "";
  return pair || undefined;
}

async function apiRequest(
  baseUrl: string,
  path: string,
  opts?: {
    method?: string;
    body?: unknown;
    cookie?: string;
  },
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (opts?.cookie) headers.Cookie = opts.cookie;
  if (opts?.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  return {
    status: res.status,
    body,
    setCookie: res.headers.get("set-cookie") ?? undefined,
  };
}

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  const server = createServer(app);

  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: false }));

  setupAuth(app);
  await registerRoutes(server, app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("portfolio telemetry policy inherits into orgs and org reset falls back cleanly", async () => {
  const suffix = makeSuffix();
  const tracker = {
    organizationIds: [] as string[],
    membershipIds: [] as string[],
    userIds: [] as string[],
    portfolioIds: [] as string[],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `inherit-org-${suffix}`,
      name: `Inheritance Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `inherit_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Inheritance Admin ${suffix}`,
      email: `inherit-admin-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(adminUser.id);

    const membership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: org.id,
      role: "admin",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(membership.id);

    ({ server } = await startTestServer());
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password, organizationSlug: org.slug },
    });
    assert.equal(login.status, 200);
    const cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie);

    const controlPlane = await apiRequest(baseUrl, "/api/portfolio-control", { cookie });
    assert.equal(controlPlane.status, 200);
    const controlPlaneBody = controlPlane.body as {
      portfolios: Array<{ id: string }>;
    };
    assert.deepEqual(controlPlaneBody.portfolios, [], "GET must not provision a portfolio or grant access");

    const provision = await apiRequest(baseUrl, "/api/portfolio-control/provision", {
      method: "POST",
      cookie,
      body: {},
    });
    assert.equal(provision.status, 201);
    const portfolioId = (provision.body as { portfolioId?: string }).portfolioId;
    assert.ok(portfolioId, "Expected explicit portfolio provisioning to return an id");
    tracker.portfolioIds.push(portfolioId);

    const repeatedProvision = await apiRequest(baseUrl, "/api/portfolio-control/provision", {
      method: "POST",
      cookie,
      body: {},
    });
    assert.equal(repeatedProvision.status, 200);
    assert.equal((repeatedProvision.body as { portfolioId: string }).portfolioId, portfolioId);

    const unknownPortfolio = await apiRequest(
      baseUrl,
      "/api/portfolio-control?portfolioId=00000000-0000-0000-0000-000000000000",
      { cookie },
    );
    assert.equal(unknownPortfolio.status, 404);
    const unknownPortfolioPolicy = await apiRequest(
      baseUrl,
      "/api/portfolio-control/telemetry-policy?portfolioId=00000000-0000-0000-0000-000000000000",
      { cookie },
    );
    assert.equal(unknownPortfolioPolicy.status, 404);

    const reviewerUser = await storage.createUser({
      username: `inherit_reviewer_${suffix}`,
      password: await hashPassword(password),
      fullName: `Inheritance Reviewer ${suffix}`,
      email: `inherit-reviewer-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(reviewerUser.id);
    const reviewerMembership = await storage.createMembership({
      userId: reviewerUser.id,
      organizationId: org.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: adminUser.id,
    });
    tracker.membershipIds.push(reviewerMembership.id);
    await db.insert(portfolioMemberships).values({
      portfolioId,
      userId: reviewerUser.id,
      role: "portfolio_admin",
    });

    const reviewerLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: reviewerUser.username, password, organizationSlug: org.slug },
    });
    assert.equal(reviewerLogin.status, 200);
    const reviewerCookie = cookieFromSetCookie(reviewerLogin.setCookie);
    assert.ok(reviewerCookie);
    const reviewerPatch = await apiRequest(
      baseUrl,
      `/api/portfolio-control/telemetry-policy?portfolioId=${encodeURIComponent(portfolioId)}`,
      {
        method: "PATCH",
        cookie: reviewerCookie,
        body: { driftAlertThreshold: 8 },
      },
    );
    assert.equal(reviewerPatch.status, 403);

    const unknownPatch = await apiRequest(
      baseUrl,
      "/api/portfolio-control/telemetry-policy?portfolioId=00000000-0000-0000-0000-000000000000",
      {
        method: "PATCH",
        cookie,
        body: { driftAlertThreshold: 8 },
      },
    );
    assert.equal(unknownPatch.status, 404);

    const portfolioPatch = await apiRequest(
      baseUrl,
      `/api/portfolio-control/telemetry-policy?portfolioId=${encodeURIComponent(portfolioId)}`,
      {
        method: "PATCH",
        cookie,
        body: {
          driftAlertThreshold: 9,
          notifyOnWarning: false,
        },
      },
    );
    assert.equal(portfolioPatch.status, 200);

    const inherited = await apiRequest(baseUrl, "/api/organization/telemetry-policy", { cookie });
    assert.equal(inherited.status, 200);
    const inheritedBody = inherited.body as {
      source: string;
      driftAlertThreshold: number;
      notifyOnWarning: boolean;
    };
    assert.equal(inheritedBody.source, "portfolio");
    assert.equal(inheritedBody.driftAlertThreshold, 9);
    assert.equal(inheritedBody.notifyOnWarning, false);

    const override = await apiRequest(baseUrl, "/api/organization/telemetry-policy", {
      method: "PATCH",
      cookie,
      body: {
        driftAlertThreshold: 15,
      },
    });
    assert.equal(override.status, 200);
    const overrideBody = override.body as { source: string; driftAlertThreshold: number; hasExplicitOverride: boolean };
    assert.equal(overrideBody.source, "organization");
    assert.equal(overrideBody.driftAlertThreshold, 15);
    assert.equal(overrideBody.hasExplicitOverride, true);

    const reset = await apiRequest(baseUrl, "/api/organization/telemetry-policy/reset", {
      method: "POST",
      cookie,
    });
    assert.equal(reset.status, 200);
    const resetBody = reset.body as { source: string; driftAlertThreshold: number; hasExplicitOverride: boolean };
    assert.equal(resetBody.source, "portfolio");
    assert.equal(resetBody.driftAlertThreshold, 9);
    assert.equal(resetBody.hasExplicitOverride, false);

    const [secondPortfolio] = await db
      .insert(portfolios)
      .values({
        slug: `ambiguous-portfolio-${suffix}`,
        name: `Ambiguous Portfolio ${suffix}`,
      })
      .returning();
    tracker.portfolioIds.push(secondPortfolio.id);
    await db.insert(portfolioOrganizations).values({
      portfolioId: secondPortfolio.id,
      organizationId: org.id,
      operatingStatus: "active",
    });
    await db.insert(portfolioTelemetryPolicies).values({ portfolioId: secondPortfolio.id });

    await assert.rejects(
      () => telemetryPolicyService.getEffectiveForOrg(org.id),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { status?: number }).status === 409 &&
        error.message.includes("multiple parent portfolio policies"),
    );
  } finally {
    await server?.close();
    if (tracker.organizationIds[0]) {
      await db.delete(organizationTelemetryPolicies).where(eq(organizationTelemetryPolicies.organizationId, tracker.organizationIds[0]));
    }
    if (tracker.portfolioIds.length > 0) {
      await db.delete(portfolioTelemetryPolicies).where(inArray(portfolioTelemetryPolicies.portfolioId, tracker.portfolioIds));
      await db.delete(portfolioOrganizations).where(inArray(portfolioOrganizations.portfolioId, tracker.portfolioIds));
      await db.delete(portfolioMemberships).where(inArray(portfolioMemberships.portfolioId, tracker.portfolioIds));
      await db.delete(portfolios).where(inArray(portfolios.id, tracker.portfolioIds));
    }
    if (tracker.membershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, tracker.membershipIds));
    }
    if (tracker.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, tracker.userIds));
    }
    if (tracker.organizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, tracker.organizationIds));
    }
  }
});
