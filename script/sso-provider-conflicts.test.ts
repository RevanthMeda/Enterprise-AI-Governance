import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { setupAuth, hashPassword } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { adminAuditEvents, memberships, organizations, users } from "../shared/schema";

type ApiResponse = {
  status: number;
  body: unknown;
  setCookie?: string;
  location?: string | null;
  contentType?: string | null;
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

function buildSamlResponseBase64(input: { nameId: string; email: string; fullName: string; audience: string }): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp" Version="2.0" IssueInstant="2026-03-07T23:40:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <saml:Assertion ID="_assert" IssueInstant="2026-03-07T23:40:00Z" Version="2.0">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID>${input.nameId}</saml:NameID>
    </saml:Subject>
    <saml:Conditions NotBefore="2026-03-07T23:35:00Z" NotOnOrAfter="2026-03-08T00:35:00Z">
      <saml:AudienceRestriction>
        <saml:Audience>${input.audience}</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AttributeStatement>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress">
        <saml:AttributeValue>${input.email}</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name">
        <saml:AttributeValue>${input.fullName}</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>`;
  return Buffer.from(xml, "utf8").toString("base64");
}

async function apiRequest(
  baseUrl: string,
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    cookie?: string;
    redirect?: RequestRedirect;
  },
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (options?.cookie) headers.Cookie = options.cookie;
  if (options?.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${baseUrl}${path}`, {
    method: options?.method ?? "GET",
    headers,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: options?.redirect ?? "follow",
  });

  const contentType = res.headers.get("content-type");
  const body = contentType?.includes("application/json") ? await res.json() : await res.text();
  return {
    status: res.status,
    body,
    setCookie: res.headers.get("set-cookie") ?? undefined,
    location: res.headers.get("location"),
    contentType,
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

test("sso provider identity conflicts fail closed and are audited", async () => {
  const tracker: Tracker = { organizationIds: [], membershipIds: [], userIds: [] };
  const suffix = makeSuffix();
  const { server, baseUrl } = await startTestServer();

  try {
    const adminUser = await storage.createUser({
      username: `sso-conflict-admin-${suffix}`,
      password: await hashPassword("AdminTest123!"),
      fullName: "SSO Conflict Admin",
      email: `sso-conflict-admin-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(adminUser.id);

    const org = await storage.createOrganization({
      name: `SSO Conflict Org ${suffix}`,
      slug: `sso-conflict-org-${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {
        auth: {
          mode: "saml",
          ssoUrl: "https://idp.example.com/sso",
          entityId: "urn:sso-conflict:sp",
          callbackUrl: null,
          certificate: null,
          allowedDomains: ["example.com"],
          jitProvisioning: true,
          enforceSso: false,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    });
    tracker.organizationIds.push(org.id);

    const adminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: org.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
      provisioningSource: "manual",
    });
    tracker.membershipIds.push(adminMembership.id);

    const providerLinkedUser = await storage.createUser({
      username: `provider-user-${suffix}`,
      password: await hashPassword("ProviderUser123!"),
      fullName: "Provider Linked User",
      email: `provider-linked-${suffix}@example.com`,
      role: "reviewer",
      authProvider: "saml",
      authProviderSubject: `provider-subject-${suffix}`,
      emailVerified: true,
    });
    tracker.userIds.push(providerLinkedUser.id);

    const providerLinkedMembership = await storage.createMembership({
      userId: providerLinkedUser.id,
      organizationId: org.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: false,
      invitedBy: adminUser.id,
      provisioningSource: "jit",
    });
    tracker.membershipIds.push(providerLinkedMembership.id);

    const emailLinkedUser = await storage.createUser({
      username: `email-user-${suffix}`,
      password: await hashPassword("EmailUser123!"),
      fullName: "Email Linked User",
      email: `email-linked-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(emailLinkedUser.id);

    const emailLinkedMembership = await storage.createMembership({
      userId: emailLinkedUser.id,
      organizationId: org.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: false,
      invitedBy: adminUser.id,
      provisioningSource: "manual",
    });
    tracker.membershipIds.push(emailLinkedMembership.id);

    const conflictingProviderSubject = `provider-subject-${suffix}`;
    const conflictingEmail = `email-linked-${suffix}@example.com`;

    const startConflict = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/dashboard")}`,
      { redirect: "manual" },
    );
    assert.equal(startConflict.status, 302);
    const conflictRelayState = new URL(startConflict.location ?? "").searchParams.get("relayState");
    const conflictCookie = cookieFromSetCookie(startConflict.setCookie);
    assert.ok(conflictRelayState && conflictCookie);

    const providerEmailConflict = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: conflictCookie,
      body: {
        RelayState: conflictRelayState,
        SAMLResponse: buildSamlResponseBase64({
          nameId: conflictingProviderSubject,
          email: conflictingEmail,
          fullName: "Conflicted User",
          audience: "urn:sso-conflict:sp",
        }),
      },
    });
    assert.equal(providerEmailConflict.status, 409);
    assert.match(
      String((providerEmailConflict.body as { message?: string }).message ?? ""),
      /different account/i,
    );

    const startSubjectMismatch = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/")}`,
      { redirect: "manual" },
    );
    assert.equal(startSubjectMismatch.status, 302);
    const subjectMismatchRelayState = new URL(startSubjectMismatch.location ?? "").searchParams.get("relayState");
    const subjectMismatchCookie = cookieFromSetCookie(startSubjectMismatch.setCookie);
    assert.ok(subjectMismatchRelayState && subjectMismatchCookie);

    const providerSubjectMismatch = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: subjectMismatchCookie,
      body: {
        RelayState: subjectMismatchRelayState,
        SAMLResponse: buildSamlResponseBase64({
          nameId: `different-subject-${suffix}`,
          email: `provider-linked-${suffix}@example.com`,
          fullName: "Mismatched Subject User",
          audience: "urn:sso-conflict:sp",
        }),
      },
    });
    assert.equal(providerSubjectMismatch.status, 409);
    assert.match(
      String((providerSubjectMismatch.body as { message?: string }).message ?? ""),
      /does not match/i,
    );

    const auditRows = await db
      .select({
        action: adminAuditEvents.action,
        metadata: adminAuditEvents.metadata,
      })
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.organizationId, org.id));

    const denialReasons = auditRows
      .filter((row) => row.action === "auth.sso.jit.denied")
      .map((row) => (row.metadata as Record<string, unknown> | null)?.reason);

    assert.ok(
      denialReasons.includes("provider_email_identity_conflict"),
      "Expected provider/email identity conflict to be audited",
    );
    assert.ok(
      denialReasons.includes("provider_subject_mismatch"),
      "Expected provider subject mismatch to be audited",
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
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

test("jit provisioning writes allow and create audit events", async () => {
  const tracker: Tracker = { organizationIds: [], membershipIds: [], userIds: [] };
  const suffix = makeSuffix();
  const { server, baseUrl } = await startTestServer();

  try {
    const adminUser = await storage.createUser({
      username: `sso-jit-admin-${suffix}`,
      password: await hashPassword("AdminTest123!"),
      fullName: "SSO JIT Admin",
      email: `sso-jit-admin-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(adminUser.id);

    const org = await storage.createOrganization({
      name: `SSO JIT Org ${suffix}`,
      slug: `sso-jit-org-${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {
        auth: {
          mode: "saml",
          ssoUrl: "https://idp.example.com/sso",
          entityId: "urn:sso-jit:sp",
          callbackUrl: null,
          certificate: null,
          allowedDomains: ["example.com"],
          jitProvisioning: true,
          enforceSso: false,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    });
    tracker.organizationIds.push(org.id);

    const adminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: org.id,
      role: "owner",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
      provisioningSource: "manual",
    });
    tracker.membershipIds.push(adminMembership.id);

    const start = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/dashboard")}`,
      { redirect: "manual" },
    );
    assert.equal(start.status, 302);
    const relayState = new URL(start.location ?? "").searchParams.get("relayState");
    const ssoCookie = cookieFromSetCookie(start.setCookie);
    assert.ok(relayState && ssoCookie);

    const jitEmail = `jit-created-${suffix}@example.com`;
    const callback = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: ssoCookie,
      body: {
        RelayState: relayState,
        SAMLResponse: buildSamlResponseBase64({
          nameId: `jit-subject-${suffix}`,
          email: jitEmail,
          fullName: "JIT Created User",
          audience: "urn:sso-jit:sp",
        }),
      },
    });

    assert.equal(callback.status, 200, "Expected JIT SSO callback to succeed");
    const callbackBody = callback.body as {
      ok?: boolean;
      user?: { id?: string; currentOrganizationId?: string | null };
    };
    assert.equal(callbackBody.ok, true);
    assert.ok(callbackBody.user?.id, "Expected auth payload user id");
    assert.equal(callbackBody.user?.currentOrganizationId, org.id);

    const createdUser = await db
      .select()
      .from(users)
      .where(eq(users.email, jitEmail))
      .limit(1);
    assert.equal(createdUser.length, 1, "Expected JIT-created user");
    tracker.userIds.push(createdUser[0].id);

    const createdMembership = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, createdUser[0].id))
      .limit(1);
    assert.equal(createdMembership.length, 1, "Expected JIT-created membership");
    tracker.membershipIds.push(createdMembership[0].id);
    assert.equal(createdMembership[0].provisioningSource, "jit");

    const auditRows = await db
      .select({
        action: adminAuditEvents.action,
        targetType: adminAuditEvents.targetType,
        targetId: adminAuditEvents.targetId,
        targetUserId: adminAuditEvents.targetUserId,
        metadata: adminAuditEvents.metadata,
      })
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.organizationId, org.id));

    const allowedEvent = auditRows.find(
      (row) =>
        row.action === "auth.sso.jit.allowed" &&
        (row.metadata as Record<string, unknown> | null)?.email === jitEmail,
    );
    assert.ok(allowedEvent, "Expected auth.sso.jit.allowed audit event");
    assert.equal((allowedEvent!.metadata as Record<string, unknown>).domain, "example.com");
    assert.equal((allowedEvent!.metadata as Record<string, unknown>).defaultRole, "reviewer");

    const userCreatedEvent = auditRows.find(
      (row) =>
        row.action === "auth.sso.jit.user_created" &&
        row.targetUserId === createdUser[0].id,
    );
    assert.ok(userCreatedEvent, "Expected auth.sso.jit.user_created audit event");

    const membershipCreatedEvent = auditRows.find(
      (row) =>
        row.action === "auth.sso.jit.membership_created" &&
        row.targetType === "membership" &&
        row.targetId === createdMembership[0].id,
    );
    assert.ok(membershipCreatedEvent, "Expected auth.sso.jit.membership_created audit event");
    assert.equal((membershipCreatedEvent!.metadata as Record<string, unknown>).role, "reviewer");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
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

test("jit deny paths write audit events for disabled JIT and blocked domains", async () => {
  const tracker: Tracker = { organizationIds: [], membershipIds: [], userIds: [] };
  const suffix = makeSuffix();
  const { server, baseUrl } = await startTestServer();

  try {
    const adminUser = await storage.createUser({
      username: `sso-jit-deny-admin-${suffix}`,
      password: await hashPassword("AdminTest123!"),
      fullName: "SSO JIT Deny Admin",
      email: `sso-jit-deny-admin-${suffix}@example.com`,
      role: "admin",
    });
    tracker.userIds.push(adminUser.id);

    const blockedDomainOrg = await storage.createOrganization({
      name: `SSO Blocked Domain Org ${suffix}`,
      slug: `sso-blocked-domain-org-${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {
        auth: {
          mode: "saml",
          ssoUrl: "https://idp.example.com/sso",
          entityId: "urn:sso-blocked-domain:sp",
          callbackUrl: null,
          certificate: null,
          allowedDomains: ["example.com"],
          jitProvisioning: true,
          enforceSso: false,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    });
    tracker.organizationIds.push(blockedDomainOrg.id);

    const blockedDomainAdminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: blockedDomainOrg.id,
      role: "owner",
      membershipState: "active",
      isDefault: false,
      invitedBy: null,
      provisioningSource: "manual",
    });
    tracker.membershipIds.push(blockedDomainAdminMembership.id);

    const jitDisabledOrg = await storage.createOrganization({
      name: `SSO JIT Disabled Org ${suffix}`,
      slug: `sso-jit-disabled-org-${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {
        auth: {
          mode: "saml",
          ssoUrl: "https://idp.example.com/sso",
          entityId: "urn:sso-jit-disabled:sp",
          callbackUrl: null,
          certificate: null,
          allowedDomains: ["example.com"],
          jitProvisioning: false,
          enforceSso: false,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    });
    tracker.organizationIds.push(jitDisabledOrg.id);

    const jitDisabledAdminMembership = await storage.createMembership({
      userId: adminUser.id,
      organizationId: jitDisabledOrg.id,
      role: "owner",
      membershipState: "active",
      isDefault: false,
      invitedBy: null,
      provisioningSource: "manual",
    });
    tracker.membershipIds.push(jitDisabledAdminMembership.id);

    const blockedStart = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(blockedDomainOrg.slug)}&next=${encodeURIComponent("/")}`,
      { redirect: "manual" },
    );
    assert.equal(blockedStart.status, 302);
    const blockedRelayState = new URL(blockedStart.location ?? "").searchParams.get("relayState");
    const blockedCookie = cookieFromSetCookie(blockedStart.setCookie);
    assert.ok(blockedRelayState && blockedCookie);

    const blockedCallback = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: blockedCookie,
      body: {
        RelayState: blockedRelayState,
        SAMLResponse: buildSamlResponseBase64({
          nameId: `blocked-domain-${suffix}`,
          email: `blocked-${suffix}@evil.test`,
          fullName: "Blocked Domain User",
          audience: "urn:sso-blocked-domain:sp",
        }),
      },
    });
    assert.equal(blockedCallback.status, 403);

    const jitDisabledStart = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(jitDisabledOrg.slug)}&next=${encodeURIComponent("/")}`,
      { redirect: "manual" },
    );
    assert.equal(jitDisabledStart.status, 302);
    const jitDisabledRelayState = new URL(jitDisabledStart.location ?? "").searchParams.get("relayState");
    const jitDisabledCookie = cookieFromSetCookie(jitDisabledStart.setCookie);
    assert.ok(jitDisabledRelayState && jitDisabledCookie);

    const jitDisabledCallback = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: jitDisabledCookie,
      body: {
        RelayState: jitDisabledRelayState,
        SAMLResponse: buildSamlResponseBase64({
          nameId: `jit-disabled-${suffix}`,
          email: `jit-disabled-${suffix}@example.com`,
          fullName: "JIT Disabled User",
          audience: "urn:sso-jit-disabled:sp",
        }),
      },
    });
    assert.equal(jitDisabledCallback.status, 403);

    const blockedDomainAudit = await db
      .select({
        action: adminAuditEvents.action,
        metadata: adminAuditEvents.metadata,
      })
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.organizationId, blockedDomainOrg.id));

    const blockedReasons = blockedDomainAudit
      .filter((row) => row.action === "auth.sso.jit.denied")
      .map((row) => (row.metadata as Record<string, unknown> | null)?.reason);

    assert.ok(
      blockedReasons.includes("domain_not_allowlisted"),
      "Expected blocked-domain JIT denial to be audited",
    );

    const jitDisabledAudit = await db
      .select({
        action: adminAuditEvents.action,
        metadata: adminAuditEvents.metadata,
      })
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.organizationId, jitDisabledOrg.id));

    const jitDisabledReasons = jitDisabledAudit
      .filter((row) => row.action === "auth.sso.jit.denied")
      .map((row) => (row.metadata as Record<string, unknown> | null)?.reason);

    assert.ok(
      jitDisabledReasons.includes("jit_disabled"),
      "Expected JIT-disabled denial to be audited",
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
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
