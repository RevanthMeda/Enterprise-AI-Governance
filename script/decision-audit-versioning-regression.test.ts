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
  aiSystems,
  decisionAudits,
  decisionAuditVersions,
  memberships,
  organizations,
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

test("sealed decision traces create version snapshots on edit", async () => {
  const suffix = makeSuffix();
  const tracker = {
    organizationIds: [] as string[],
    membershipIds: [] as string[],
    userIds: [] as string[],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `decision-version-org-${suffix}`,
      name: `Decision Version Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `decision_version_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Decision Version Admin ${suffix}`,
      email: `decision-version-admin-${suffix}@example.com`,
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

    const system = await storage.createAiSystemForOrg(org.id, {
      name: `Decision Trace System ${suffix}`,
      description: "Regression test system for decision trace versioning.",
      owner: "Decision Audit QA",
      department: "Risk",
      vendor: "Internal",
      modelType: "Rules Engine",
      riskLevel: "high",
      status: "active",
      deploymentContext: "Regression test",
      dataSensitivity: "confidential",
      geography: "EU",
      purpose: "Decision trace regression coverage",
      usersImpacted: 1000,
      legalProfile: "eu",
      lawPackIds: ["global_baseline", "eu_core", "eu_finance"],
    });

    ({ server } = await startTestServer());
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password, organizationSlug: org.slug },
    });
    assert.equal(login.status, 200);
    const cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie);

    const created = await apiRequest(baseUrl, "/api/decision-audits", {
      method: "POST",
      cookie,
      body: {
        title: "Credit decision trace",
        systemId: system.id,
        documentationStatus: "sealed",
        decisionContext: "Approve a financing request.",
        aiOutput: "Approve under standard terms.",
        humanOutput: "Approve with amended pricing.",
        overrideRationale: "Risk profile changed after manual review.",
      },
    });
    assert.equal(created.status, 201);
    const createdBody = created.body as { id: string; currentVersionNumber: number };
    assert.equal(createdBody.currentVersionNumber, 1);

    const [createdAudit] = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.id, createdBody.id));
    assert.ok(createdAudit.retentionUntil instanceof Date);
    const minimumExpectedRetention = new Date(Date.now() + 9 * 365 * 24 * 60 * 60 * 1000);
    assert.ok(
      createdAudit.retentionUntil.getTime() > minimumExpectedRetention.getTime(),
      "expected EU finance law packs to raise retention close to 10 years",
    );
    assert.ok(
      Array.isArray(createdAudit.explainabilityFactors) &&
        createdAudit.explainabilityFactors.includes("law_pack:eu_finance") &&
        createdAudit.explainabilityFactors.includes("minimum_retention_years:10"),
    );
    assert.ok(
      Array.isArray(createdAudit.decisionConstraints) &&
        createdAudit.decisionConstraints.includes("Maintain at least 10 years of reviewable decision evidence."),
    );

    const updated = await apiRequest(baseUrl, `/api/decision-audits/${createdBody.id}`, {
      method: "PATCH",
      cookie,
      body: {
        humanOutput: "Approve with amended pricing and additional guarantees.",
        versionReason: "Manual diligence update after finance committee review.",
      },
    });
    assert.equal(updated.status, 200);
    const updatedBody = updated.body as { currentVersionNumber: number };
    assert.equal(updatedBody.currentVersionNumber, 2);

    const versions = await apiRequest(baseUrl, `/api/decision-audits/${createdBody.id}/versions`, {
      cookie,
    });
    assert.equal(versions.status, 200);
    const versionsBody = versions.body as Array<{ versionNumber: number; reason: string | null }>;
    assert.equal(versionsBody.length, 1);
    assert.equal(versionsBody[0].versionNumber, 1);
    assert.equal(versionsBody[0].reason, "Manual diligence update after finance committee review.");

    const [storedAudit] = await db
      .select()
      .from(decisionAudits)
      .where(eq(decisionAudits.id, createdBody.id));
    assert.equal(storedAudit.currentVersionNumber, 2);
    assert.ok(
      Array.isArray(storedAudit.explainabilityFactors) &&
        storedAudit.explainabilityFactors.includes("law_pack:eu_finance"),
    );

    const [storedVersion] = await db
      .select()
      .from(decisionAuditVersions)
      .where(eq(decisionAuditVersions.decisionAuditId, createdBody.id));
    assert.ok(storedVersion.snapshot);
  } finally {
    if (tracker.organizationIds[0]) {
      await db.delete(decisionAuditVersions).where(eq(decisionAuditVersions.organizationId, tracker.organizationIds[0]));
      await db.delete(decisionAudits).where(eq(decisionAudits.organizationId, tracker.organizationIds[0]));
    }
    await server?.close();
    if (tracker.membershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, tracker.membershipIds));
    }
    if (tracker.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, tracker.userIds));
    }
    if (tracker.organizationIds.length > 0) {
      await db.delete(aiSystems).where(inArray(aiSystems.organizationId, tracker.organizationIds));
      await db.delete(organizations).where(inArray(organizations.id, tracker.organizationIds));
    }
  }
});
