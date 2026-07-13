import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { and, eq, inArray } from "drizzle-orm";
import { setupAuth, hashPassword } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import {
  organizations,
  memberships,
  users,
  aiSystems,
  notifications,
  evidenceFiles,
} from "../shared/schema";
import { exportService } from "../server/services/exportService";

type ApiResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
};

type Tracker = {
  organizationIds: string[];
  userIds: string[];
  membershipIds: string[];
  systemIds: string[];
  notificationIds: string[];
  evidenceIds: string[];
  exportIds: string[];
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

test("tenant route integration: org switch, session cookie, denial matrix", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    userIds: [],
    membershipIds: [],
    systemIds: [],
    notificationIds: [],
    evidenceIds: [],
    exportIds: [],
  };

  let server: Server | undefined;
  let orgAId = "";

  try {
    const orgA = await storage.createOrganization({
      slug: `route-tenant-a-${suffix}`,
      name: `Route Tenant A ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    const orgB = await storage.createOrganization({
      slug: `route-tenant-b-${suffix}`,
      name: `Route Tenant B ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(orgA.id, orgB.id);
    orgAId = orgA.id;

    const multiUser = await storage.createUser({
      username: `route_multi_${suffix}`,
      password: await hashPassword("test-password"),
      fullName: `Route Multi ${suffix}`,
      email: `route-multi-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(multiUser.id);
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.id, multiUser.id));

    const singleOrgUser = await storage.createUser({
      username: `route_single_${suffix}`,
      password: await hashPassword("test-password"),
      fullName: `Route Single ${suffix}`,
      email: `route-single-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(singleOrgUser.id);

    const m1 = await storage.createMembership({
      userId: multiUser.id,
      organizationId: orgA.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    const m2 = await storage.createMembership({
      userId: multiUser.id,
      organizationId: orgB.id,
      role: "owner",
      membershipState: "active",
      isDefault: false,
      invitedBy: null,
    });
    const m3 = await storage.createMembership({
      userId: singleOrgUser.id,
      organizationId: orgA.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: multiUser.id,
    });
    tracker.membershipIds.push(m1.id, m2.id, m3.id);

    const systemA = await storage.createAiSystemForOrg(orgA.id, {
      name: `Route System A ${suffix}`,
      owner: multiUser.fullName,
      status: "active",
      riskLevel: "limited",
      description: "route integration system",
    });
    tracker.systemIds.push(systemA.id);

    const notificationA = await storage.createNotificationForOrg(orgA.id, {
      userId: multiUser.id,
      title: `Route Notification ${suffix}`,
      message: "Route-level isolation notification",
      type: "system_modified",
      entityType: "ai_system",
      entityId: systemA.id,
      read: false,
    });
    tracker.notificationIds.push(notificationA.id);

    const evidenceA = await storage.createEvidenceFileForOrg(orgA.id, {
      systemId: systemA.id,
      controlId: null,
      workflowId: null,
      fileName: `route-evidence-${suffix}.txt`,
      fileSize: 10,
      mimeType: "text/plain",
      filePath: `${orgA.id}/route-evidence-${suffix}.txt`,
      uploadedBy: multiUser.fullName,
    });
    tracker.evidenceIds.push(evidenceA.id);

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const loginMulti = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: multiUser.username, password: "test-password" },
    });
    assert.equal(loginMulti.status, 200);
    let cookie = cookieFromSetCookie(loginMulti.setCookie);
    assert.ok(cookie);
    const loginMultiBody = loginMulti.body as { currentOrganizationId: string };
    assert.equal(loginMultiBody.currentOrganizationId, orgA.id);

    const userInOrgA = await apiRequest(baseUrl, "/api/auth/user", { cookie });
    assert.equal(userInOrgA.status, 200);
    assert.equal((userInOrgA.body as { currentOrganizationId: string }).currentOrganizationId, orgA.id);

    const createdExport = await apiRequest(baseUrl, "/api/exports", {
      method: "POST",
      body: { type: "ai_systems" },
      cookie,
    });
    assert.equal(createdExport.status, 201);
    const exportId = (createdExport.body as { exportId: string }).exportId;
    tracker.exportIds.push(exportId);

    const switchToOrgB = await apiRequest(baseUrl, "/api/auth/switch-organization", {
      method: "POST",
      body: { organizationId: orgB.id },
      cookie,
    });
    assert.equal(switchToOrgB.status, 200);
    cookie = cookieFromSetCookie(switchToOrgB.setCookie) ?? cookie;

    const userInOrgB = await apiRequest(baseUrl, "/api/auth/user", { cookie });
    assert.equal(userInOrgB.status, 200);
    assert.equal((userInOrgB.body as { currentOrganizationId: string }).currentOrganizationId, orgB.id);

    const denialMatrix = [
      { path: `/api/ai-systems/${systemA.id}`, method: "GET", body: undefined },
      { path: `/api/notifications/${notificationA.id}/read`, method: "PATCH", body: {} },
      { path: `/api/evidence/${evidenceA.id}/download`, method: "GET", body: undefined },
      { path: `/api/exports/${exportId}/download`, method: "GET", body: undefined },
    ] as const;

    for (const item of denialMatrix) {
      const denial = await apiRequest(baseUrl, item.path, {
        method: item.method,
        body: item.body,
        cookie,
      });
      assert.equal(
        denial.status,
        404,
        `Expected 404 for ${item.method} ${item.path} in foreign organization context`,
      );
    }

    const invalidSwitch = await apiRequest(baseUrl, "/api/auth/switch-organization", {
      method: "POST",
      body: { organizationId: "not-a-member-org" },
      cookie,
    });
    assert.equal(invalidSwitch.status, 403);

    const switchBackOrgA = await apiRequest(baseUrl, "/api/auth/switch-organization", {
      method: "POST",
      body: { organizationId: orgA.id },
      cookie,
    });
    assert.equal(switchBackOrgA.status, 200);
    cookie = cookieFromSetCookie(switchBackOrgA.setCookie) ?? cookie;

    const systemAllowed = await apiRequest(baseUrl, `/api/ai-systems/${systemA.id}`, {
      method: "GET",
      cookie,
    });
    assert.equal(systemAllowed.status, 200);
    assert.equal((systemAllowed.body as { id: string }).id, systemA.id);

    const loginSingle = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: singleOrgUser.username, password: "test-password" },
    });
    assert.equal(loginSingle.status, 200);
    let singleCookie = cookieFromSetCookie(loginSingle.setCookie);
    assert.ok(singleCookie);

    await db
      .delete(memberships)
      .where(and(eq(memberships.userId, singleOrgUser.id), eq(memberships.organizationId, orgA.id)));

    const staleSessionRequest = await apiRequest(baseUrl, "/api/ai-systems", {
      method: "GET",
      cookie: singleCookie,
    });
    assert.equal(staleSessionRequest.status, 403);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
    }

    for (const exportId of tracker.exportIds) {
      if (!orgAId) continue;
      const record = await exportService.getExportForDownload({ organizationId: orgAId, exportId });
      if (record) {
        try {
          await fs.unlink(record.filePath);
        } catch {
          // ignore cleanup failure for export file
        }
      }
    }

    if (tracker.evidenceIds.length > 0) {
      await db.delete(evidenceFiles).where(inArray(evidenceFiles.id, tracker.evidenceIds));
    }
    if (tracker.notificationIds.length > 0) {
      await db.delete(notifications).where(inArray(notifications.id, tracker.notificationIds));
    }
    if (tracker.systemIds.length > 0) {
      await db.delete(aiSystems).where(inArray(aiSystems.id, tracker.systemIds));
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
