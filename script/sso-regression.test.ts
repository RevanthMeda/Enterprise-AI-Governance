import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer, type Server } from "http";
import type { AddressInfo } from "node:net";
import { eq, inArray } from "drizzle-orm";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { setupAuth, hashPassword } from "../server/auth";
import { registerRoutes } from "../server/routes";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { domainService } from "../server/services/domainService";
import { memberships, organizations, users } from "../shared/schema";

process.env.NODE_ENV = "test";
process.env.ALLOW_INSECURE_SAML_TEST_FIXTURES = "true";
process.env.ALLOW_INSECURE_OIDC_TEST_PROVIDER = "true";

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

function buildSamlResponseBase64(input: { email: string; fullName: string; audience: string }): string {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_resp" Version="2.0" IssueInstant="2026-03-07T23:40:00Z">
  <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
  <saml:Assertion ID="_assert" IssueInstant="2026-03-07T23:40:00Z" Version="2.0">
    <saml:Issuer>https://idp.example.com/metadata</saml:Issuer>
    <saml:Subject>
      <saml:NameID>${input.email}</saml:NameID>
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

async function startOidcProvider(): Promise<{ server: Server; baseUrl: string }> {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "oidc-test-key";

  const codes = new Map<string, { nonce: string; email: string; fullName: string }>();
  const app = express();
  const server = createServer(app);

  app.use(express.urlencoded({ extended: false }));

  app.get("/oauth/authorize", async (req, res) => {
    const redirectUri = String(req.query.redirect_uri ?? "");
    const state = String(req.query.state ?? "");
    const nonce = String(req.query.nonce ?? "");
    const email = String(req.query.login_hint ?? "oidc-user@example.com");
    const fullName = String(req.query.name_hint ?? "OIDC User");
    const code = `code-${makeSuffix()}`;
    codes.set(code, { nonce, email, fullName });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    return res.redirect(302, target.toString());
  });

  app.post("/oauth/token", async (req, res) => {
    const code = String(req.body?.code ?? "");
    const clientId = String(req.body?.client_id ?? "");
    const record = codes.get(code);

    if (!record) {
      return res.status(400).json({ error: "invalid_grant" });
    }

    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const idToken = await new SignJWT({
      email: record.email,
      name: record.fullName,
      nonce: record.nonce,
    })
      .setProtectedHeader({ alg: "RS256", kid: "oidc-test-key" })
      .setIssuer(origin)
      .setAudience(clientId)
      .setSubject(record.email)
      .setIssuedAt()
      .setExpirationTime("10m")
      .setJti(`jti-${makeSuffix()}`)
      .sign(privateKey);

    return res.json({
      access_token: `access-${makeSuffix()}`,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 600,
    });
  });

  app.get("/oauth/keys", (_req, res) => {
    return res.json({ keys: [jwk] });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

test("sso metadata/start/callback and local-login enforcement regression", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };
  let server: Server | undefined;

  try {
    const org = await storage.createOrganization({
      slug: `sso-regression-${suffix}`,
      name: `SSO Regression ${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {
        auth: {
          mode: "saml",
          ssoUrl: "https://idp.example.com/saml/sso",
          entityId: "urn:sso-regression:sp",
          idpIssuer: null,
          callbackUrl: "https://app.example.com/api/auth/sso/callback",
          allowedDomains: ["example.com"],
          jitProvisioning: false,
          enforceSso: true,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    });
    tracker.organizationIds.push(org.id);
    await domainService.replaceAllowedDomains(org.id, [
      { domain: "example.com", isVerified: true, verifiedAt: new Date() },
    ]);

    const localPassword = "Str0ng!Passw0rd";
    const localUser = await storage.createUser({
      username: `sso_local_${suffix}`,
      password: await hashPassword(localPassword),
      fullName: `SSO Local ${suffix}`,
      email: `local-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(localUser.id);

    const localMembership = await storage.createMembership({
      userId: localUser.id,
      organizationId: org.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(localMembership.id);

    const appServer = await startTestServer();
    server = appServer.server;
    const baseUrl = appServer.baseUrl;

    const blockedLocalLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: localUser.username, password: localPassword, organizationSlug: org.slug },
    });
    assert.equal(blockedLocalLogin.status, 403, "Expected local login to be blocked when SSO is enforced");
    assert.equal(
      (blockedLocalLogin.body as { ssoRequired?: boolean }).ssoRequired,
      true,
      "Expected ssoRequired flag when login is blocked",
    );
    assert.match(
      (blockedLocalLogin.body as { ssoStartUrl?: string }).ssoStartUrl ?? "",
      new RegExp(`/api/auth/sso/start\\?org=${org.slug}`),
      "Expected ssoStartUrl to point to organization slug",
    );

    const metadata = await apiRequest(baseUrl, `/api/auth/sso/metadata?org=${encodeURIComponent(org.slug)}`);
    assert.equal(metadata.status, 200, "Expected metadata endpoint to return 200");
    assert.match(String(metadata.contentType), /application\/samlmetadata\+xml/, "Expected SAML metadata content-type");
    assert.match(String(metadata.body), /EntityDescriptor/, "Expected metadata XML payload");

    const startForDomainCheck = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/dashboard")}`,
      { redirect: "manual" },
    );
    assert.equal(startForDomainCheck.status, 302, "Expected SSO start to redirect");
    const relayStateDomainCheck = new URL(startForDomainCheck.location ?? "").searchParams.get("relayState");
    const ssoCookieDomainCheck = cookieFromSetCookie(startForDomainCheck.setCookie);
    assert.ok(relayStateDomainCheck, "Expected relayState from SSO start redirect");
    assert.ok(ssoCookieDomainCheck, "Expected session cookie from SSO start");

    const disallowedCallback = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: ssoCookieDomainCheck,
      body: {
        RelayState: relayStateDomainCheck,
        SAMLResponse: buildSamlResponseBase64({
          email: `attacker-${suffix}@evil.test`,
          fullName: "Evil User",
          audience: "urn:sso-regression:sp",
        }),
      },
    });
    assert.equal(disallowedCallback.status, 403, "Expected disallowed domain to be rejected");

    const startForJitOff = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/")}`,
      { redirect: "manual" },
    );
    assert.equal(startForJitOff.status, 302);
    const relayStateJitOff = new URL(startForJitOff.location ?? "").searchParams.get("relayState");
    const ssoCookieJitOff = cookieFromSetCookie(startForJitOff.setCookie);
    assert.ok(relayStateJitOff && ssoCookieJitOff);

    const jitOffCallback = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      cookie: ssoCookieJitOff,
      body: {
        RelayState: relayStateJitOff,
        SAMLResponse: buildSamlResponseBase64({
          email: `jit-off-${suffix}@example.com`,
          fullName: "JIT Off User",
          audience: "urn:sso-regression:sp",
        }),
      },
    });
    assert.equal(jitOffCallback.status, 403, "Expected JIT-disabled org to reject new SSO principals");

    await db
      .update(organizations)
      .set({
        settings: {
          auth: {
            mode: "saml",
            ssoUrl: "https://idp.example.com/saml/sso",
            entityId: "urn:sso-regression:sp",
            idpIssuer: null,
            callbackUrl: "https://app.example.com/api/auth/sso/callback",
            allowedDomains: ["example.com"],
            jitProvisioning: true,
            enforceSso: true,
            strictSamlValidation: false,
            defaultRole: "reviewer",
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));

    const startForJitOn = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/")}`,
      { redirect: "manual" },
    );
    assert.equal(startForJitOn.status, 302);
    const relayStateJitOn = new URL(startForJitOn.location ?? "").searchParams.get("relayState");
    const ssoCookieJitOn = cookieFromSetCookie(startForJitOn.setCookie);
    assert.ok(relayStateJitOn && ssoCookieJitOn);

    // A top-level IdP return can land in a different CHIPS partition. The
    // callback must recover its one-time state from the database, not from the
    // session cookie issued while Firebase was the top-level site.
    const jitOnEmail = `jit-on-${suffix}@example.com`;
    const jitOnCallback = await apiRequest(baseUrl, "/api/auth/sso/callback", {
      method: "POST",
      body: {
        RelayState: relayStateJitOn,
        SAMLResponse: buildSamlResponseBase64({
          email: jitOnEmail,
          fullName: "JIT On User",
          audience: "urn:sso-regression:sp",
        }),
      },
    });
    assert.equal(jitOnCallback.status, 200, "Expected JIT-enabled org to provision and authenticate user");
    assert.equal((jitOnCallback.body as { ok?: boolean }).ok, true, "Expected successful SSO callback payload");

    const [jitProvisionedUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, jitOnEmail))
      .limit(1);
    assert.ok(jitProvisionedUser, "Expected JIT-provisioned user to exist");
    tracker.userIds.push(jitProvisionedUser.id);

    const [jitProvisionedMembership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, jitProvisionedUser.id))
      .limit(1);
    assert.ok(jitProvisionedMembership, "Expected membership for JIT-provisioned user");
    tracker.membershipIds.push(jitProvisionedMembership.id);

    await db
      .update(organizations)
      .set({
        settings: {
          auth: {
            mode: "saml",
            ssoUrl: "https://idp.example.com/saml/sso",
            entityId: "urn:sso-regression:sp",
            idpIssuer: "https://idp.example.com/metadata",
            callbackUrl: "https://app.example.com/api/auth/sso/callback",
            allowedDomains: ["example.com"],
            jitProvisioning: true,
            enforceSso: true,
            strictSamlValidation: true,
            defaultRole: "reviewer",
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, org.id));

    const startForStrict = await apiRequest(
      baseUrl,
      `/api/auth/sso/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/")}`,
      { redirect: "manual" },
    );
    assert.equal(startForStrict.status, 400, "Expected incomplete strict SAML configuration to fail closed");
    assert.match(
      JSON.stringify(startForStrict.body),
      /certificate/i,
      "Expected strict SAML start to require an IdP certificate",
    );
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

test("oidc start/callback and local-login enforcement regression", async () => {
  const suffix = makeSuffix();
  const tracker: Tracker = {
    organizationIds: [],
    membershipIds: [],
    userIds: [],
  };
  let appServer: Server | undefined;
  let oidcServer: Server | undefined;

  try {
    const provider = await startOidcProvider();
    oidcServer = provider.server;

    const org = await storage.createOrganization({
      slug: `oidc-regression-${suffix}`,
      name: `OIDC Regression ${suffix}`,
      status: "active",
      plan: "enterprise",
      settings: {
        auth: {
          mode: "oidc",
          oidcIssuer: provider.baseUrl,
          oidcAuthorizationUrl: `${provider.baseUrl}/oauth/authorize`,
          oidcTokenUrl: `${provider.baseUrl}/oauth/token`,
          oidcJwksUrl: `${provider.baseUrl}/oauth/keys`,
          oidcClientId: "oidc-client-id",
          oidcClientSecret: "oidc-client-secret",
          oidcScopes: "openid profile email",
          callbackUrl: null,
          allowedDomains: ["example.com"],
          jitProvisioning: true,
          enforceSso: true,
          strictSamlValidation: false,
          defaultRole: "reviewer",
        },
      },
    });
    tracker.organizationIds.push(org.id);
    await domainService.replaceAllowedDomains(org.id, [
      { domain: "example.com", isVerified: true, verifiedAt: new Date() },
    ]);

    const localPassword = "Str0ng!Passw0rd";
    const localUser = await storage.createUser({
      username: `oidc_local_${suffix}`,
      password: await hashPassword(localPassword),
      fullName: `OIDC Local ${suffix}`,
      email: `local-oidc-${suffix}@example.com`,
      role: "reviewer",
    });
    tracker.userIds.push(localUser.id);

    const localMembership = await storage.createMembership({
      userId: localUser.id,
      organizationId: org.id,
      role: "reviewer",
      membershipState: "active",
      isDefault: true,
      invitedBy: null,
    });
    tracker.membershipIds.push(localMembership.id);

    const app = await startTestServer();
    appServer = app.server;
    const baseUrl = app.baseUrl;

    const blockedLocalLogin = await apiRequest(baseUrl, "/api/auth/login", {
      method: "POST",
      body: { username: localUser.username, password: localPassword, organizationSlug: org.slug },
    });
    assert.equal(blockedLocalLogin.status, 403, "Expected local login to be blocked when OIDC is enforced");
    assert.match(
      (blockedLocalLogin.body as { ssoStartUrl?: string }).ssoStartUrl ?? "",
      new RegExp(`/api/auth/oidc/start\\?org=${org.slug}`),
      "Expected local-login block to point to OIDC start",
    );

    const start = await apiRequest(
      baseUrl,
      `/api/auth/oidc/start?org=${encodeURIComponent(org.slug)}&next=${encodeURIComponent("/dashboard")}`,
      { redirect: "manual" },
    );
    assert.equal(start.status, 302, "Expected OIDC start to redirect");
    const startLocation = new URL(start.location ?? "");
    assert.equal(startLocation.origin, provider.baseUrl, "Expected redirect to OIDC provider");
    assert.equal(startLocation.searchParams.get("client_id"), "oidc-client-id");
    assert.equal(startLocation.searchParams.get("response_type"), "code");
    assert.ok(startLocation.searchParams.get("code_challenge"), "Expected PKCE challenge");
    const sessionCookie = cookieFromSetCookie(start.setCookie);
    assert.ok(sessionCookie, "Expected OIDC start to set session cookie");

    const providerRedirect = await fetch(start.location ?? "", {
      redirect: "manual",
    });
    assert.equal(providerRedirect.status, 302, "Expected OIDC provider authorize step to redirect back");
    const callbackLocation = providerRedirect.headers.get("location");
    assert.ok(callbackLocation, "Expected OIDC provider redirect location");

    const callbackUrl = new URL(callbackLocation ?? "");
    const callback = await apiRequest(
      baseUrl,
      `${callbackUrl.pathname}${callbackUrl.search}`,
      // Deliberately omit the start-session cookie. OIDC state, nonce, and the
      // PKCE verifier must survive the cross-site round trip independently.
      {},
    );

    assert.equal(callback.status, 200, "Expected OIDC callback to succeed");
    assert.equal((callback.body as { ok?: boolean }).ok, true, "Expected successful OIDC callback payload");

    const provisionedEmail = "oidc-user@example.com";
    const [oidcUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, provisionedEmail))
      .limit(1);
    assert.ok(oidcUser, "Expected OIDC user to be provisioned");
    assert.equal(oidcUser.authProvider, "oidc", "Expected OIDC user to persist provider identity");
    tracker.userIds.push(oidcUser.id);

    const [oidcMembership] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, oidcUser.id))
      .limit(1);
    assert.ok(oidcMembership, "Expected OIDC membership to be created");
    tracker.membershipIds.push(oidcMembership.id);
  } finally {
    if (appServer) {
      await new Promise<void>((resolve, reject) => {
        appServer!.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (oidcServer) {
      await new Promise<void>((resolve, reject) => {
        oidcServer!.close((err) => (err ? reject(err) : resolve()));
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
