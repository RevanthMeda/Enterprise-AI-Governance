import { createHash, randomBytes } from "crypto";
import {
  SAML,
  ValidateInResponseTo,
  type CacheItem,
  type CacheProvider,
} from "@node-saml/node-saml";
import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Organization, User } from "@shared/schema";
import {
  adminAuditEvents,
  externalAuthIdentities,
  memberships,
  samlAuthnRequests,
  users,
} from "@shared/schema";
import { normalizeInternalPath } from "@shared/internal-path";
import { hashPassword } from "../auth";
import { db } from "../db";
import { fetchWithTimeout } from "../http";
import {
  safeOutboundFetch,
  type SafeOutboundRequestInit,
  type SafeOutboundResponse,
} from "../safe-outbound-http";
import { storage } from "../storage";
import { domainService } from "./domainService";
import { resolveOidcClientSecretForExecution } from "./organizationSecretService";
import { ssoPendingStateService } from "./ssoPendingStateService";
import {
  areInsecureOidcTestProvidersAllowed,
  validateOidcEndpointConfiguration,
} from "./oidcEndpointSecurity";

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
const OIDC_MAX_RESPONSE_BYTES = 256 * 1024;
const SAML_REQUEST_TTL_MS = 10 * 60 * 1000;
const SAML_ASSERTION_MAX_AGE_MS = 5 * 60 * 1000;
const SAML_ACCEPTED_CLOCK_SKEW_MS = 2 * 60 * 1000;
const SAML_BEARER_CONFIRMATION = "urn:oasis:names:tc:SAML:2.0:cm:bearer";

type OidcHttpResponse = Pick<Response, "ok" | "status" | "json"> | SafeOutboundResponse;

async function fetchOidcEndpoint(
  url: URL,
  init: SafeOutboundRequestInit,
): Promise<OidcHttpResponse> {
  if (areInsecureOidcTestProvidersAllowed()) {
    return fetchWithTimeout(url, {
      method: init.method,
      headers: init.headers,
      body: init.body as BodyInit | null | undefined,
      timeoutMs: init.timeoutMs ?? OIDC_TOKEN_TIMEOUT_MS,
      timeoutMessage: "OIDC provider request timed out",
    });
  }
  return safeOutboundFetch(url, {
    ...init,
    timeoutMs: init.timeoutMs ?? OIDC_TOKEN_TIMEOUT_MS,
    maxResponseBytes: init.maxResponseBytes ?? OIDC_MAX_RESPONSE_BYTES,
  });
}

function hashSamlState(value: string, purpose: "request" | "relay"): string {
  return createHash("sha256").update(`aict:saml:${purpose}:v1\0${value}`, "utf8").digest("hex");
}

class DatabaseSamlRequestCacheProvider implements CacheProvider {
  private claimedKey: string | null = null;
  private claimedValue: string | null = null;
  private lastClaimedKey: string | null = null;

  constructor(
    private readonly organizationId: string,
    private readonly relayState: string,
  ) {}

  async saveAsync(key: string, value: string): Promise<CacheItem> {
    const parsedCreatedAt = Date.parse(value);
    const createdAt = Number.isFinite(parsedCreatedAt) ? parsedCreatedAt : Date.now();
    await db.insert(samlAuthnRequests).values({
      requestIdHash: hashSamlState(key, "request"),
      organizationId: this.organizationId,
      relayStateHash: hashSamlState(this.relayState, "relay"),
      requestCreatedAt: value,
      expiresAt: new Date(createdAt + SAML_REQUEST_TTL_MS),
      consumedAt: null,
    });
    return { value, createdAt };
  }

  async getAsync(key: string): Promise<string | null> {
    if (this.claimedKey) {
      return this.claimedKey === key ? this.claimedValue : null;
    }

    const now = new Date();
    const [claimed] = await db
      .update(samlAuthnRequests)
      .set({ consumedAt: now })
      .where(
        and(
          eq(samlAuthnRequests.requestIdHash, hashSamlState(key, "request")),
          eq(samlAuthnRequests.organizationId, this.organizationId),
          eq(samlAuthnRequests.relayStateHash, hashSamlState(this.relayState, "relay")),
          isNull(samlAuthnRequests.consumedAt),
          gt(samlAuthnRequests.expiresAt, now),
        ),
      )
      .returning({ requestCreatedAt: samlAuthnRequests.requestCreatedAt });

    if (!claimed) return null;
    this.claimedKey = key;
    this.claimedValue = claimed.requestCreatedAt;
    this.lastClaimedKey = key;
    return claimed.requestCreatedAt;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key || key !== this.claimedKey) return null;
    const value = this.claimedValue;
    this.claimedKey = null;
    this.claimedValue = null;
    return value;
  }

  getLastClaimedRequestId(): string | null {
    return this.lastClaimedKey;
  }
}

export function areInsecureSamlTestFixturesAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "test" && env.ALLOW_INSECURE_SAML_TEST_FIXTURES === "true";
}

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
  return normalizeInternalPath(nextPath);
}

function resolveExternalIdentityIssuer(
  authSettings: OrgAuthSettings,
  provider: "saml" | "oidc",
): string {
  const issuer = provider === "oidc"
    ? authSettings.oidcIssuer
    : authSettings.idpIssuer ?? authSettings.ssoUrl;
  if (!issuer) {
    throw createSsoError("SSO provider issuer is not configured", 400);
  }
  return issuer.trim();
}

async function findUserByExternalIdentity(input: {
  organizationId: string;
  provider: "saml" | "oidc";
  issuer: string;
  subject: string;
}): Promise<User | undefined> {
  const [row] = await db
    .select({ user: users })
    .from(externalAuthIdentities)
    .innerJoin(users, eq(externalAuthIdentities.userId, users.id))
    .where(
      and(
        eq(externalAuthIdentities.organizationId, input.organizationId),
        eq(externalAuthIdentities.provider, input.provider),
        eq(externalAuthIdentities.issuer, input.issuer),
        eq(externalAuthIdentities.subject, input.subject),
      ),
    )
    .limit(1);
  return row?.user;
}

async function findScopedLegacyProviderUser(input: {
  organizationId: string;
  provider: "saml" | "oidc";
  subject: string;
}): Promise<User | undefined> {
  const [row] = await db
    .select({ user: users })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(
      and(
        eq(memberships.organizationId, input.organizationId),
        eq(users.authProvider, input.provider),
        eq(users.authProviderSubject, input.subject),
      ),
    )
    .limit(1);
  return row?.user;
}

async function getUserExternalIdentity(input: {
  userId: string;
  organizationId: string;
  provider: "saml" | "oidc";
  issuer: string;
}): Promise<{ id: string; subject: string } | undefined> {
  const [identity] = await db
    .select({ id: externalAuthIdentities.id, subject: externalAuthIdentities.subject })
    .from(externalAuthIdentities)
    .where(
      and(
        eq(externalAuthIdentities.userId, input.userId),
        eq(externalAuthIdentities.organizationId, input.organizationId),
        eq(externalAuthIdentities.provider, input.provider),
        eq(externalAuthIdentities.issuer, input.issuer),
      ),
    )
    .limit(1);
  return identity;
}

async function hasAnyExternalIdentityForUserInOrganization(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const [identity] = await db
    .select({ id: externalAuthIdentities.id })
    .from(externalAuthIdentities)
    .where(
      and(
        eq(externalAuthIdentities.userId, userId),
        eq(externalAuthIdentities.organizationId, organizationId),
      ),
    )
    .limit(1);
  return Boolean(identity);
}

async function bindExternalIdentity(input: {
  userId: string;
  organizationId: string;
  provider: "saml" | "oidc";
  issuer: string;
  subject: string;
}): Promise<void> {
  const now = new Date();
  await db
    .insert(externalAuthIdentities)
    .values({ ...input, createdAt: now, lastSeenAt: now })
    .onConflictDoNothing();

  const [subjectIdentity] = await db
    .select({ id: externalAuthIdentities.id, userId: externalAuthIdentities.userId })
    .from(externalAuthIdentities)
    .where(
      and(
        eq(externalAuthIdentities.organizationId, input.organizationId),
        eq(externalAuthIdentities.provider, input.provider),
        eq(externalAuthIdentities.issuer, input.issuer),
        eq(externalAuthIdentities.subject, input.subject),
      ),
    )
    .limit(1);
  const userIdentity = await getUserExternalIdentity(input);
  if (
    !subjectIdentity ||
    subjectIdentity.userId !== input.userId ||
    !userIdentity ||
    userIdentity.subject !== input.subject
  ) {
    throw createSsoError("SSO identity does not match the linked account", 409);
  }

  await db
    .update(externalAuthIdentities)
    .set({ lastSeenAt: now })
    .where(eq(externalAuthIdentities.id, subjectIdentity.id));
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

export function assertSamlValidationMode(
  strictSamlValidation: boolean,
  env: NodeJS.ProcessEnv = process.env,
): "strict" | "insecure_test_fixture" {
  if (strictSamlValidation) return "strict";
  if (areInsecureSamlTestFixturesAllowed(env)) return "insecure_test_fixture";
  throw createSsoError("Strict SAML validation is required", 400);
}

function assertStrictSamlConfiguration(authSettings: OrgAuthSettings): void {
  if (!authSettings.certificate) {
    throw createSsoError("IdP certificate is required for SAML validation", 400);
  }
  if (!authSettings.idpIssuer) {
    throw createSsoError("IdP issuer is required for SAML validation", 400);
  }
  if (!authSettings.ssoUrl) {
    throw createSsoError("SAML SSO URL is required", 400);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map(asRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function xmlText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  const record = asRecord(value);
  return typeof record?._ === "string" && record._.trim() ? record._.trim() : null;
}

function requireSamlTimestamp(value: unknown, label: string): number {
  if (typeof value !== "string" || !value.trim()) {
    throw createSsoError(`SAML ${label} is required`, 400);
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw createSsoError(`SAML ${label} is invalid`, 400);
  }
  return parsed;
}

export function assertStrictSamlProfileSecurity(
  profile: Record<string, unknown>,
  input: {
    idpIssuer: string;
    spAudience: string;
    callbackUrl: string;
    expectedInResponseTo: string;
    nowMs?: number;
  },
): void {
  const nowMs = input.nowMs ?? Date.now();
  if (firstStringValue(profile.issuer) !== input.idpIssuer) {
    throw createSsoError("SAML assertion issuer mismatch", 400);
  }
  if (firstStringValue(profile.inResponseTo) !== input.expectedInResponseTo) {
    throw createSsoError("SAML response correlation failed", 400);
  }

  const getAssertion = profile.getAssertion;
  if (typeof getAssertion !== "function") {
    throw createSsoError("SAML assertion details are unavailable", 400);
  }
  const assertionDocument = asRecord(getAssertion.call(profile));
  const assertion = assertionDocument ? asRecord(assertionDocument.Assertion) : null;
  const assertionAttributes = assertion ? asRecord(assertion.$) : null;
  if (!assertion || !assertionAttributes) {
    throw createSsoError("SAML assertion details are invalid", 400);
  }

  const issueInstant = requireSamlTimestamp(assertionAttributes.IssueInstant, "assertion IssueInstant");
  if (
    issueInstant > nowMs + SAML_ACCEPTED_CLOCK_SKEW_MS ||
    nowMs - issueInstant > SAML_ASSERTION_MAX_AGE_MS + SAML_ACCEPTED_CLOCK_SKEW_MS
  ) {
    throw createSsoError("SAML assertion IssueInstant is outside the allowed window", 400);
  }

  const conditionsList = asRecordArray(assertion.Conditions);
  if (conditionsList.length !== 1) {
    throw createSsoError("SAML assertion must contain exactly one Conditions element", 400);
  }
  const conditions = conditionsList[0];
  const conditionAttributes = asRecord(conditions.$);
  if (!conditionAttributes) {
    throw createSsoError("SAML assertion Conditions are invalid", 400);
  }
  const notBefore = requireSamlTimestamp(conditionAttributes.NotBefore, "Conditions NotBefore");
  const notOnOrAfter = requireSamlTimestamp(conditionAttributes.NotOnOrAfter, "Conditions NotOnOrAfter");
  if (notBefore > nowMs + SAML_ACCEPTED_CLOCK_SKEW_MS || notOnOrAfter <= nowMs - SAML_ACCEPTED_CLOCK_SKEW_MS) {
    throw createSsoError("SAML assertion Conditions are outside the allowed window", 400);
  }

  const audienceRestrictions = asRecordArray(conditions.AudienceRestriction);
  if (
    audienceRestrictions.length === 0 ||
    audienceRestrictions.some((restriction) => {
      const audiences = Array.isArray(restriction.Audience) ? restriction.Audience : [];
      return !audiences.some((audience) => xmlText(audience) === input.spAudience);
    })
  ) {
    throw createSsoError("SAML assertion audience mismatch", 400);
  }

  const subject = assertion ? asRecordArray(assertion.Subject)[0] : null;
  const subjectConfirmations = subject ? asRecordArray(subject.SubjectConfirmation) : [];
  const bearerConfirmation = subjectConfirmations.find((confirmation) => {
    const attributes = asRecord(confirmation.$);
    return firstStringValue(attributes?.Method) === SAML_BEARER_CONFIRMATION;
  });
  const confirmationData = bearerConfirmation
    ? asRecordArray(bearerConfirmation.SubjectConfirmationData)[0]
    : null;
  const confirmationAttributes = confirmationData ? asRecord(confirmationData.$) : null;
  if (!confirmationAttributes) {
    throw createSsoError("SAML bearer SubjectConfirmationData is required", 400);
  }
  if (firstStringValue(confirmationAttributes.InResponseTo) !== input.expectedInResponseTo) {
    throw createSsoError("SAML subject correlation failed", 400);
  }
  if (firstStringValue(confirmationAttributes.Recipient) !== input.callbackUrl) {
    throw createSsoError("SAML response recipient mismatch", 400);
  }
  const subjectNotOnOrAfter = requireSamlTimestamp(
    confirmationAttributes.NotOnOrAfter,
    "SubjectConfirmationData NotOnOrAfter",
  );
  if (subjectNotOnOrAfter <= nowMs - SAML_ACCEPTED_CLOCK_SKEW_MS) {
    throw createSsoError("SAML SubjectConfirmationData has expired", 400);
  }
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

function resolveStrictSamlRuntime(
  organization: SsoOrganization,
  authSettings: OrgAuthSettings,
  relayState: string,
  protocol: string,
  host?: string,
): {
  saml: SAML;
  cacheProvider: DatabaseSamlRequestCacheProvider;
  callbackUrl: string;
  spIssuer: string;
  idpIssuer: string;
} {
  assertStrictSamlConfiguration(authSettings);

  let baseUrl: string | null = host ? `${protocol}://${host}` : null;
  if (!baseUrl && authSettings.callbackUrl) {
    try {
      baseUrl = new URL(authSettings.callbackUrl).origin;
    } catch {
      throw createSsoError("SAML callback URL is not configured correctly", 400);
    }
  }
  if (!baseUrl) {
    throw createSsoError("Unable to resolve request host for SAML validation", 400);
  }

  const callbackUrl = authSettings.callbackUrl || `${baseUrl}/api/auth/sso/callback`;
  const spIssuer =
    authSettings.entityId ||
    `${baseUrl}/api/auth/sso/metadata?org=${encodeURIComponent(organization.slug)}`;
  const cacheProvider = new DatabaseSamlRequestCacheProvider(organization.id, relayState);
  const saml = createStrictSamlClient({
    callbackUrl,
    spIssuer,
    idpCert: authSettings.certificate!,
    entryPoint: authSettings.ssoUrl!,
    idpIssuer: authSettings.idpIssuer!,
    cacheProvider,
  });

  return {
    saml,
    cacheProvider,
    callbackUrl,
    spIssuer,
    idpIssuer: authSettings.idpIssuer!,
  };
}

export function createStrictSamlClient(input: {
  callbackUrl: string;
  spIssuer: string;
  idpCert: string;
  entryPoint: string;
  idpIssuer: string;
  cacheProvider: CacheProvider;
}): SAML {
  return new SAML({
    callbackUrl: input.callbackUrl,
    issuer: input.spIssuer,
    idpCert: input.idpCert,
    entryPoint: input.entryPoint,
    audience: input.spIssuer,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: SAML_REQUEST_TTL_MS,
    cacheProvider: input.cacheProvider,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    acceptedClockSkewMs: SAML_ACCEPTED_CLOCK_SKEW_MS,
    maxAssertionAgeMs: SAML_ASSERTION_MAX_AGE_MS,
    idpIssuer: input.idpIssuer,
  });
}

async function buildMetadataXml(organization: SsoOrganization, baseUrl: string): Promise<string> {
  const authSettings = getOrgAuthSettings(organization.settings);
  if (authSettings.mode !== "saml") {
    throw new Error("Organization is not configured for SAML");
  }
  const validationMode = assertSamlValidationMode(authSettings.strictSamlValidation);

  const fallbackEntityId = `${baseUrl}/api/auth/sso/metadata?org=${encodeURIComponent(organization.slug)}`;
  const callbackUrl = authSettings.callbackUrl || `${baseUrl}/api/auth/sso/callback`;
  const entityId = authSettings.entityId || fallbackEntityId;

  return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata" entityID="${escapeXml(entityId)}">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol" AuthnRequestsSigned="false" WantAssertionsSigned="${validationMode === "strict" ? "true" : "false"}">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${escapeXml(callbackUrl)}" index="0" isDefault="true" />
  </SPSSODescriptor>
</EntityDescriptor>`;
}

async function startLogin(
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
  if (authSettings.mode !== "saml" || !authSettings.ssoUrl) {
    throw new Error("Organization is not configured for SSO");
  }
  const validationMode = assertSamlValidationMode(authSettings.strictSamlValidation);

  const pending: SsoPendingState = {
    state: randomBytes(24).toString("hex"),
    organizationId: resolved.organization.id,
    next: normalizeNextPath(nextPath),
    expiresAt: Date.now() + 10 * 60 * 1000,
    provider: "saml",
  };

  let redirectUrl: string;
  if (validationMode === "strict") {
    const runtime = resolveStrictSamlRuntime(
      resolved.organization,
      authSettings,
      pending.state,
      protocol,
      host,
    );
    redirectUrl = await runtime.saml.getAuthorizeUrlAsync(pending.state, host, {
      additionalParams: {
        relayState: pending.state,
        org: resolved.organization.slug,
        next: pending.next,
      },
    });
  } else {
    let legacyRedirectUrl: URL;
    try {
      legacyRedirectUrl = new URL(authSettings.ssoUrl);
    } catch {
      throw new Error("SSO URL is not configured correctly");
    }
    legacyRedirectUrl.searchParams.set("relayState", pending.state);
    legacyRedirectUrl.searchParams.set("org", resolved.organization.slug);
    legacyRedirectUrl.searchParams.set("next", pending.next);
    redirectUrl = legacyRedirectUrl.toString();
  }

  await ssoPendingStateService.persist(pending);

  return {
    organization: resolved.organization,
    pending,
    redirectUrl,
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
  const oidcEndpoints = validateOidcEndpointConfiguration(authSettings);

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
  const redirectUrl = new URL(oidcEndpoints.authorization);

  redirectUrl.searchParams.set("client_id", authSettings.oidcClientId);
  redirectUrl.searchParams.set("response_type", "code");
  redirectUrl.searchParams.set("redirect_uri", callbackUrl);
  redirectUrl.searchParams.set("scope", authSettings.oidcScopes || "openid profile email");
  redirectUrl.searchParams.set("state", pending.state);
  redirectUrl.searchParams.set("nonce", nonce);
  redirectUrl.searchParams.set("code_challenge", buildPkceCodeChallenge(codeVerifier));
  redirectUrl.searchParams.set("code_challenge_method", "S256");

  await ssoPendingStateService.persist(pending);

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
  pending: SsoPendingState | string,
  samlResponse: string,
  protocol: string,
  host?: string,
): Promise<SsoPrincipal> {
  const relayState = typeof pending === "string" ? pending : pending.state;
  const authSettings = getOrgAuthSettings(organization.settings);
  if (authSettings.mode !== "saml") {
    throw new Error("Organization is not configured for SSO");
  }
  const validationMode = assertSamlValidationMode(authSettings.strictSamlValidation);

  if (validationMode === "strict") {
    const runtime = resolveStrictSamlRuntime(
      organization,
      authSettings,
      relayState,
      protocol,
      host,
    );
    const validated = await runtime.saml.validatePostResponseAsync({
      SAMLResponse: samlResponse,
      RelayState: relayState,
    });
    if (validated.loggedOut || !validated.profile) {
      throw new Error("SAML response did not contain an authentication profile");
    }
    const profile = validated.profile as Record<string, unknown>;
    const claimedRequestId = runtime.cacheProvider.getLastClaimedRequestId();
    if (!claimedRequestId) {
      throw createSsoError("SAML response correlation failed", 400);
    }
    assertStrictSamlProfileSecurity(profile, {
      idpIssuer: runtime.idpIssuer,
      spAudience: runtime.spIssuer,
      callbackUrl: runtime.callbackUrl,
      expectedInResponseTo: claimedRequestId,
    });
    return extractPrincipalFromProfile(profile);
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
  const oidcEndpoints = validateOidcEndpointConfiguration(authSettings);

  const callbackUrl = authSettings.callbackUrl || `${protocol}://${host}/api/auth/oidc/callback`;
  const tokenBody = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
    client_id: authSettings.oidcClientId,
    code_verifier: pending.codeVerifier,
  });

  const oidcClientSecret = await resolveOidcClientSecretForExecution({
    organizationId: organization.id,
    rawSettings: organization.settings,
  });
  if (oidcClientSecret) {
    tokenBody.set("client_secret", oidcClientSecret);
  }

  const tokenResponse = await fetchOidcEndpoint(oidcEndpoints.token, {
    method: "POST",
    timeoutMs: OIDC_TOKEN_TIMEOUT_MS,
    maxResponseBytes: OIDC_MAX_RESPONSE_BYTES,
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

  const jwksResponse = await fetchOidcEndpoint(oidcEndpoints.jwks, {
    method: "GET",
    timeoutMs: OIDC_TOKEN_TIMEOUT_MS,
    maxResponseBytes: OIDC_MAX_RESPONSE_BYTES,
    headers: { Accept: "application/json" },
  });
  if (!jwksResponse.ok) {
    throw new Error(`OIDC JWKS request failed with status ${jwksResponse.status}`);
  }
  const jwksPayload = (await jwksResponse.json()) as Partial<JSONWebKeySet>;
  if (!Array.isArray(jwksPayload.keys) || jwksPayload.keys.length === 0 || jwksPayload.keys.length > 100) {
    throw new Error("OIDC JWKS response is invalid");
  }
  const jwks = createLocalJWKSet(jwksPayload as JSONWebKeySet);
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
  const providerSubject = principal.providerSubject ?? principal.email;
  const providerIssuer = resolveExternalIdentityIssuer(authSettings, pending.provider);
  const [externalIdentityUser, userByEmail] = await Promise.all([
    findUserByExternalIdentity({
      organizationId: organization.id,
      provider: pending.provider,
      issuer: providerIssuer,
      subject: providerSubject,
    }),
    findUserByEmail(principal.email),
  ]);
  const legacyProviderUser = externalIdentityUser
    ? undefined
    : await findScopedLegacyProviderUser({
        organizationId: organization.id,
        provider: pending.provider,
        subject: providerSubject,
      });
  const userByProvider = externalIdentityUser ?? legacyProviderUser;
  const userByEmailMemberships = userByEmail
    ? await storage.getMembershipsByUserId(userByEmail.id)
    : [];
  const emailMembershipForOrganization = userByEmailMemberships.find(
    (membership) => membership.organizationId === organization.id,
  );
  const emailUserIdentity = userByEmail
    ? await getUserExternalIdentity({
        userId: userByEmail.id,
        organizationId: organization.id,
        provider: pending.provider,
        issuer: providerIssuer,
      })
    : undefined;
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
        providerIssuer,
        providerUserId: userByProvider.id,
        emailUserId: userByEmail.id,
      },
    });
    throw createSsoError("SSO identity is already linked to a different account", 409);
  }

  if (!userByProvider && userByEmail && !emailMembershipForOrganization) {
    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorUserId: userByEmail.id,
      actorName: principal.fullName ?? principal.email,
      action: "auth.sso.jit.denied",
      targetType: "user",
      targetId: userByEmail.id,
      targetUserId: userByEmail.id,
      metadata: {
        reason: "unlinked_email_cross_tenant",
        email: principal.email,
        domain: emailDomain,
        providerSubject,
        providerIssuer,
      },
    });
    throw createSsoError(
      "SSO email matches an account that is not linked to this organization",
      409,
    );
  }

  const existingScopedSubject =
    emailUserIdentity?.subject ??
    (userByEmail &&
    emailMembershipForOrganization &&
    userByEmail.authProvider === pending.provider
      ? userByEmail.authProviderSubject
      : null);
  if (
    userByEmail &&
    existingScopedSubject &&
    existingScopedSubject !== providerSubject
  ) {
    await recordSsoAuditEvent({
      organizationId: organization.id,
      actorUserId: userByEmail.id,
      actorName: principal.fullName ?? principal.email,
      action: "auth.sso.jit.denied",
      targetType: "user",
      targetId: userByEmail.id,
      targetUserId: userByEmail.id,
      metadata: {
        reason: "provider_subject_mismatch",
        email: principal.email,
        domain: emailDomain,
        provider: pending.provider,
        providerIssuer,
        existingProviderSubject: existingScopedSubject,
        attemptedProviderSubject: providerSubject,
      },
    });
    throw createSsoError("SSO identity does not match the linked account", 409);
  }

  if (!userByProvider && userByEmail) {
    const hasOtherExternalIdentity = await hasAnyExternalIdentityForUserInOrganization(
      userByEmail.id,
      organization.id,
    );
    const explicitlyProvisioned =
      emailMembershipForOrganization?.provisioningSource === "manual" ||
      emailMembershipForOrganization?.provisioningSource === "invite";
    const isUnlinkedLocalAccount =
      (!userByEmail.authProvider || userByEmail.authProvider === "local") &&
      !userByEmail.authProviderSubject;
    if (!explicitlyProvisioned || !isUnlinkedLocalAccount || hasOtherExternalIdentity) {
      await recordSsoAuditEvent({
        organizationId: organization.id,
        actorUserId: userByEmail.id,
        actorName: principal.fullName ?? principal.email,
        action: "auth.sso.jit.denied",
        targetType: "user",
        targetId: userByEmail.id,
        targetUserId: userByEmail.id,
        metadata: {
          reason: "explicit_identity_link_required",
          email: principal.email,
          domain: emailDomain,
          provider: pending.provider,
          providerIssuer,
          providerSubject,
        },
      });
      throw createSsoError("SSO identity requires an explicit account link", 409);
    }
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

  await bindExternalIdentity({
    userId: user.id,
    organizationId: organization.id,
    provider: pending.provider,
    issuer: providerIssuer,
    subject: providerSubject,
  });

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
  areInsecureSamlTestFixturesAllowed,
  assertSamlValidationMode,
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
