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
import { domainService } from "../server/services/domainService";

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

test("settings source keeps domain verification and paging controls wired", async () => {
  const settingsPath = new URL("../client/src/pages/settings.tsx", import.meta.url);
  const settingsSource = await fs.readFile(settingsPath, "utf8");

  assert.match(settingsSource, /data-testid="tabs-settings-sections"/, "Expected settings tabs wrapper");
  assert.match(settingsSource, /data-testid="panel-org-domain-help"/, "Expected domain verification help panel");
  assert.match(settingsSource, /button-org-domain-copy-\$\{entry\.domain\}/, "Expected domain TXT copy action");
  assert.match(settingsSource, /button-org-domain-verify-\$\{entry\.domain\}/, "Expected domain verify action");
  assert.match(settingsSource, /button-org-domain-primary-\$\{entry\.domain\}/, "Expected primary domain action");
  assert.match(settingsSource, /data-testid="button-auth-sso-start-url-copy"/, "Expected SSO start URL copy action");
  assert.match(settingsSource, /data-testid="input-org-admin-audit-search"/, "Expected admin activity search");
  assert.match(settingsSource, /data-testid="select-org-admin-audit-target-filter"/, "Expected admin activity filter");
  assert.match(settingsSource, /data-testid="button-org-invite-page-next"/, "Expected invite pagination control");
  assert.match(settingsSource, /data-testid="button-org-member-page-next"/, "Expected member pagination control");
});

test("domain verification routes require DNS proof and keep primary/delete flows working", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `domain-verify-${suffix}`,
      name: `Domain Verify ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `domain_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Domain Admin ${suffix}`,
      email: `domain-admin-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(adminUser.id);

    const adminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: org.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(adminMembership.id);

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password },
    });
    assert.equal(login.status, 200);
    const adminCookie = cookieFromSetCookie(login.setCookie);
    assert.ok(adminCookie, "Expected admin auth cookie");

    const createDomains = await apiRequest(baseUrl, "/api/organization/domains", {
      method: "PUT",
      body: { domains: ["verified.example.com", "secondary.example.com"] },
      cookie: adminCookie,
    });
    assert.equal(createDomains.status, 200);
    const createdBody = createDomains.body as {
      entries: Array<{
        id: string;
        domain: string;
        isVerified: boolean;
        isPrimary: boolean;
        verificationRecordName: string;
        verificationRecordValue: string;
      }>;
    };
    assert.equal(createdBody.entries.length, 2);

    const primaryDomain = createdBody.entries.find((entry) => entry.domain === "verified.example.com");
    const secondaryDomain = createdBody.entries.find((entry) => entry.domain === "secondary.example.com");
    assert.ok(primaryDomain);
    assert.ok(secondaryDomain);

    domainService.setTxtResolverForTests(async (hostname) => {
      if (hostname === primaryDomain!.verificationRecordName) {
        return [[primaryDomain!.verificationRecordValue]];
      }
      return [];
    });

    const verifySuccess = await apiRequest(baseUrl, `/api/organization/domains/${primaryDomain!.id}/verify`, {
      method: "POST",
      body: {},
      cookie: adminCookie,
    });
    assert.equal(verifySuccess.status, 200);
    const verifySuccessBody = verifySuccess.body as {
      entries: Array<{ domain: string; isVerified: boolean; verifiedAt: string | null }>;
    };
    const verifiedEntry = verifySuccessBody.entries.find((entry) => entry.domain === primaryDomain!.domain);
    assert.equal(verifiedEntry?.isVerified, true, "Expected verified domain after TXT proof");
    assert.ok(verifiedEntry?.verifiedAt, "Expected verifiedAt timestamp after successful verification");

    const verifyFailure = await apiRequest(baseUrl, `/api/organization/domains/${secondaryDomain!.id}/verify`, {
      method: "POST",
      body: {},
      cookie: adminCookie,
    });
    assert.equal(verifyFailure.status, 409, "Expected verification to fail without TXT proof");

    const promoteSecondary = await apiRequest(baseUrl, `/api/organization/domains/${secondaryDomain!.id}`, {
      method: "PATCH",
      body: { isPrimary: true },
      cookie: adminCookie,
    });
    assert.equal(promoteSecondary.status, 200);
    const promoteBody = promoteSecondary.body as {
      entries: Array<{ domain: string; isPrimary: boolean }>;
    };
    const promotedEntry = promoteBody.entries.find((entry) => entry.domain === secondaryDomain!.domain);
    assert.equal(promotedEntry?.isPrimary, true, "Expected PATCH primary action to succeed");

    const deletePrimary = await apiRequest(baseUrl, `/api/organization/domains/${primaryDomain!.id}`, {
      method: "DELETE",
      cookie: adminCookie,
    });
    assert.equal(deletePrimary.status, 204);

    const listAfterDelete = await apiRequest(baseUrl, "/api/organization/domains", {
      method: "GET",
      cookie: adminCookie,
    });
    assert.equal(listAfterDelete.status, 200);
    const listAfterDeleteBody = listAfterDelete.body as {
      entries: Array<{ domain: string; isPrimary: boolean }>;
    };
    assert.equal(listAfterDeleteBody.entries.length, 1);
    assert.equal(listAfterDeleteBody.entries[0]?.domain, "secondary.example.com");
    assert.equal(listAfterDeleteBody.entries[0]?.isPrimary, true, "Expected remaining domain to become primary");
  } finally {
    domainService.resetTxtResolverForTests();
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
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
