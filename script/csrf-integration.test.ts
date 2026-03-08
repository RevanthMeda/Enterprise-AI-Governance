import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { inArray } from "drizzle-orm";
import { setupAuth, hashPassword } from "../server/auth";
import { createCsrfMiddleware } from "../server/security";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { memberships, organizations, users } from "../shared/schema";

type ApiResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
  csrfToken?: string;
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
  app.use(createCsrfMiddleware({ enforced: true }));
  await registerRoutes(server, app);

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function apiRequest(
  baseUrl: string,
  path: string,
  opts?: {
    method?: string;
    body?: unknown;
    cookie?: string;
    csrfToken?: string;
    includeCsrf?: boolean;
  },
): Promise<ApiResponse> {
  const method = (opts?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (opts?.cookie) {
    headers.Cookie = opts.cookie;
  }
  if (opts?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (
    opts?.includeCsrf !== false &&
    !["GET", "HEAD", "OPTIONS"].includes(method) &&
    opts?.csrfToken
  ) {
    headers["X-CSRF-Token"] = opts.csrfToken;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json") ? await res.json() : await res.text();

  return {
    status: res.status,
    body,
    setCookie: res.headers.get("set-cookie") ?? undefined,
    csrfToken: res.headers.get("x-csrf-token") ?? undefined,
  };
}

test("csrf enforcement: denies missing token and allows valid token", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };

  let server: Server | undefined;

  try {
    const orgA = await storage.createOrganization({
      slug: `csrf-a-${suffix}`,
      name: `CSRF A ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    const orgB = await storage.createOrganization({
      slug: `csrf-b-${suffix}`,
      name: `CSRF B ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(orgA.id, orgB.id);

    const user = await storage.createUser({
      username: `csrf_user_${suffix}`,
      password: await hashPassword("test-password"),
      fullName: `CSRF User ${suffix}`,
      email: `csrf-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(user.id);

    const m1 = await storage.createMembership({
      userId: user.id,
      organizationId: orgA.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    const m2 = await storage.createMembership({
      userId: user.id,
      organizationId: orgB.id,
      role: "owner",
      membershipState: "active",
      isDefault: false,
      invitedBy: null,
    });
    tracker.membershipIds.push(m1.id, m2.id);

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.username, password: "test-password" },
    });
    assert.equal(login.status, 200);

    let cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie);
    let csrfToken = login.csrfToken;
    assert.ok(csrfToken);

    const switchDenied = await apiRequest(baseUrl, "/api/auth/switch-organization", {
      method: "POST",
      body: { organizationId: orgB.id },
      cookie,
      csrfToken,
      includeCsrf: false,
    });
    assert.equal(switchDenied.status, 403);

    const switchAllowed = await apiRequest(baseUrl, "/api/auth/switch-organization", {
      method: "POST",
      body: { organizationId: orgB.id },
      cookie,
      csrfToken,
      includeCsrf: true,
    });
    assert.equal(switchAllowed.status, 200);
    cookie = cookieFromSetCookie(switchAllowed.setCookie) ?? cookie;
    csrfToken = switchAllowed.csrfToken ?? csrfToken;

    const exportDenied = await apiRequest(baseUrl, "/api/exports", {
      method: "POST",
      body: { type: "ai_systems" },
      cookie,
      csrfToken,
      includeCsrf: false,
    });
    assert.equal(exportDenied.status, 403);

    const exportAllowed = await apiRequest(baseUrl, "/api/exports", {
      method: "POST",
      body: { type: "ai_systems" },
      cookie,
      csrfToken,
      includeCsrf: true,
    });
    assert.equal(exportAllowed.status, 201);
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
