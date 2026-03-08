import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { inArray } from "drizzle-orm";
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

type Tracker = {
  organizationIds: string[];
  membershipIds: string[];
  userIds: string[];
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
  if (opts?.cookie) {
    headers.Cookie = opts.cookie;
  }
  if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

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

test("settings route/nav remain admin-gated in app router and sidebar", async () => {
  const appPath = new URL("../client/src/App.tsx", import.meta.url);
  const sidebarPath = new URL("../client/src/components/app-sidebar.tsx", import.meta.url);

  const [appSource, sidebarSource] = await Promise.all([
    fs.readFile(appPath, "utf8"),
    fs.readFile(sidebarPath, "utf8"),
  ]);

  assert.match(
    appSource,
    /path="\/settings"/,
    "Expected /settings route to exist",
  );
  assert.match(
    appSource,
    /isAdmin\s*\?\s*SettingsPage\s*:\s*Dashboard/,
    "Expected /settings route to keep non-admin users away from SettingsPage",
  );

  assert.match(
    sidebarSource,
    /const isAdmin = user\?\.role === "admin";/,
    "Expected sidebar to compute admin role gate",
  );
  assert.match(
    sidebarSource,
    /\{isAdmin && \(/,
    "Expected Settings sidebar section to render only for admins",
  );
});

test("mfa endpoints are admin-only", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `rbac-mfa-${suffix}`,
      name: `RBAC MFA ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `rbac_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `RBAC Admin ${suffix}`,
      email: `rbac-admin-${suffix}@example.com`,
      role: "admin",
    });
    const reviewerUser = await storage.createUser({
      username: `rbac_reviewer_${suffix}`,
      password: await hashPassword(password),
      fullName: `RBAC Reviewer ${suffix}`,
      email: `rbac-reviewer-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(adminUser.id, reviewerUser.id);

    const adminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: org.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    const reviewerMembership = await storage.createMembership({
      userId: reviewerUser.id,
      organizationId: org.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: adminUser.id,
    });
    tracker.membershipIds.push(adminMembership.id, reviewerMembership.id);

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const reviewerLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: reviewerUser.username, password },
    });
    assert.equal(reviewerLogin.status, 200);
    const reviewerCookie = cookieFromSetCookie(reviewerLogin.setCookie);
    assert.ok(reviewerCookie, "Expected reviewer auth cookie");

    const blockedRequests = [
      { path: "/api/auth/mfa/enroll", body: {} },
      { path: "/api/auth/mfa/verify-enroll", body: { code: "000000" } },
      { path: "/api/auth/mfa/disable", body: { password: "ignored", mfaCode: "000000" } },
      { path: "/api/auth/mfa/recovery-codes/regenerate", body: { mfaCode: "000000" } },
    ] as const;

    for (const request of blockedRequests) {
      const res = await apiRequest(baseUrl, request.path, {
        method: "POST",
        body: request.body,
        cookie: reviewerCookie,
      });
      assert.equal(res.status, 403, `Expected reviewer to be denied ${request.path}`);
    }

    const reviewerSettings = await apiRequest(baseUrl, "/api/settings", {
      method: "GET",
      cookie: reviewerCookie,
    });
    assert.equal(reviewerSettings.status, 403, "Expected reviewer to be denied /api/settings");

    const adminLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password },
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookieFromSetCookie(adminLogin.setCookie);
    assert.ok(adminCookie, "Expected admin auth cookie");

    const enroll = await apiRequest(baseUrl, "/api/auth/mfa/enroll", {
      method: "POST",
      body: {},
      cookie: adminCookie,
    });
    assert.equal(enroll.status, 200);
    const enrollBody = enroll.body as { secret?: string; otpauthUrl?: string };
    assert.ok(enrollBody.secret, "Expected MFA enroll secret for admin");
    assert.ok(enrollBody.otpauthUrl?.startsWith("otpauth://"), "Expected otpauth URL for admin");

    const adminSettings = await apiRequest(baseUrl, "/api/settings", {
      method: "GET",
      cookie: adminCookie,
    });
    assert.equal(adminSettings.status, 200, "Expected admin access to /api/settings");
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    }

    if (tracker.membershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, tracker.membershipIds));
    }
    if (tracker.organizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, tracker.organizationIds));
    }
    if (tracker.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, tracker.userIds));
    }
  }
});
