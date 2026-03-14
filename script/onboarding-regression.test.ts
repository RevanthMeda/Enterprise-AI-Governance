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
import { memberships, organizations, users } from "../shared/schema";

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

test("onboarding state persists per active membership and round-trips through auth payload", async () => {
  const suffix = makeSuffix();
  const createdOrganizationIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMembershipIds: string[] = [];

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `onboarding-org-${suffix}`,
      name: `Onboarding Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    createdOrganizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const user = await storage.createUser({
      username: `onboarding_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Onboarding Admin ${suffix}`,
      email: `onboarding-admin-${suffix}@example.com`,
      role: "admin",
    });
    createdUserIds.push(user.id);

    const membership = await storage.createMembership({
      userId: user.id,
      organizationId: org.id,
      role: "admin",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    createdMembershipIds.push(membership.id);

    const started = await startTestServer();
    server = started.server;

    const login = await apiRequest(started.baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.username, password, organizationSlug: org.slug },
    });
    assert.equal(login.status, 200, "Expected onboarding test login to succeed");
    const cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie, "Expected authenticated cookie");

    const saved = await apiRequest(started.baseUrl, "/api/auth/onboarding-state", {
      method: "POST",
      cookie,
      body: {
        currentStep: 2,
        completedSteps: ["inventory", "controls"],
        dismissedAlerts: ["approval_backlog"],
        snoozedAlerts: {
          high_risk_systems: "2099-01-01T00:00:00.000Z",
        },
      },
    });
    assert.equal(saved.status, 200, "Expected onboarding state save to succeed");
    const savedBody = saved.body as {
      currentOrganizationOnboarding?: {
        currentStep: number;
        completedSteps: string[];
        dismissedAlerts: string[];
        snoozedAlerts: Record<string, string>;
      } | null;
    };
    assert.equal(savedBody.currentOrganizationOnboarding?.currentStep, 2, "Expected saved current step");
    assert.deepEqual(
      savedBody.currentOrganizationOnboarding?.completedSteps,
      ["inventory", "controls"],
      "Expected saved completed steps in auth payload",
    );
    assert.deepEqual(
      savedBody.currentOrganizationOnboarding?.dismissedAlerts,
      ["approval_backlog"],
      "Expected dismissed alerts in auth payload",
    );
    assert.deepEqual(
      savedBody.currentOrganizationOnboarding?.snoozedAlerts,
      { high_risk_systems: "2099-01-01T00:00:00.000Z" },
      "Expected snoozed alerts in auth payload",
    );

    const [updatedMembership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.id, membership.id));
    assert.deepEqual(
      updatedMembership.onboardingState,
      {
        currentStep: 2,
        completedSteps: ["inventory", "controls"],
        dismissedAlerts: ["approval_backlog"],
        snoozedAlerts: { high_risk_systems: "2099-01-01T00:00:00.000Z" },
        updatedAt: (updatedMembership.onboardingState as { updatedAt: string }).updatedAt,
      },
      "Expected onboarding state to persist on membership",
    );

    const authUser = await apiRequest(started.baseUrl, "/api/auth/user", { cookie });
    assert.equal(authUser.status, 200, "Expected auth payload fetch to succeed");
    const authBody = authUser.body as {
      currentOrganizationOnboarding?: {
        currentStep: number;
        completedSteps: string[];
        dismissedAlerts: string[];
        snoozedAlerts: Record<string, string>;
      } | null;
    };
    assert.equal(authBody.currentOrganizationOnboarding?.currentStep, 2, "Expected onboarding step to round-trip");
    assert.deepEqual(
      authBody.currentOrganizationOnboarding?.completedSteps,
      ["inventory", "controls"],
      "Expected onboarding completed steps to round-trip",
    );
    assert.deepEqual(
      authBody.currentOrganizationOnboarding?.dismissedAlerts,
      ["approval_backlog"],
      "Expected dismissed alerts to round-trip",
    );
    assert.deepEqual(
      authBody.currentOrganizationOnboarding?.snoozedAlerts,
      { high_risk_systems: "2099-01-01T00:00:00.000Z" },
      "Expected snoozed alerts to round-trip",
    );
  } finally {
    await server?.close();
    if (createdMembershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, createdMembershipIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
    if (createdOrganizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, createdOrganizationIds));
    }
  }
});
