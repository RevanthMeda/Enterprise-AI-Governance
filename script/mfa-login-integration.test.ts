import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { inArray } from "drizzle-orm";
import { setupAuth, generateTotpSecret, hashPassword } from "../server/auth";
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

test("mfa login flow: requires second factor and accepts recovery code", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `mfa-login-${suffix}`,
      name: `MFA Login ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const userPassword = "Str0ng!Passw0rd";
    const user = await storage.createUser({
      username: `mfa_user_${suffix}`,
      password: await hashPassword(userPassword),
      fullName: `MFA User ${suffix}`,
      email: `mfa-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(user.id);

    const membership = await storage.createMembership({
      userId: user.id,
      organizationId: org.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(membership.id);

    const recoveryCode = `RCODE${suffix.replace(/[^a-zA-Z0-9]/g, "").slice(-8)}`.toUpperCase();
    await storage.updateUserMfa(user.id, {
      mfaEnabled: true,
      mfaSecret: generateTotpSecret(),
      mfaRecoveryCodes: [await hashPassword(recoveryCode)],
    });

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const denied = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.username, password: userPassword },
    });
    assert.equal(denied.status, 401);
    assert.equal((denied.body as { mfaRequired?: boolean }).mfaRequired, true);

    const success = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.username, password: userPassword, recoveryCode },
    });
    assert.equal(success.status, 200);
    assert.equal((success.body as { username?: string }).username, user.username);
    assert.ok((success.body as { currentOrganizationId?: string | null }).currentOrganizationId);

    const replay = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: user.username, password: userPassword, recoveryCode },
    });
    assert.equal(replay.status, 401);
    assert.equal((replay.body as { mfaRequired?: boolean }).mfaRequired, true);
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
