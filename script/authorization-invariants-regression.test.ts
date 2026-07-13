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
  return firstCookie.split(";")[0] || undefined;
}

async function apiRequest(
  baseUrl: string,
  path: string,
  opts?: { method?: string; body?: unknown; cookie?: string },
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (opts?.cookie) headers.Cookie = opts.cookie;
  if (opts?.body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(`${baseUrl}${path}`, {
    method: opts?.method ?? "GET",
    headers,
    body: opts?.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const contentType = response.headers.get("content-type") ?? "";
  return {
    status: response.status,
    body: contentType.includes("application/json") ? await response.json() : await response.text(),
    setCookie: response.headers.get("set-cookie") ?? undefined,
  };
}

async function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  const server = createServer(app);
  app.use(express.json());
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

test("owner invitations and last-owner membership changes preserve organization ownership", async () => {
  const suffix = makeSuffix();
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  let server: Server | undefined;

  try {
    const organization = await storage.createOrganization({
      slug: `owner-invariants-${suffix}`,
      name: `Owner Invariants ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    organizationIds.push(organization.id);
    const password = "Str0ng!Passw0rd";
    const owner = await storage.createUser({
      username: `owner_invariant_${suffix}`,
      password: await hashPassword(password),
      fullName: `Owner Invariant ${suffix}`,
      email: `owner-invariant-${suffix}@example.com`,
      role: "admin",
    });
    const administrator = await storage.createUser({
      username: `admin_invariant_${suffix}`,
      password: await hashPassword(password),
      fullName: `Admin Invariant ${suffix}`,
      email: `admin-invariant-${suffix}@example.com`,
      role: "admin",
    });
    userIds.push(owner.id, administrator.id);
    const ownerMembership = await storage.createMembership({
      userId: owner.id,
      organizationId: organization.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    await storage.createMembership({
      userId: administrator.id,
      organizationId: organization.id,
      role: "admin",
      membershipState: "active",
      isDefault: true,
      invitedBy: owner.id,
    });

    ({ server } = await startTestServer());
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const adminLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: administrator.username, password, organizationSlug: organization.slug },
    });
    assert.equal(adminLogin.status, 200);
    const adminCookie = cookieFromSetCookie(adminLogin.setCookie);
    assert.ok(adminCookie);
    const adminOwnerInvite = await apiRequest(baseUrl, "/api/organization/invites", {
      method: "POST",
      cookie: adminCookie,
      body: {
        email: `admin-owner-invite-${suffix}@example.com`,
        role: "owner",
        expiresInDays: 7,
      },
    });
    assert.equal(adminOwnerInvite.status, 403);

    const ownerLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: owner.username, password, organizationSlug: organization.slug },
    });
    assert.equal(ownerLogin.status, 200);
    const ownerCookie = cookieFromSetCookie(ownerLogin.setCookie);
    assert.ok(ownerCookie);
    const ownerInvite = await apiRequest(baseUrl, "/api/organization/invites", {
      method: "POST",
      cookie: ownerCookie,
      body: {
        email: `owner-invite-${suffix}@example.com`,
        role: "owner",
        expiresInDays: 7,
      },
    });
    assert.equal(ownerInvite.status, 201);
    const ownerInviteId = (ownerInvite.body as { id?: string }).id;
    assert.ok(ownerInviteId);
    const adminResendOwnerInvite = await apiRequest(
      baseUrl,
      `/api/organization/invites/${ownerInviteId}/resend`,
      {
        method: "POST",
        cookie: adminCookie,
      },
    );
    assert.equal(adminResendOwnerInvite.status, 403);

    const demoteLastOwner = await apiRequest(
      baseUrl,
      `/api/organization/members/${ownerMembership.id}`,
      {
        method: "PATCH",
        cookie: ownerCookie,
        body: { role: "admin" },
      },
    );
    assert.equal(demoteLastOwner.status, 409);

    const secondOwner = await storage.createUser({
      username: `second_owner_invariant_${suffix}`,
      password: await hashPassword(password),
      fullName: `Second Owner Invariant ${suffix}`,
      email: `second-owner-invariant-${suffix}@example.com`,
      role: "admin",
    });
    userIds.push(secondOwner.id);
    const secondOwnerMembership = await storage.createMembership({
      userId: secondOwner.id,
      organizationId: organization.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: owner.id,
    });

    const demoteWithBackupOwner = await apiRequest(
      baseUrl,
      `/api/organization/members/${ownerMembership.id}`,
      {
        method: "PATCH",
        cookie: ownerCookie,
        body: { role: "admin" },
      },
    );
    assert.equal(demoteWithBackupOwner.status, 200);

    const secondOwnerLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: secondOwner.username, password, organizationSlug: organization.slug },
    });
    assert.equal(secondOwnerLogin.status, 200);
    const secondOwnerCookie = cookieFromSetCookie(secondOwnerLogin.setCookie);
    assert.ok(secondOwnerCookie);
    const removeNewLastOwner = await apiRequest(
      baseUrl,
      `/api/organization/members/${secondOwnerMembership.id}`,
      {
        method: "PATCH",
        cookie: secondOwnerCookie,
        body: { role: "admin" },
      },
    );
    assert.equal(removeNewLastOwner.status, 409);

    const activeOwners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, organization.id),
          eq(memberships.role, "owner"),
          eq(memberships.membershipState, "active"),
        ),
      );
    assert.equal(activeOwners.length, 1);
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (organizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, organizationIds));
    }
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
  }
});
