import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { and, eq, inArray } from "drizzle-orm";
import { hashPassword, setupAuth } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { backgroundJobs, memberships, organizations, users } from "../shared/schema";

type ApiResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
};

type Tracker = {
  organizationIds: string[];
  membershipIds: string[];
  userIds: string[];
  jobIds: string[];
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

test("background job readiness and admin retry flow stay wired", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
    jobIds: [],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `jobs-org-${suffix}`,
      name: `Jobs Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `jobs_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Jobs Admin ${suffix}`,
      email: `jobs-admin-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(adminUser.id);

    const adminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: org.id,
      role: "admin",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(adminMembership.id);

    const [failedJob] = await db
      .insert(backgroundJobs)
      .values({
        type: "invite_delivery",
        status: "failed",
        organizationId: org.id,
        createdBy: adminUser.id,
        payload: { email: `user-${suffix}@example.com` },
        result: {},
        attempts: 3,
        maxAttempts: 3,
        runAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: "SMTP timeout",
        updatedAt: new Date(),
      })
      .returning();
    tracker.jobIds.push(failedJob.id);

    server = (await startTestServer()).server;
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password, organizationSlug: org.slug },
    });
    assert.equal(login.status, 200, "Expected admin login to succeed");
    const cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie, "Expected authenticated cookie");

    const ready = await apiRequest(baseUrl, "/api/ready");
    assert.equal(ready.status, 200, "Expected readiness endpoint to succeed");
    const readyBody = ready.body as { queue?: { failed?: number; workerEnabled?: boolean } };
    assert.equal(readyBody.queue?.workerEnabled, true, "Expected queue worker to be enabled");
    assert.equal(readyBody.queue?.failed, 1, "Expected readiness payload to include failed queue count");

    const list = await apiRequest(baseUrl, "/api/organization/background-jobs", { cookie });
    assert.equal(list.status, 200, "Expected admin to list background jobs");
    const listBody = list.body as {
      summary: { failed: number };
      jobs: Array<{ id: string; status: string; lastError: string | null }>;
    };
    assert.equal(listBody.summary.failed, 1, "Expected failed job summary count");
    assert.equal(listBody.jobs[0]?.id, failedJob.id, "Expected failed job to be returned");
    assert.equal(listBody.jobs[0]?.status, "failed", "Expected failed job status");
    assert.equal(listBody.jobs[0]?.lastError, "SMTP timeout", "Expected last error to round-trip");

    const retried = await apiRequest(baseUrl, `/api/organization/background-jobs/${failedJob.id}/retry`, {
      method: "POST",
      cookie,
    });
    assert.equal(retried.status, 200, "Expected retry endpoint to succeed");

    const [updatedJob] = await db
      .select()
      .from(backgroundJobs)
      .where(eq(backgroundJobs.id, failedJob.id));
    assert.equal(updatedJob.status, "pending", "Expected job to move back to pending");
    assert.equal(updatedJob.attempts, 0, "Expected attempts to be reset on retry");
    assert.equal(updatedJob.lastError, null, "Expected last error to be cleared on retry");
  } finally {
    await server?.close();
    if (tracker.jobIds.length > 0) {
      await db.delete(backgroundJobs).where(inArray(backgroundJobs.id, tracker.jobIds));
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
