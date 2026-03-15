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
    const portfolioId = controlPlaneBody.portfolios[0]?.id;
    assert.ok(portfolioId, "Expected bootstrap portfolio");
    tracker.portfolioIds.push(portfolioId);

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
  } finally {
    await server?.close();
    if (tracker.organizationIds[0]) {
      await db.delete(organizationTelemetryPolicies).where(eq(organizationTelemetryPolicies.organizationId, tracker.organizationIds[0]));
    }
    if (tracker.portfolioIds[0]) {
      await db.delete(portfolioTelemetryPolicies).where(eq(portfolioTelemetryPolicies.portfolioId, tracker.portfolioIds[0]));
      await db.delete(portfolioOrganizations).where(eq(portfolioOrganizations.portfolioId, tracker.portfolioIds[0]));
      await db.delete(portfolioMemberships).where(eq(portfolioMemberships.portfolioId, tracker.portfolioIds[0]));
      await db.delete(portfolios).where(eq(portfolios.id, tracker.portfolioIds[0]));
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
