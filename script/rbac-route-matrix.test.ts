import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { createServer, type Server } from "http";
import { inArray } from "drizzle-orm";
import { hashPassword, setupAuth } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { getUploadsRoot } from "../server/runtime-paths";
import { decisionAuditService } from "../server/services/decisionAuditService";
import { incidentService } from "../server/services/incidentService";
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

type SeedContext = {
  systemId: string;
  workflowId: string;
  decisionAuditId: string;
  incidentId: string;
  evidenceId: string;
  requesterName: string;
};

type RouteCheck = {
  name: string;
  method: "GET" | "POST" | "PATCH";
  path: (seed: SeedContext) => string;
  allowedRoles: RoleName[];
  allowedStatuses?: number[];
  body?: (seed: SeedContext, role: RoleName) => BodyInit | Record<string, unknown> | undefined;
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
  routePath: string,
  opts?: {
    method?: string;
    body?: BodyInit | Record<string, unknown>;
    cookie?: string;
  },
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  const body = opts?.body;

  if (opts?.cookie) {
    headers.Cookie = opts.cookie;
  }

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const isRawBody =
    isFormData ||
    typeof body === "string" ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof ArrayBuffer;

  if (body !== undefined && !isRawBody) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${baseUrl}${routePath}`, {
    method: opts?.method ?? "GET",
    headers,
    body:
      body === undefined
        ? undefined
        : isRawBody
          ? (body as BodyInit)
          : JSON.stringify(body),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const parsedBody = contentType.includes("application/json") ? await res.json() : await res.text();

  return {
    status: res.status,
    body: parsedBody,
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

function buildEvidenceUploadForm(
  seed: Pick<SeedContext, "systemId" | "workflowId">,
  role: RoleName,
) {
  const form = new FormData();
  form.append("systemId", seed.systemId);
  form.append("workflowId", seed.workflowId);
  form.append(
    "file",
    new Blob([`rbac evidence upload for ${role}`], { type: "text/plain" }),
    `rbac-${role}.txt`,
  );
  return form;
}

test("sensitive governance routes enforce role matrix consistently", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };

  const uploadsRoot = getUploadsRoot();
  let orgUploadDir: string | undefined;
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

  const routeChecks: RouteCheck[] = [
    {
      name: "telemetry policy recommendations",
      method: "GET",
      path: () => "/api/telemetry-policy/recommendations",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
    {
      name: "telemetry policy assist",
      method: "POST",
      path: () => "/api/telemetry-policy/assist",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      allowedStatuses: [200],
      body: () => ({
        intent: "Block PII, notify on warnings, and test stricter rules in shadow mode first.",
      }),
    },
    {
      name: "telemetry policy impact",
      method: "POST",
      path: () => "/api/telemetry-policy/impact",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      allowedStatuses: [200],
      body: () => ({
        patch: {
          enforceBlocking: true,
          blockOnRestrictedPrompt: true,
          restrictedPromptPatterns: ["ignore ai control tower"],
        },
      }),
    },
    {
      name: "analytics overview",
      method: "GET",
      path: () => "/api/analytics/overview",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "governance maturity assessment",
      method: "GET",
      path: () => "/api/governance-maturity",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "governance events feed",
      method: "GET",
      path: () => "/api/governance-events",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "integration connectors list",
      method: "GET",
      path: () => "/api/integrations/connectors",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
    {
      name: "integration connectors update",
      method: "PUT",
      path: () => "/api/integrations/connectors",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      body: () => [
        {
          id: "rbac-connector",
          label: "RBAC connector",
          type: "generic_webhook",
          enabled: true,
          webhookUrl: "https://example.org/webhook",
          authToken: null,
          eventFilters: ["incident"],
          severityFloor: "warning",
        },
      ],
    },
    {
      name: "integration connectors test",
      method: "POST",
      path: () => "/api/integrations/connectors/test",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      allowedStatuses: [200],
      body: () => ({ connectorId: null }),
    },
    {
      name: "governance automation summary",
      method: "GET",
      path: () => "/api/governance-automation/summary",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
    {
      name: "governance events test",
      method: "POST",
      path: () => "/api/governance-events/test",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      allowedStatuses: [200],
      body: () => ({}),
    },
    {
      name: "governance automation run",
      method: "POST",
      path: () => "/api/governance-automation/run",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      allowedStatuses: [200],
      body: () => ({}),
    },
    {
      name: "threat intelligence config",
      method: "GET",
      path: () => "/api/threat-intelligence/config",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
    {
      name: "threat intelligence summary",
      method: "GET",
      path: () => "/api/threat-intelligence/summary",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "regional governance profile",
      method: "GET",
      path: () => "/api/organization/regional-governance-profile",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
    {
      name: "regional governance profile update",
      method: "PUT",
      path: () => "/api/organization/regional-governance-profile",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      body: () => ({
        primaryRegion: "eu",
        secondaryRegions: ["uk", "us"],
        dataResidencyMode: "regional_ring",
        activeFrameworks: ["eu_ai_act", "nist_ai_rmf", "iso_42001"],
      }),
    },
    {
      name: "incident resolution suggestion",
      method: "GET",
      path: (seed) => `/api/incidents/${seed.incidentId}/resolution-suggestion`,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "approval workflows list",
      method: "GET",
      path: () => "/api/approval-workflows",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "approval workflow create",
      method: "POST",
      path: () => "/api/approval-workflows",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"],
      body: (seed, role) => ({
        systemId: seed.systemId,
        title: `RBAC workflow ${role} ${suffix}`,
        description: "Route-by-route RBAC regression coverage.",
        requestedBy: seed.requesterName,
        priority: "medium",
        usesPii: true,
        customerFacing: true,
        legalProfile: "eu",
        lawPackIds: ["global_baseline", "eu_core", "eu_finance"],
      }),
    },
    {
      name: "approval workflow update",
      method: "PATCH",
      path: (seed) => `/api/approval-workflows/${seed.workflowId}`,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"],
      body: (_seed, role) => ({
        decisionNotes: `RBAC patch by ${role}`,
      }),
    },
    {
      name: "decision audits list",
      method: "GET",
      path: () => "/api/decision-audits",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "decision audits summary",
      method: "GET",
      path: () => "/api/decision-audits/summary",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "decision audit versions",
      method: "GET",
      path: (seed) => `/api/decision-audits/${seed.decisionAuditId}/versions`,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "decision audit create",
      method: "POST",
      path: () => "/api/decision-audits",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"],
      body: (seed, role) => ({
        systemId: seed.systemId,
        workflowId: seed.workflowId,
        title: `RBAC decision ${role} ${suffix}`,
        decisionContext: "Regression test decision context.",
        aiOutput: "Regression test model output.",
        createdBy: `RBAC ${role}`,
      }),
    },
    {
      name: "incidents list",
      method: "GET",
      path: () => "/api/incidents",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "incidents summary",
      method: "GET",
      path: () => "/api/incidents/summary",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "analytics report builder",
      method: "GET",
      path: () => "/api/analytics/report-builder",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "analytics report builder update",
      method: "PUT",
      path: () => "/api/analytics/report-builder",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      body: () => ({
        defaultPlanId: "executive-snapshot",
        plans: [
          {
            id: "executive-snapshot",
            name: "Executive snapshot",
            description: "RBAC test plan",
            presetId: "executive_snapshot",
            format: "pdf",
            cadence: "monthly",
            sections: ["summary", "highlights"],
          },
        ],
      }),
    },
    {
      name: "analytics report builder run",
      method: "POST",
      path: () => "/api/analytics/report-builder/executive-snapshot/run",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
      allowedStatuses: [200],
      body: () => ({}),
    },
    {
      name: "notifications digest",
      method: "GET",
      path: () => "/api/notifications/digest",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"],
    },
    {
      name: "governance automation config",
      method: "GET",
      path: () => "/api/governance-automation/config",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
    {
      name: "governance automation config update",
      method: "PUT",
      path: () => "/api/governance-automation/config",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
      body: () => ({
        runMode: "assistive",
        rules: [
          {
            key: "incident-owner-notify",
            enabled: true,
            minSeverity: "high",
            staleDays: 0,
            description: "Notify incident owner",
          },
          {
            key: "incident-sla-escalation",
            enabled: true,
            minSeverity: "high",
            staleDays: 0,
            description: "Escalate breached incidents",
          },
          {
            key: "workflow-reviewer-reminder",
            enabled: true,
            minSeverity: "medium",
            staleDays: 3,
            description: "Remind workflow reviewers",
          },
        ],
      }),
    },
    {
      name: "incident create",
      method: "POST",
      path: () => "/api/incidents",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"],
      body: (seed, role) => ({
        systemId: seed.systemId,
        workflowId: seed.workflowId,
        title: `RBAC incident ${role} ${suffix}`,
        category: "privacy",
        severity: "medium",
        description: "Regression incident creation coverage.",
      }),
    },
    {
      name: "incident update",
      method: "PATCH",
      path: (seed) => `/api/incidents/${seed.incidentId}`,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"],
      body: (_seed, role) => ({
        owner: `RBAC ${role}`,
      }),
    },
    {
      name: "evidence list",
      method: "GET",
      path: () => "/api/evidence",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "system_owner", "auditor"],
    },
    {
      name: "evidence create",
      method: "POST",
      path: () => "/api/evidence",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "system_owner"],
      body: (seed, role) => buildEvidenceUploadForm(seed, role),
    },
    {
      name: "evidence download",
      method: "GET",
      path: (seed) => `/api/evidence/${seed.evidenceId}/download`,
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "system_owner", "auditor"],
    },
    {
      name: "audit logs list",
      method: "GET",
      path: () => "/api/audit-logs",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "auditor"],
    },
    {
      name: "audit chain verification",
      method: "GET",
      path: () => "/api/audit-logs/verify-chain",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead", "auditor"],
      allowedStatuses: [200, 409],
    },
    {
      name: "telemetry summary",
      method: "GET",
      path: () => "/api/telemetry/summary",
      allowedRoles: ["admin", "cro", "ciso", "compliance_lead"],
    },
  ];

  try {
    const org = await storage.createOrganization({
      slug: `rbac-matrix-${suffix}`,
      name: `RBAC Matrix ${suffix}`,
      status: "active",
      plan: "starter",
      settings: {},
    });
    tracker.organizationIds.push(org.id);
    orgUploadDir = path.join(uploadsRoot, org.id);

    const password = "Str0ng!Passw0rd";
    const createdUsers: Array<{ user: Awaited<ReturnType<typeof storage.createUser>>; spec: RoleSpec }> = [];

    for (const spec of roleSpecs) {
      const user = await storage.createUser({
        username: `rbac_${spec.role}_${suffix}`,
        password: await hashPassword(password),
        fullName: `RBAC ${spec.role} ${suffix}`,
        email: `rbac-${spec.role}-${suffix}@example.com`,
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

    const cookies = new Map<RoleName, string>();
    for (const entry of createdUsers) {
      const login = await apiRequest(baseUrl, "/api/auth/login", {
        method: "POST",
        body: { username: entry.user.username, password },
      });
      assert.equal(login.status, 200, `Expected login success for ${entry.spec.role}`);
      const cookie = cookieFromSetCookie(login.setCookie);
      assert.ok(cookie, `Expected session cookie for ${entry.spec.role}`);
      cookies.set(entry.spec.role, cookie);
    }

    const adminUser = createdUsers.find((entry) => entry.spec.role === "admin")!.user;
    const reviewerUser = createdUsers.find((entry) => entry.spec.role === "reviewer")!.user;

    const system = await storage.createAiSystemForOrg(org.id, {
      name: `RBAC Coverage System ${suffix}`,
      description: "System used for route-matrix regression tests.",
      owner: adminUser.fullName,
      department: "Governance QA",
      vendor: "OpenAI",
      modelType: "gpt-4.1-mini",
      riskLevel: "medium",
      status: "under_review",
      deploymentContext: "Regression test",
      dataSensitivity: "restricted",
      geography: "EU",
      purpose: "RBAC route validation",
      usersImpacted: 25,
      legalProfile: "eu",
      lawPackIds: ["global_baseline", "eu_core", "eu_finance"],
      lastAssessment: new Date(),
      organizationId: org.id,
    });

    const workflow = await storage.createApprovalWorkflowForOrg(org.id, {
      systemId: system.id,
      title: `RBAC Seed Workflow ${suffix}`,
      description: "Workflow seed for RBAC route assertions.",
      requestedBy: adminUser.fullName,
      reviewer: reviewerUser.fullName,
      priority: "high",
      estimatedFinancialImpact: 50000,
      usesPii: true,
      customerFacing: true,
      reversible: true,
      strategicImpact: false,
      safetyCritical: true,
      legalProfile: "eu",
      lawPackIds: ["global_baseline", "eu_core", "eu_finance"],
      requiredApprovers: ["operations_committee", "compliance_lead"],
      organizationId: org.id,
    });

    const decisionAudit = await decisionAuditService.createForOrg(org.id, {
      systemId: system.id,
      workflowId: workflow.id,
      title: `RBAC Seed Decision ${suffix}`,
      businessObjective: "Validate route protections.",
      decisionContext: "RBAC regression decision context.",
      aiOutput: "RBAC regression AI output.",
      createdBy: adminUser.fullName,
      legalProfile: "eu",
      lawPackIds: ["global_baseline", "eu_core", "eu_finance"],
    });

    const incident = await incidentService.createForOrg(org.id, {
      systemId: system.id,
      workflowId: workflow.id,
      title: `RBAC Seed Incident ${suffix}`,
      category: "privacy",
      severity: "high",
      status: "open",
      description: "Seed incident for RBAC route assertions.",
      playbook: {},
      rootCause: null,
      postIncidentReview: {},
      affectedDecisionTraceIds: [decisionAudit.id],
      regulatoryNotifications: [],
      owner: null,
      escalatedTo: null,
    });

    const adminCookie = cookies.get("admin");
    assert.ok(adminCookie, "Expected admin cookie for seeded evidence upload");
    const evidenceUpload = await apiRequest(baseUrl, "/api/evidence", {
      method: "POST",
      body: buildEvidenceUploadForm(
        {
          systemId: system.id,
          workflowId: workflow.id,
        },
        "admin",
      ),
      cookie: adminCookie,
    });
    assert.equal(evidenceUpload.status, 201, "Expected seeded evidence upload to succeed");
    const evidence = evidenceUpload.body as { id: string };

    await storage.createAuditLogForOrg(org.id, {
      entityType: "ai_system",
      entityId: system.id,
      action: "updated",
      performedBy: adminUser.fullName,
      details: "RBAC route matrix seed log",
    });

    const seed: SeedContext = {
      systemId: system.id,
      workflowId: workflow.id,
      decisionAuditId: decisionAudit.id,
      incidentId: incident.id,
      evidenceId: evidence.id,
      requesterName: adminUser.fullName,
    };

    for (const spec of roleSpecs) {
      const cookie = cookies.get(spec.role);
      assert.ok(cookie, `Missing cookie for ${spec.role}`);

      for (const routeCheck of routeChecks) {
        const expectedStatus = routeCheck.allowedRoles.includes(spec.role) ? 200 : 403;
        const isCreate = routeCheck.method === "POST" && routeCheck.name !== "evidence create";
        const successStatus = routeCheck.name === "evidence create" || isCreate ? 201 : 200;
        const response = await apiRequest(baseUrl, routeCheck.path(seed), {
          method: routeCheck.method,
          body: routeCheck.body?.(seed, spec.role),
          cookie,
        });

        if (routeCheck.allowedRoles.includes(spec.role)) {
          const allowedStatuses = routeCheck.allowedStatuses ?? [successStatus];
          assert.ok(
            allowedStatuses.includes(response.status),
            `${routeCheck.name} returned ${response.status} for ${spec.role}`,
          );
        } else {
          assert.equal(
            response.status,
            expectedStatus,
            `${routeCheck.name} returned ${response.status} for ${spec.role}`,
          );
        }
      }
    }
  } finally {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    if (orgUploadDir) {
      fs.rmSync(orgUploadDir, { recursive: true, force: true });
    }
    if (tracker.organizationIds.length > 0) {
      await db.delete(organizations).where(inArray(organizations.id, tracker.organizationIds));
    }
    if (tracker.membershipIds.length > 0) {
      await db.delete(memberships).where(inArray(memberships.id, tracker.membershipIds));
    }
    if (tracker.userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, tracker.userIds));
    }
  }
});
