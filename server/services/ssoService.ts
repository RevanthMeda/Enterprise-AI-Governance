import { createHash, randomBytes } from "crypto";
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { eq, sql } from "drizzle-orm";
import type { Organization, User } from "@shared/schema";
import { adminAuditEvents, memberships, users } from "@shared/schema";
import { hashPassword } from "../auth";
import { db } from "../db";
import { fetchWithTimeout } from "../http";
import { storage } from "../storage";
import { domainService } from "./domainService";

type OrgAuthSettings = {
  mode: "local" | "saml" | "oidc";
  ssoUrl: string | null;
  entityId: string | null;
  idpIssuer: string | null;
  certificate: string | null;
  callbackUrl: string | null;
  oidcIssuer: string | null;
  oidcAuthorizationUrl: string | null;
  oidcTokenUrl: string | null;
  oidcJwksUrl: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  oidcScopes: string;
  allowedDomains: string[];
  jitProvisioning: boolean;
  enforceSso: boolean;
  strictSamlValidation: boolean;
  defaultRole: User["role"];
};

export type SsoOrganization = Pick<Organization, "id" | "slug" | "name" | "settings">;

export type ResolvedSsoOrganization = {
  organization: SsoOrganization | null;
  availableOrganizationSlugs: string[];
};

export type SsoPendingState = {
  state: string;
  organizationId: string;
  next: string;
  expiresAt: number;
  provider: "saml" | "oidc";
  codeVerifier?: string | null;
  nonce?: string | null;
};

export type SsoPrincipal = {
  email: string | null;
  fullName: string | null;
  providerSubject: string | null;
  externalGroup: string | null;
};

type StartSsoResult = {
  organization: SsoOrganization;
  pending: SsoPendingState;
  redirectUrl: string;
};

type CompleteSsoResult = {
  user: User;
  organization: SsoOrganization;
  next: string;
};

const OIDC_TOKEN_TIMEOUT_MS = 10_000;

function createSsoError(message: string, status = 400): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

function getOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeLegacyDomains(domains: string[]): string[] {
  const normalized = domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .map((domain) => (domain.startsWith("@") ? domain.slice(1) : domain));
  return Array.from(new Set(normalized));
}

function normalizeNextPath(nextPath?: string): string {
  if (!nextPath) return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("//")) return "/";
  return nextPath;
}

function getOrgAuthSettings(rawSettings: unknown): OrgAuthSettings {
  const settingsObject =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? (rawSettings as Record<string, unknown>)
      : {};
  const rawAuth =
    settingsObject.auth && typeof settingsObject.auth === "object" && !Array.isArray(settingsObject.auth)
      ? (settingsObject.auth as Record<string, unknown>)
      : {};

  return {
    mode: rawAuth.mode === "saml" ? "saml" : rawAuth.mode === "oidc" ? "oidc" : "local",
    ssoUrl: getOptionalString(rawAuth.ssoUrl) ?? null,
    entityId: getOptionalString(rawAuth.entityId) ?? null,
    idpIssuer: getOptionalString(rawAuth.idpIssuer) ?? null,
    certificate: getOptionalString(rawAuth.certificate) ?? null,
    callbackUrl: getOptionalString(rawAuth.callbackUrl) ?? null,
    oidcIssuer: getOptionalString(rawAuth.oidcIssuer) ?? null,
    oidcAuthorizationUrl: getOptionalString(rawAuth.oidcAuthorizationUrl) ?? null,
    oidcTokenUrl: getOptionalString(rawAuth.oidcTokenUrl) ?? null,
    oidcJwksUrl: getOptionalString(rawAuth.oidcJwksUrl) ?? null,
    oidcClientId: getOptionalString(rawAuth.oidcClientId) ?? null,
    oidcClientSecret: getOptionalString(rawAuth.oidcClientSecret) ?? null,
    oidcScopes: getOptionalString(rawAuth.oidcScopes) ?? "openid profile email",
    allowedDomains: Array.isArray(rawAuth.allowedDomains)
      ? normalizeLegacyDomains(rawAuth.allowedDomains.filter((value): value is string => typeof value === "string"))
      : [],
    jitProvisioning: rawAuth.jitProvisioning === true,
    enforceSso: rawAuth.enforceSso === true,
    strictSamlValidation: rawAuth.strictSamlValidation === true,
    defaultRole: typeof rawAuth.defaultRole === "string" ? (rawAuth.defaultRole as User["role"]) : "reviewer",
  };
}

function base64UrlEncode(value: Buffer): string {
  return value.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function buildPkceCodeVerifier(): string {
  return base64UrlEncode(randomBytes(32));
}

function buildPkceCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function compactCertificate(certificate: string | null): string | null {
  if (!certificate) return null;
  return certificate
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function firstStringValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const resolved = firstStringValue(entry);
      if (resolved) return resolved;
    }
  }
  return null;
}

function extractPrincipalFromProfile(profile: Record<string, unknown>): SsoPrincipal {
  const email =
    [
      firstStringValue(profile.email),
      firstStringValue(profile.mail),
      firstStringValue(profile["urn:oid:0.9.2342.19200300.100.1.3"]),
      firstStringValue(profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]),
      firstStringValue(profile.nameID),
    ].find((value): value is string => Boolean(value && value.includes("@"))) ?? null;

  const fullName =
    [
      firstStringValue(profile.displayName),
      firstStringValue(profile.cn),
      firstStringValue(profile.name),
      [firstStringValue(profile.givenName), firstStringValue(profile.sn)].filter(Boolean).join(" ").trim() || null,
    ].find((value): value is string => Boolean(value && value.trim().length > 0)) ?? null;

  const providerSubject =
    firstStringValue(profile.nameID) ??
    firstStringValue(profile.subject) ??
    firstStringValue(profile.sub) ??
    email;

  const externalGroup =
    firstStringValue(profile.memberOf) ??
    firstStringValue(profile.groups) ??
    firstStringValue(profile["http://schemas.microsoft.com/ws/2008/06/identity/claims/groups"]);

  return {
    email,
    fullName,
    providerSubject,
    externalGroup,
  };
}

function matchTagValue(xml: string, tagPattern: string): string | null {
  const regex = new RegExp(`<${tagPattern}[^>]*>([\\s\\S]*?)</${tagPattern}>`, "i");
  const match = xml.match(regex);
  return match?.[1]?.trim() || null;
}

function matchAttributeValue(xml: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(
      `<(?:[a-zA-Z0-9]+:)?Attribute[^>]+Name=["']${escaped}["'][^>]*>[\\s\\S]*?<(?:[a-zA-Z0-9]+:)?AttributeValue[^>]*>([\\s\\S]*?)</(?:[a-zA-Z0-9]+:)?AttributeValue>`,
      "i",
    );
    const match = xml.match(regex);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

function extractPrincipalFromXml(samlXml: string): SsoPrincipal {
  const email =
    matchAttributeValue(samlXml, [
      "email",
      "mail",
      "EmailAddress",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      "urn:oid:0.9.2342.19200300.100.1.3",
    ]) ?? matchTagValue(samlXml, "(?:[a-zA-Z0-9]+:)?NameID");

  const fullName =
    matchAttributeValue(samlXml, [
      "displayName",
      "name",
      "cn",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    ]) ?? null;

  return {
    email: email && email.includes("@") ? email : null,
    fullName,
    providerSubject: matchTagValue(samlXml, "(?:[a-zA-Z0-9]+:)?NameID") ?? email,
    externalGroup:
      matchAttributeValue(samlXml, [
        "memberOf",
        "groups",
        "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups",
      ]) ?? null,
  };
}

async function findUserByEmail(email: string): Promise<User | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);
  return user;
}

async function recordSsoAuditEvent(input: {
  organizationId: string;
  actorUserId?: string | null;
  actorName: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetUserId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await db.insert(adminAuditEvents).values({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetUserId: input.targetUserId ?? null,
    metadata: input.metadata ?? {},
  });
}

async function buildUniqueUsername(email: string): Promise<string> {
  const emailLocalPart = email.split("@")[0] ?? "user";
  const baseUsername = emailLocalPart.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 24) || "user";
  let usernameCandidate = baseUsername;
  let suffix = 1;
  while (await storage.getUserByUsername(usernameCandidate)) {
    usernameCandidate = `${baseUsername}${suffix}`.slice(0, 30);
    suffix += 1;
  }
  return usernameCandidate;
}

async function resolveOrganizationForSso(
  requestedOrg: string,
  actorUserId?: string,
): Promise<ResolvedSsoOrganization> {
  const trimmed = requestedOrg.trim();
  const availableOrganizationSlugs = actorUserId
    ? Array.from(
        new Set(
          (await storage.getMembershipsByUserId(actorUserId))
            .filter((membership) => membership.membershipState === "active")
            .map((membership) => membership.organizationSlug),
        ),
      )
    : [];

  if (!trimmed) {
    return { organization: null, availableOrganizationSlugs };
  }

  const bySlug = await storage.getOrganizationBySlug(trimmed);
  if (bySlug) {
    return {
      organization: {
        id: bySlug.id,
        slug: bySlug.slug,
        name: bySlug.name,
        settings: bySlug.settings,
      },
      availableOrganizationSlugs,
    };
  }

  const byId = await storage.getOrganizationById(trimmed);
  if (byId) {
    return {
      organization: {
        id: byId.id,
        slug: byId.slug,
        name: byId.name,
        settings: byId.settings,
      },
      availableOrganizationSlugs,
    };
  }

  return {
    organization: null,
    availableOrganizationSlugs,
  };
}

async function buildMetadataXml(organization: SsoOrganization, baseUrl: string): Promise<string> {
  const authSettings = getOrgAuthSettings(organization.settings);
  if (authSettings.mode !== "saml") {
    throw new Error("Organization is not configured for SAML");
  }

  const fallbackEntityId = `${baseUrl}/api/auth/sso/metadata?org=${encodeURIComponent(organization.slug)}`;
  const callbackUrl = authSettings.callbackUrl || `${baseUrl}/api/auth/sso/callback`;
  const entityId = authSettings.entityId || fallbackEntityId;
  const compactCert = compactCertificate(authSettings.certificate);

  return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(entityId)}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" AuthnRequestsSigned="false" WantAssertionsSigned="${authSettings.strictSamlValidation ? "true" : "false"}">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escapeXml(callbackUrl)}" index="0" isDefault="true" />
${compactCert ? `    <KeyDescriptor use="signing"><KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><X509Data><X509Certificate>${escapeXml(compactCert)}</X509Certificate></X509Data></KeyInfo></KeyDescriptor>` : ""}
  </SPSSODescriptor>
</EntityDescriptor>`;
}

async function startLogin(
  requestedOrg: string,
  nextPath: string,
  actorUserId?: string,
): Promise<StartSsoResult> {
  const resolved = await resolveOrganizationForSso(requestedOrg, actorUserId);
  if (!resolved.organization) {
    const error = new Error("Organization not found");
    (error as Error & { availableOrganizationSlugs?: string[] }).availableOrganizationSlugs =
      resolved.availableOrganizationSlugs;
    throw error;
  }

  const authSettings = getOrgAuthSettings(resolved.organization.settings);
  if (authSettings.mode !== "saml" || !authSettings.ssoUrl) {
    throw new Error("Organization is not configured for SSO");
  }

  const pending: SsoPendingState = {
    state: randomBytes(24).toString("hex"),
    organizationId: resolved.organization.id,
    next: normalizeNextPath(nextPath),
    expiresAt: Date.now() + 10 * 60 * 1000,
    provider: "saml",
  };

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(authSettings.ssoUrl);
  } catch {
    throw new Error("SSO URL is not configured correctly");
  }

  redirectUrl.searchParams.set("relayState", pending.state);
  redirectUrl.searchParams.set("org", resolved.organization.slug);
  redirectUrl.searchParams.set("next", pending.next);

  return {
    organization: resolved.organization,
    pending,
    redirectUrl: redirectUrl.toString(),
  };
}

async function startOidcLogin(
  requestedOrg: string,
  nextPath: string,
  actorUserId?: string,
  protocol = "https",
  host?: string,
): Promise<StartSsoResult> {
  const resolved = await resolveOrganizationForSso(requestedOrg, actorUserId);
  if (!resolved.organization) {
    const error = new Error("Organization not found");
    (error as Error & { availableOrganizationSlugs?: string[] }).availableOrganizationSlugs =
      resolved.availableOrganizationSlugs;
    throw error;
  }

  const authSettings = getOrgAuthSettings(resolved.organization.settings);
  if (
    authSettings.mode !== "oidc" ||
    !authSettings.oidcAuthorizationUrl ||
    !authSettings.oidcClientId ||
    !authSettings.oidcTokenUrl ||
    !authSettings.oidcJwksUrl ||
    !authSettings.oidcIssuer
  ) {
    throw new Error("Organization is not configured for OIDC");
  }

  if (!host && !authSettings.callbackUrl) {
    throw new Error("Unable to resolve request host for OIDC callback");
  }

  const codeVerifier = buildPkceCodeVerifier();
  const nonce = randomBytes(24).toString("hex");
  const pending: SsoPendingState = {
    state: randomBytes(24).toString("hex"),
    organizationId: resolved.organization.id,
    next: normalizeNextPath(nextPath),
    expiresAt: Date.now() + 10 * 60 * 1000,
    provider: "oidc",
    codeVerifier,
    nonce,
  };

  const callbackUrl = authSettings.callbackUrl || `${protocol}://${host}/api/auth/oidc/callback`;
  let redirectUrl: URL;
  try {
    redirectUrl = new URL(authSettings.oidcAuthorizationUrl);
  } catch {
    throw new Error("OIDC authorization URL is not configured correctly");
  }

  redirectUrl.searchParams.set("client_id", authSettings.oidcClientId);
  redirectUrl.searchParams.set("response_type", "code");
  redirectUrl.searchParams.set("redirect_uri", callbackUrl);
  redirectUrl.searchParams.set("scope", authSettings.oidcScopes || "openid profile email");
  redirectUrl.searchParams.set("state", pending.state);
  redirectUrl.searchParams.set("nonce", nonce);
  redirectUrl.searchParams.set("code_challenge", buildPkceCodeChallenge(codeVerifier));
  redirectUrl.searchParams.set("code_challenge_method", "S256");

  return {
    organization: resolved.organization,
    pending,
    redirectUrl: redirectUrl.toString(),
  };
}

function assertPendingState(pending: SsoPendingState | undefined, relayState: string): SsoPendingState {
  if (!pending || pending.state !== relayState) {
    throw new Error("SSO state is invalid or missing");
  }
  if (pending.expiresAt < Date.now()) {
    throw new Error("SSO state has expired");
  }
  return pending;
}

async function buildPrincipalFromCallback(
  organization: SsoOrganization,
  relayState: string,
  samlResponse: string,
  protocol: string,
  host?: string,
): Promise<SsoPrincipal> {
  const authSettings = getOrgAuthSettings(organization.settings);
  if (authSettings.mode !== "saml") {
    throw new Error("Organization is not configured for SSO");
  }

  if (authSettings.strictSamlValidation) {
    if (!authSettings.certificate) {
      throw new Error("IdP certificate is required for strict SAML validation");
    }
    if (!host) {
      throw new Error("Unable to resolve request host for SAML validation");
    }

    const fallbackEntityId = `${protocol}://${host}/api/auth/sso/metadata?org=${encodeURIComponent(organization.slug)}`;
    const spIssuer = authSettings.entityId || fallbackEntityId;
    const callbackUrl = authSettings.callbackUrl || `${protocol}://${host}/api/auth/sso/callback`;

    const saml = new SAML({
      callbackUrl,
      issuer: spIssuer,
      idpCert: authSettings.certificate,
      entryPoint: authSettings.ssoUrl ?? undefined,
      audience: spIssuer,
      validateInResponseTo: ValidateInResponseTo.never,
      wantAssertionsSigned: true,
      wantAuthnResponseSigned: true,
      acceptedClockSkewMs: 2 * 60 * 1000,
      idpIssuer: authSettings.idpIssuer ?? undefined,
    });

    const validated = await saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
      RelayState: relayState,
    });
    if (validated.loggedOut || !validated.profile) {
      throw new Error("SAML response did not contain an authentication profile");
    }
    return extractPrincipalFromProfile(validated.profile as Record<string, unknown>);
  }

  let samlXml = "";
  try {
    samlXml = Buffer.from(samlResponse, "base64").toString("utf8");
  } catch {
    throw new Error("Invalid SAML response encoding");
  }
  if (!samlXml.includes("<")) {
    throw new Error("Invalid SAML response payload");
  }
  if (authSettings.entityId && !samlXml.includes(authSettings.entityId)) {
    throw new Error("SAML response audience mismatch");
  }
  return extractPrincipalFromXml(samlXml);
}

function extractPrincipalFromOidcClaims(payload: Record<string, unknown>): SsoPrincipal {
  const email =
    [
      firstStringValue(payload.email),
      firstStringValue(payload.preferred_username),
      firstStringValue(payload.upn),
    ].find((value): value is string => Boolean(value && value.includes("@"))) ?? null;

  const fullName =
    [
      firstStringValue(payload.name),
      [firstStringValue(payload.given_name), firstStringValue(payload.family_name)].filter(Boolean).join(" ").trim() ||
        null,
    ].find((value): value is string => Boolean(value && value.trim().length > 0)) ?? null;

  const externalGroup =
    firstStringValue(payload.groups) ??
    firstStringValue(payload.group) ??
    null;

  return {
    email,
    fullName,
    providerSubject: firstStringValue(payload.sub) ?? email,
    externalGroup,
  };
}

async function buildPrincipalFromOidcCallback(
  organization: SsoOrganization,
  pending: SsoPendingState,
  code: string,
  protocol: string,
  host?: string,
): Promise<SsoPrincipal> {
  const authSettings = getOrgAuthSettings(organization.settings);
  if (authSettings.mode !== "oidc") {
    throw new Error("Organization is not configured for OIDC");
  }
  if (!pending.codeVerifier) {
    throw new Error("OIDC login state is missing PKCE verifier");
  }
  if (!authSettings.oidcTokenUrl || !authSettings.oidcJwksUrl || !authSettings.oidcClientId || !authSettings.oidcIssuer) {
    throw new Error("OIDC provider settings are incomplete");
  }
  if (!host && !authSettings.callbackUrl) {
    throw new Error("Unable to resolve request host for OIDC callback");
  }

  const callbackUrl = authSettings.callbackUrl || `${protocol}://${host}/api/auth/oidc/callback`;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: authSettings.oidcClientId,
    code_verifier: pending.codeVerifier,
  });

  if (authSettings.oidcClientSecret) {
    tokenBody.set("client_secret", authSettings.oidcClientSecret);
  }

  const tokenResponse = await fetchWithTimeout(authSettings.oidcTokenUrl, {
    method: "POST",
    timeoutMs: OIDC_TOKEN_TIMEOUT_MS,
    timeoutMessage: "OIDC token exchange timed out",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: tokenBody,
  });

  if (!tokenResponse.ok) {
    throw new Error(`OIDC token exchange failed with status ${tokenResponse.status}`);
  }

  const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
  const idToken = firstStringValue(tokenPayload.id_token);
  if (!idToken) {
    throw new Error("OIDC token response did not include an id_token");
  }

  const jwks = createRemoteJWKSet(new URL(authSettings.oidcJwksUrl));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: authSettings.oidcIssuer,
    audience: authSettings.oidcClientId,
  });

  if (pending.nonce && firstStringValue(payload.nonce) !== pending.nonce) {
    throw new Error("OIDC nonce validation failed");
  }

  return extractPrincipalFromOidcClaims(payload as Record<string, unknown>);
}

async function completeLogin(
  pending: SsoPendingState,
  principal: {
    email: string;
    fullName?: string | null;
    providerSubject?: string | null;
    externalGroup?: string | null;
  },
): Promise<CompleteSsoResult> {
  const organization = await storage.getOrganizationById(pending.organizationId);
  if (!organization) {
    throw new Error("Organization not found");
  }

  const authSettings = getOrgAuthSettings(organization.settings);
  if (authSettings.mode !== pending.provider) {
    throw createSsoError("Organization is not configured for SSO");
  }

  const emailDomain = domainService.extractEmailDomain(principal.email) ?? "unknown";
  const userByProvider =
    principal.providerSubject
      ? await storage.findUserByProviderSubject(pending.provider, principal.providerSubject)
      : undefined;
  const userByEmail = await findUserByEmail(principal.email);
  let user = userByProvider ?? userByEmail;

  if (userByProvider && userByEmail && userByProvider.id !== userByEmail.id) {
    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorName: principal.fullName ?? principal.email,
      action: "auth.sso.jit.denied",
      targetType: "organization",
      targetId: organization.id,
      metadata: {
        reason: "provider_email_identity_conflict",
        email: principal.email,
        domain: emailDomain,
        providerSubject: principal.providerSubject ?? null,
        providerUserId: userByProvider.id,
        emailUserId: userByEmail.id,
      },
    });
    throw createSsoError("SSO identity is already linked to a different account", 409);
  }

  if (
    user &&
    user.authProviderSubject &&
    principal.providerSubject &&
    user.authProvider === "saml" &&
    user.authProviderSubject !== principal.providerSubject
  ) {
    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      actorName: principal.fullName ?? principal.email,
      action: "auth.sso.jit.denied",
      targetType: "user",
      targetId: user.id,
      targetUserId: user.id,
      metadata: {
        reason: "provider_subject_mismatch",
        email: principal.email,
        domain: emailDomain,
        existingProviderSubject: user.authProviderSubject,
        attemptedProviderSubject: principal.providerSubject,
      },
    });
    throw createSsoError("SSO identity does not match the linked account", 409);
  }

  const allowJitByDomain = await domainService.isEmailAllowedForJitProvisioning(organization, principal.email);

  if (!user) {
    if (!authSettings.jitProvisioning) {
      await recordSsoAuditEvent({
        organizationId: organization.id,
        actorName: principal.fullName ?? principal.email,
        action: "auth.sso.jit.denied",
        targetType: "organization",
        targetId: organization.id,
        metadata: {
          reason: "jit_disabled",
          email: principal.email,
          domain: emailDomain,
          providerSubject: principal.providerSubject ?? null,
        },
      });
      throw createSsoError("JIT user provisioning is disabled for this organization", 403);
    }
    if (!allowJitByDomain) {
      await recordSsoAuditEvent({
        organizationId: organization.id,
        actorName: principal.fullName ?? principal.email,
        action: "auth.sso.jit.denied",
        targetType: "organization",
        targetId: organization.id,
        metadata: {
          reason: "domain_not_allowlisted",
          email: principal.email,
          domain: emailDomain,
          providerSubject: principal.providerSubject ?? null,
        },
      });
      throw createSsoError("Email domain is not allowed for this organization", 403);
    }

    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorName: principal.fullName ?? principal.email,
      action: "auth.sso.jit.allowed",
      targetType: "organization",
      targetId: organization.id,
      metadata: {
        email: principal.email,
        domain: emailDomain,
        providerSubject: principal.providerSubject ?? null,
        defaultRole: authSettings.defaultRole,
      },
    });

    user = await storage.createUser({
      username: await buildUniqueUsername(principal.email),
      password: await hashPassword(randomBytes(32).toString("hex")),
      fullName: principal.fullName ?? principal.email.split("@")[0] ?? "User",
      email: principal.email,
      role: authSettings.defaultRole,
      authProvider: pending.provider,
      authProviderSubject: principal.providerSubject ?? principal.email,
      emailVerified: true,
      lastLoginAt: new Date(),
    });

    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      actorName: user.fullName || user.username,
      action: "auth.sso.jit.user_created",
      targetType: "user",
      targetId: user.id,
      targetUserId: user.id,
      metadata: {
        email: user.email,
        domain: emailDomain,
        providerSubject: principal.providerSubject ?? null,
      },
    });
  } else {
    await storage.updateUserAuthIdentity(user.id, {
      authProvider: pending.provider,
      authProviderSubject: principal.providerSubject ?? user.authProviderSubject ?? principal.email,
      emailVerified: true,
      lastLoginAt: new Date(),
    });
    user = (await storage.getUser(user.id)) ?? user;
  }

  const membershipsByUser = await storage.getMembershipsByUserId(user.id);
  const existingMembership = membershipsByUser.find((membership) => membership.organizationId === organization.id);

  if (!existingMembership) {
    if (!authSettings.jitProvisioning) {
      await recordSsoAuditEvent({
        organizationId: organization.id,
        actorUserId: user.id,
        actorName: user.fullName || user.username,
        action: "auth.sso.jit.denied",
        targetType: "user",
        targetId: user.id,
        targetUserId: user.id,
        metadata: {
          reason: "jit_disabled_membership_missing",
          email: principal.email,
          domain: emailDomain,
          providerSubject: principal.providerSubject ?? null,
        },
      });
      throw createSsoError("JIT user provisioning is disabled for this organization", 403);
    }
    if (!allowJitByDomain) {
      await recordSsoAuditEvent({
        organizationId: organization.id,
        actorUserId: user.id,
        actorName: user.fullName || user.username,
        action: "auth.sso.jit.denied",
        targetType: "user",
        targetId: user.id,
        targetUserId: user.id,
        metadata: {
          reason: "domain_not_allowlisted_membership_missing",
          email: principal.email,
          domain: emailDomain,
          providerSubject: principal.providerSubject ?? null,
        },
      });
      throw createSsoError("Email domain is not allowed for this organization", 403);
    }

    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      actorName: user.fullName || user.username,
      action: "auth.sso.jit.allowed",
      targetType: "user",
      targetId: user.id,
      targetUserId: user.id,
      metadata: {
        email: principal.email,
        domain: emailDomain,
        providerSubject: principal.providerSubject ?? null,
        defaultRole: authSettings.defaultRole,
      },
    });

    const membership = await storage.createMembership({
      userId: user.id,
      organizationId: organization.id,
      role: authSettings.defaultRole,
      membershipState: "active",
      isDefault: !membershipsByUser.some((membership) => membership.isDefault && membership.membershipState === "active"),
      invitedBy: null,
      provisioningSource: "jit",
      externalGroup: principal.externalGroup ?? null,
      lastSyncedAt: new Date(),
    });

    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorUserId: user.id,
      actorName: user.fullName || user.username,
      action: "auth.sso.jit.membership_created",
      targetType: "membership",
      targetId: membership.id,
      targetUserId: user.id,
      metadata: {
        email: principal.email,
        domain: emailDomain,
        role: authSettings.defaultRole,
      },
    });
  } else {
    const shouldPromoteProvisioningSource = existingMembership.membershipState !== "active";
    await db
      .update(memberships)
      .set({
        membershipState: "active",
        externalGroup: principal.externalGroup ?? null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(memberships.id, existingMembership.id));

    if (shouldPromoteProvisioningSource) {
      await storage.updateMembershipProvisioningMetadata(existingMembership.id, {
        provisioningSource: "jit",
        externalGroup: principal.externalGroup ?? null,
        lastSyncedAt: new Date(),
      });
    }
  }

  await storage.updateUserLastLogin(user.id, new Date());
  user = (await storage.getUser(user.id)) ?? user;

  return {
    user,
    organization: {
      id: organization.id,
      slug: organization.slug,
      name: organization.name,
      settings: organization.settings,
    },
    next: normalizeNextPath(pending.next),
  };
}

export const ssoService = {
  getOrgAuthSettings,
  normalizeNextPath,
  resolveOrganizationForSso,
  buildMetadataXml,
  startLogin,
  startOidcLogin,
  assertPendingState,
  buildPrincipalFromCallback,
  buildPrincipalFromOidcCallback,
  completeLogin,
};
