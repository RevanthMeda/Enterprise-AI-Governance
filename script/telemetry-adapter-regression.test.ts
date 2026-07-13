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
  aiTelemetryEvents,
  memberships,
  organizationTelemetryAdapters,
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
    headers?: Record<string, string>;
  },
): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...(opts?.headers ?? {}) };
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

test("telemetry adapter rotates ingest keys and accepts SDK ingestion with gateway controls", async () => {
  const suffix = makeSuffix();
  const tracker = {
    organizationIds: [] as string[],
    membershipIds: [] as string[],
    userIds: [] as string[],
  };

  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `telemetry-org-${suffix}`,
      name: `Telemetry Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `telemetry_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Telemetry Admin ${suffix}`,
      email: `telemetry-admin-${suffix}@example.com`,
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

    ({ server } = await startTestServer());
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const login = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password, organizationSlug: org.slug },
    });
    assert.equal(login.status, 200);
    const cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie);

    const rotate = await apiRequest(baseUrl, "/api/organization/telemetry-adapter/rotate-key", {
      method: "POST",
      cookie,
    });
    assert.equal(rotate.status, 200, "Expected adapter key rotation to succeed");
    const rotateBody = rotate.body as { plainTextKey: string; adapter: { hasActiveKey: boolean } };
    assert.ok(rotateBody.plainTextKey, "Expected one-time plaintext key");
    assert.equal(rotateBody.adapter.hasActiveKey, true, "Expected adapter to report active key");

    const update = await apiRequest(baseUrl, "/api/organization/telemetry-adapter", {
      method: "PATCH",
      cookie,
      body: {
        enabled: true,
        allowedGateways: ["gateway-prod"],
      },
    });
    assert.equal(update.status, 200, "Expected adapter update to succeed");

    const forbidden = await apiRequest(baseUrl, "/api/telemetry/sdk-ingest", {
      method: "POST",
      headers: {
        "x-telemetry-key": rotateBody.plainTextKey,
      },
      body: {
        gateway: "gateway-dev",
        eventType: "drift_alert",
        severity: "warning",
        driftScore: 6,
        summary: "Gateway should be blocked",
      },
    });
    assert.equal(forbidden.status, 403, "Expected disallowed gateway to be rejected");

    const accepted = await apiRequest(baseUrl, "/api/telemetry/sdk-ingest", {
      method: "POST",
      headers: {
        "x-telemetry-key": rotateBody.plainTextKey,
      },
      body: {
        gateway: "gateway-prod",
        eventType: "drift_alert",
        severity: "warning",
        driftScore: 6,
        summary: "Gateway should be accepted",
        metadata: { overrideRate: 41 },
      },
    });
    assert.equal(accepted.status, 201, "Expected allowed gateway ingest to succeed");
    const acceptedBody = accepted.body as { ok: boolean; thresholdBreaches: string[] };
    assert.equal(acceptedBody.ok, true);
    assert.ok(Array.isArray(acceptedBody.thresholdBreaches));

    const [adapterRow] = await db
      .select()
      .from(organizationTelemetryAdapters)
      .where(eq(organizationTelemetryAdapters.organizationId, org.id));
    assert.ok(adapterRow.lastUsedAt, "Expected successful SDK ingest to update last used timestamp");

    const events = await db
      .select()
      .from(aiTelemetryEvents)
      .where(eq(aiTelemetryEvents.organizationId, org.id));
    assert.equal(events.length, 1, "Expected one telemetry event to be stored");
    const metadata = events[0].metadata as Record<string, unknown>;
    assert.equal(metadata.ingestSource, "sdk");
    await db
      .update(aiTelemetryEvents)
      .set({ metadata: { ...metadata, escalatedIncidentId: `incident-${suffix}` } })
      .where(eq(aiTelemetryEvents.id, events[0].id));

    const otherOrg = await storage.createOrganization({
      slug: `telemetry-other-org-${suffix}`,
      name: `Telemetry Other Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(otherOrg.id);
    await db.insert(aiTelemetryEvents).values({
      organizationId: otherOrg.id,
      eventType: "drift_alert",
      severity: "critical",
      summary: "A recent event belonging to a different organization",
      blocked: true,
    });

    const recentSummary = await apiRequest(baseUrl, "/api/telemetry/summary", { cookie });
    assert.equal(recentSummary.status, 200);
    const recentSummaryBody = recentSummary.body as {
      total: number;
      windowDays: number;
      escalatedEvents30d: number;
      escalatedIncidents: number;
    };
    assert.equal(recentSummaryBody.total, 1, "Expected summary to exclude another organization's event");
    assert.equal(recentSummaryBody.windowDays, 30);
    assert.equal(recentSummaryBody.escalatedEvents30d, 1);
    assert.equal(recentSummaryBody.escalatedIncidents, 1);

    await db
      .update(aiTelemetryEvents)
      .set({ detectedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(eq(aiTelemetryEvents.id, events[0].id));

    const agedSummary = await apiRequest(baseUrl, "/api/telemetry/summary", { cookie });
    assert.equal(agedSummary.status, 200);
    const agedSummaryBody = agedSummary.body as {
      total: number;
      escalatedEvents30d: number;
      escalatedIncidents: number;
    };
    assert.equal(agedSummaryBody.total, 0, "Expected telemetry older than 30 days to be excluded");
    assert.equal(agedSummaryBody.escalatedEvents30d, 0);
    assert.equal(agedSummaryBody.escalatedIncidents, 0);
  } finally {
    await server?.close();
    if (tracker.organizationIds.length > 0) {
      await db.delete(aiTelemetryEvents).where(inArray(aiTelemetryEvents.organizationId, tracker.organizationIds));
    }
    await db.delete(organizationTelemetryAdapters).where(eq(organizationTelemetryAdapters.organizationId, tracker.organizationIds[0] ?? ""));
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
