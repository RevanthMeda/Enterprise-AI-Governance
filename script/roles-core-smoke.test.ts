import test from "node:test";
import assert from "node:assert/strict";
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

type RoleSpec = {
  role: "admin" | "cro" | "ciso" | "compliance_lead" | "reviewer" | "system_owner" | "auditor";
  membershipRole: string;
};
type RoleName = RoleSpec["role"];

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

test("core API smoke across all role personas", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };

  let server: Server | undefined;

  const roleSpecs: RoleSpec[] = [
    { role: "admin", membershipRole: "owner" },
    { role: "cro", membershipRole: "cro" },
    { role: "ciso", membershipRole: "ciso" },
    { role: "compliance_lead", membershipRole: "compliance_lead" },
    { role: "reviewer", membershipRole: "reviewer" },
    { role: "system_owner", membershipRole: "system_owner" },
    { role: "auditor", membershipRole: "auditor" },
  ];

  const coreEndpoints = [
    "/api/health",
    "/api/auth/user",
    "/api/dashboard/trends",
    "/api/activity-dashboard",
    "/api/ai-systems",
    "/api/risk-assessments",
    "/api/compliance-controls",
    "/api/approval-workflows",
    "/api/system-controls",
    "/api/calendar-events",
    "/api/notifications/digest",
    "/api/notifications/unread-count",
  ] as const;

  const restrictedChecks = [
    {
      path: "/api/audit-logs",
      method: "GET",
      body: undefined,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "auditor"] as RoleName[],
    },
    {
      path: "/api/leads",
      method: "GET",
      body: undefined,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"] as RoleName[],
    },
    {
      path: "/api/auth/mfa/enroll",
      method: "POST",
      body: {},
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as RoleName[],
    },
    {
      path: "/api/settings",
      method: "GET",
      body: undefined,
      allowedRoles: ["admin"] as RoleName[],
    },
  ] as const;

  try {
    const org = await storage.createOrganization({
      slug: `roles-smoke-${suffix}`,
      name: `Roles Smoke ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";

    const createdUsers = [];
    for (const spec of roleSpecs) {
      const user = await storage.createUser({
        username: `smoke_${spec.role}_${suffix}`,
        password: await hashPassword(password),
        fullName: `Smoke ${spec.role} ${suffix}`,
        email: `smoke-${spec.role}-${suffix}@example.com`,
        role: spec.role,
      });
      tracker.userIds.push(user.id);
      createdUsers.push({ user, spec });
    }

    for (const entry of createdUsers) {
      const membership = await storage.createMembership({
        userId: entry.user.id,
        organizationId: org.id,
        role: entry.spec.membershipRole,
        membershipState: "active",
        isDefault: true,
        invitedBy: null,
      });
      tracker.membershipIds.push(membership.id);
    }

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    for (const entry of createdUsers) {
      const login = await apiRequest(baseUrl, "/api/auth/login", {
        method: "POST",
        body: { username: entry.user.username, password },
      });
      assert.equal(login.status, 200, `Expected login success for ${entry.spec.role}`);
      const cookie = cookieFromSetCookie(login.setCookie);
      assert.ok(cookie, `Expected session cookie for ${entry.spec.role}`);

      for (const endpoint of coreEndpoints) {
        const res = await apiRequest(baseUrl, endpoint, { cookie });
        assert.equal(
          res.status,
          200,
          `Expected ${endpoint} to return 200 for role=${entry.spec.role}`,
        );
      }

      for (const restricted of restrictedChecks) {
        const res = await apiRequest(baseUrl, restricted.path, {
          method: restricted.method,
          body: restricted.body,
          cookie,
        });
        if (restricted.allowedRoles.includes(entry.spec.role)) {
          assert.equal(
            res.status,
            200,
            `Expected role=${entry.spec.role} access to ${restricted.path}`,
          );
        } else {
          assert.equal(
            res.status,
            403,
            `Expected non-admin role=${entry.spec.role} to be forbidden for ${restricted.path}`,
          );
        }
      }
    }
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
