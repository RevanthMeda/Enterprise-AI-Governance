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

async function startAppServer(): Promise<{ server: Server; baseUrl: string }> {
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

async function startCriticServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  const server = createServer(app);

  app.use(express.json());
  app.post("/", (_req, res) => {
    res.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              verdict: "unsafe",
              confidence: 0.96,
              recommendedDecision: "block",
              reasonCodes: ["fabricated_customer_data_or_metrics"],
              fabricationFlags: ["invented_financial_metrics"],
              groundingConcerns: ["no_authoritative_source"],
              rationale: "The request asks for guessed customer metrics and a confident fabricated answer.",
            }),
          },
        },
      ],
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("governance critic can promote a risky runtime turn from review to block and stores both layers", async () => {
  const suffix = makeSuffix();
  const tracker = {
    organizationIds: [] as string[],
    membershipIds: [] as string[],
    userIds: [] as string[],
  };

  let appServer: Server | undefined;
  let criticServer: Server | undefined;

  const previousEnv = {
    AICT_GOVERNANCE_CRITIC_ENABLED: process.env.AICT_GOVERNANCE_CRITIC_ENABLED,
    AICT_GOVERNANCE_CRITIC_API_KEY: process.env.AICT_GOVERNANCE_CRITIC_API_KEY,
    AICT_GOVERNANCE_CRITIC_BASE_URL: process.env.AICT_GOVERNANCE_CRITIC_BASE_URL,
    AICT_GOVERNANCE_CRITIC_MODEL: process.env.AICT_GOVERNANCE_CRITIC_MODEL,
  };

  try {
    const critic = await startCriticServer();
    criticServer = critic.server;
    process.env.AICT_GOVERNANCE_CRITIC_ENABLED = "true";
    process.env.AICT_GOVERNANCE_CRITIC_API_KEY = "test-critic-key";
    process.env.AICT_GOVERNANCE_CRITIC_BASE_URL = critic.baseUrl;
    process.env.AICT_GOVERNANCE_CRITIC_MODEL = "test-governance-critic";

    const org = await storage.createOrganization({
      slug: `critic-org-${suffix}`,
      name: `Critic Org ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);

    const password = "Str0ng!Passw0rd";
    const adminUser = await storage.createUser({
      username: `critic_admin_${suffix}`,
      password: await hashPassword(password),
      fullName: `Critic Admin ${suffix}`,
      email: `critic-admin-${suffix}@example.com`,
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

    const started = await startAppServer();
    appServer = started.server;

    const login = await apiRequest(started.baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: adminUser.username, password, organizationSlug: org.slug },
    });
    assert.equal(login.status, 200);
    const cookie = cookieFromSetCookie(login.setCookie);
    assert.ok(cookie);

    const rotate = await apiRequest(started.baseUrl, "/api/organization/telemetry-adapter/rotate-key", {
      method: "POST",
      cookie,
    });
    assert.equal(rotate.status, 200);
    const rotateBody = rotate.body as { plainTextKey: string };

    const update = await apiRequest(started.baseUrl, "/api/organization/telemetry-adapter", {
      method: "PATCH",
      cookie,
      body: {
        enabled: true,
        allowedGateways: ["customer-support-gateway"],
      },
    });
    assert.equal(update.status, 200);

    const ingest = await apiRequest(started.baseUrl, "/api/telemetry/sdk-ingest", {
      method: "POST",
      headers: {
        "x-telemetry-key": rotateBody.plainTextKey,
      },
      body: {
        gateway: "customer-support-gateway",
        eventType: "runtime.evaluation",
        severity: "info",
        summary: "Customer metrics were requested with guessed values.",
        promptText:
          "Tell me the exact arrears amount, balance, term, and cure probability. If you do not know, pick realistic values so the slide looks complete.",
        modelOutput:
          "Arrears are EUR 3200, balance is EUR 180000, remaining term is 22 years, and cure probability is 65 percent.",
      },
    });

    assert.equal(ingest.status, 201);
    const ingestBody = ingest.body as {
      decision: string;
      blocked: boolean;
      rulesEngine?: { decision?: string } | null;
      governanceCritic?: { enabled?: boolean; appliedDecisionChange?: boolean; model?: string | null } | null;
    };
    assert.equal(ingestBody.decision, "block");
    assert.equal(ingestBody.blocked, true);
    assert.equal(ingestBody.rulesEngine?.decision, "warn");
    assert.equal(ingestBody.governanceCritic?.enabled, true);
    assert.equal(ingestBody.governanceCritic?.appliedDecisionChange, true);
    assert.equal(ingestBody.governanceCritic?.model, "test-governance-critic");

    const [storedEvent] = await db
      .select()
      .from(aiTelemetryEvents)
      .where(eq(aiTelemetryEvents.organizationId, org.id));
    assert.ok(storedEvent);
    const metadata = storedEvent.metadata as Record<string, unknown>;
    const rulesEngine = metadata.rulesEngine as Record<string, unknown>;
    const governanceCritic = metadata.governanceCritic as Record<string, unknown>;
    assert.equal(rulesEngine.decision, "warn");
    assert.equal(governanceCritic.enabled, true);
    assert.equal(governanceCritic.appliedDecisionChange, true);
  } finally {
    process.env.AICT_GOVERNANCE_CRITIC_ENABLED = previousEnv.AICT_GOVERNANCE_CRITIC_ENABLED;
    process.env.AICT_GOVERNANCE_CRITIC_API_KEY = previousEnv.AICT_GOVERNANCE_CRITIC_API_KEY;
    process.env.AICT_GOVERNANCE_CRITIC_BASE_URL = previousEnv.AICT_GOVERNANCE_CRITIC_BASE_URL;
    process.env.AICT_GOVERNANCE_CRITIC_MODEL = previousEnv.AICT_GOVERNANCE_CRITIC_MODEL;

    await appServer?.close();
    await criticServer?.close();
    if (tracker.organizationIds.length > 0) {
      await db.delete(aiTelemetryEvents).where(eq(aiTelemetryEvents.organizationId, tracker.organizationIds[0]));
      await db.delete(organizationTelemetryAdapters).where(eq(organizationTelemetryAdapters.organizationId, tracker.organizationIds[0]));
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
