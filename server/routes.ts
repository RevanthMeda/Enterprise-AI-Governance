import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import {
  adminAuditEvents,
  insertAiSystemSchema,
  insertApprovalWorkflowSchema,
  membershipRoles,
  memberships,
  organizationInvites,
  organizationInviteStatuses,
  organizations,
  userRoles,
  users,
  insertSystemControlSchema,
  insertRiskAssessmentSchema,
  leads,
  marketingEvents,
} from "@shared/schema";
import { db } from "./db";
import {
  buildTotpOtpAuthUrl,
  buildAuthUserPayload,
  buildNextPasswordHistory,
  comparePasswords,
  consumeRecoveryCode,
  generateTotpSecret,
  getPasswordExpiryDate,
  hashPassword,
  issueRecoveryCodes,
  isPasswordReused,
  validatePasswordStrength,
  verifyTotpCode,
} from "./auth";
import { requireAuth } from "./auth";
import { requireOrgRole, requireTenant } from "./tenant";
import { auditService } from "./services/auditService";
import { activityService } from "./services/activityService";
import { backgroundJobService } from "./services/backgroundJobService";
import { calendarService } from "./services/calendarService";
import { controlService } from "./services/controlService";
import { dashboardService } from "./services/dashboardService";
import { domainService } from "./services/domainService";
import { evidenceService } from "./services/evidenceService";
import { exportService, type ExportType } from "./services/exportService";
import { inviteService } from "./services/inviteService";
import { monitoringService } from "./services/monitoringService";
import { notificationService } from "./services/notificationService";
import { riskAssessmentService } from "./services/riskAssessmentService";
import { ssoService } from "./services/ssoService";
import { systemService } from "./services/systemService";
import { workflowService } from "./services/workflowService";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/zip",
  "application/json",
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 200);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const organizationId = req.tenant?.organizationId;
      if (!organizationId) {
        return cb(new Error("Tenant context missing for file upload"), uploadDir);
      }
      const orgUploadDir = path.join(uploadDir, organizationId);
      if (!fs.existsSync(orgUploadDir)) {
        fs.mkdirSync(orgUploadDir, { recursive: true });
      }
      cb(null, orgUploadDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + sanitizeFilename(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

async function notifyAllAdmins(
  organizationId: string,
  title: string,
  message: string,
  type: string,
  entityType?: string,
  entityId?: string,
) {
  const admins = await storage.getUsersByOrganizationRoles(organizationId, [
    "owner",
    "admin",
    "cro",
    "ciso",
    "compliance_lead",
  ]);
  for (const admin of admins) {
    await notificationService.createForUser({
      organizationId,
      userId: admin.id,
      input: {
        title,
        message,
        type,
        entityType: entityType || null,
        entityId: entityId || null,
        read: false,
      },
    });
  }
}

const clientErrorEventSchema = z.object({
  event: z.string().min(1).max(100),
  message: z.string().min(1).max(2000),
  route: z.string().min(1).max(500),
  requestId: z.string().min(1).max(100).nullable().optional(),
  stack: z.string().max(12000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

async function notifyUser(
  organizationId: string,
  userId: string,
  title: string,
  message: string,
  type: string,
  entityType?: string,
  entityId?: string,
) {
  await notificationService.createForUser({
    organizationId,
    userId,
    input: {
      title,
      message,
      type,
      entityType: entityType || null,
      entityId: entityId || null,
      read: false,
    },
  });
}

function mapUserRoleToMembershipRole(username: string, userRole: string): string {
  if (username === "admin") return "owner";
  if (userRole === "admin") return "admin";
  return userRole;
}

async function ensureUserDefaultMembership(user: { id: string; username: string; role: string }) {
  let defaultOrg = await storage.getOrganizationBySlug("default-org");
  if (!defaultOrg) {
    try {
      defaultOrg = await storage.createOrganization({
        slug: "default-org",
        name: "Default Organization",
        status: "active",
        plan: "starter",
        settings: {},
      });
    } catch {
      defaultOrg = await storage.getOrganizationBySlug("default-org");
    }
    if (!defaultOrg) {
      throw new Error("Unable to resolve default organization");
    }
  }

  const memberships = await storage.getMembershipsByUserId(user.id);
  const existing = memberships.find((m) => m.organizationId === defaultOrg.id);
  if (!existing) {
    await storage.createMembership({
      userId: user.id,
      organizationId: defaultOrg.id,
      role: mapUserRoleToMembershipRole(user.username, user.role),
      membershipState: "active",
      isDefault: !memberships.some((m) => m.isDefault && m.membershipState === "active"),
      invitedBy: null,
    });
  }
}

async function buildAndPersistAuthPayload(
  req: Request,
): Promise<Awaited<ReturnType<typeof buildAuthUserPayload>>> {
  await ensureUserDefaultMembership(req.user!);
  const payload = await buildAuthUserPayload(req.user!, req.session.currentOrganizationId);
  req.session.currentOrganizationId = payload.currentOrganizationId ?? undefined;
  return payload;
}

async function regenerateSessionForUser(req: Request, user: Express.User): Promise<void> {
  const existingCsrfToken = req.session?.csrfToken;
  return new Promise((resolve, reject) => {
    req.session.regenerate((sessionErr) => {
      if (sessionErr) return reject(sessionErr);
      req.login(user, (loginErr) => {
        if (loginErr) return reject(loginErr);
        const now = Date.now();
        if (existingCsrfToken) {
          req.session.csrfToken = existingCsrfToken;
        }
        req.session.createdAt = now;
        req.session.lastActivityAt = now;
        resolve();
      });
    });
  });
}

function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const leadCaptureSchema = z.object({
  name: z.string().trim().min(1).max(120),
  workEmail: z.string().trim().email().max(255),
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(120),
  teamSize: z.string().trim().min(1).max(80),
  primaryChallenge: z.string().trim().min(1).max(4000),
  formType: z.enum(["book_demo", "start_pilot"]),
  source: z.string().trim().max(120).optional().nullable(),
  ctaSource: z.string().trim().max(120).optional().nullable(),
  campaign: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const marketingEventSchema = z.object({
  eventName: z.string().trim().min(1).max(120),
  pagePath: z.string().trim().max(500).optional().nullable(),
  section: z.string().trim().max(120).optional().nullable(),
  cta: z.string().trim().max(120).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  campaign: z.string().trim().max(120).optional().nullable(),
  referrer: z.string().trim().max(1000).optional().nullable(),
  metadata: z.record(z.any()).optional(),
});

const onboardingStateSchema = z.object({
  currentStep: z.number().int().min(0).max(10).optional(),
  completedSteps: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  dismissedAlerts: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  snoozedAlerts: z.record(z.string().trim().min(1).max(80), z.string().datetime()).optional(),
});

const inviteRoleOptions = ["owner", ...userRoles] as const;
const assignableMembershipRoles = new Set<string>(inviteRoleOptions);
const inviteStatusOptions = new Set<string>(organizationInviteStatuses);

const createInviteSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(inviteRoleOptions).default("reviewer"),
  expiresInDays: z.number().int().min(1).max(30).default(7),
});

const updateMembershipSchema = z
  .object({
    role: z.enum(inviteRoleOptions).optional(),
    membershipState: z.enum(["active", "inactive"]).optional(),
  })
  .refine((value) => value.role !== undefined || value.membershipState !== undefined, {
    message: "At least one field must be provided",
  });

const acceptInviteSchema = z.object({
  token: z.string().trim().min(20),
  username: z.string().trim().min(3).max(120),
  password: z.string().min(12),
  fullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().optional(),
});

const authModeValues = ["local", "saml", "oidc"] as const;
const ssoDefaultRoleOptions = userRoles;

const orgAuthSettingsPatchSchema = z.object({
  mode: z.enum(authModeValues).optional(),
  ssoUrl: z.string().trim().url().max(1000).nullable().optional(),
  entityId: z.string().trim().max(500).nullable().optional(),
  idpIssuer: z.string().trim().max(500).nullable().optional(),
  certificate: z.string().trim().max(12000).nullable().optional(),
  callbackUrl: z.string().trim().max(1000).nullable().optional(),
  oidcIssuer: z.string().trim().url().max(1000).nullable().optional(),
  oidcAuthorizationUrl: z.string().trim().url().max(1000).nullable().optional(),
  oidcTokenUrl: z.string().trim().url().max(1000).nullable().optional(),
  oidcJwksUrl: z.string().trim().url().max(1000).nullable().optional(),
  oidcClientId: z.string().trim().max(500).nullable().optional(),
  oidcClientSecret: z.string().trim().max(4000).nullable().optional(),
  oidcScopes: z.string().trim().max(500).nullable().optional(),
  allowedDomains: z.array(z.string().trim().min(1).max(255)).max(50).optional(),
  jitProvisioning: z.boolean().optional(),
  enforceSso: z.boolean().optional(),
  strictSamlValidation: z.boolean().optional(),
  defaultRole: z.enum(ssoDefaultRoleOptions).optional(),
});

const updateOrganizationDomainsSchema = z.object({
  domains: z.array(z.string().trim().min(1).max(255)).max(50),
});

const ssoStartSchema = z.object({
  org: z.string().trim().min(1).max(120),
  next: z.string().trim().max(500).optional(),
});

const ssoMockCallbackSchema = z.object({
  state: z.string().trim().min(8).max(200),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(200).optional(),
});

const ssoAcsBodySchema = z.object({
  SAMLResponse: z.string().trim().min(20),
  RelayState: z.string().trim().min(8).max(200),
});

const oidcCallbackQuerySchema = z.object({
  code: z.string().trim().min(3).max(2000),
  state: z.string().trim().min(8).max(200),
});

const oidcMockCallbackSchema = z.object({
  state: z.string().trim().min(8).max(200),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(200).optional(),
  providerSubject: z.string().trim().min(1).max(255).optional(),
});

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
  defaultRole: (typeof ssoDefaultRoleOptions)[number];
};

function normalizeDomains(domains: string[]): string[] {
  const normalized = domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .map((domain) => (domain.startsWith("@") ? domain.slice(1) : domain));
  return Array.from(new Set(normalized));
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

  const parsedMode = rawAuth.mode === "saml" ? "saml" : rawAuth.mode === "oidc" ? "oidc" : "local";
  const parsedAllowedDomains = Array.isArray(rawAuth.allowedDomains)
    ? normalizeDomains(rawAuth.allowedDomains.filter((value): value is string => typeof value === "string"))
    : [];
  const parsedDefaultRole =
    typeof rawAuth.defaultRole === "string" &&
    (ssoDefaultRoleOptions as readonly string[]).includes(rawAuth.defaultRole)
      ? (rawAuth.defaultRole as (typeof ssoDefaultRoleOptions)[number])
      : "reviewer";

  return {
    mode: parsedMode,
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
    allowedDomains: parsedAllowedDomains,
    jitProvisioning: rawAuth.jitProvisioning === true,
    enforceSso: rawAuth.enforceSso === true,
    strictSamlValidation: rawAuth.strictSamlValidation === true,
    defaultRole: parsedDefaultRole,
  };
}

function applyOrgAuthSettings(rawSettings: unknown, authSettings: OrgAuthSettings): Record<string, unknown> {
  const settingsObject =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? { ...(rawSettings as Record<string, unknown>) }
      : {};
  settingsObject.auth = authSettings;
  return settingsObject;
}

function normalizeNextPath(nextPath?: string): string {
  if (!nextPath) return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("//")) return "/";
  return nextPath;
}

type ResolvedSsoOrganization = {
  organization: {
    id: string;
    slug: string;
    name: string;
    settings: unknown;
  };
  availableOrganizationSlugs: string[];
};

async function resolveOrganizationForSso(
  requestedOrg: string,
  actorUserId?: string,
): Promise<ResolvedSsoOrganization | null> {
  const trimmed = requestedOrg.trim();
  if (!trimmed) return null;

  const bySlug = await storage.getOrganizationBySlug(trimmed);
  if (bySlug) {
    return {
      organization: {
        id: bySlug.id,
        slug: bySlug.slug,
        name: bySlug.name,
        settings: bySlug.settings,
      },
      availableOrganizationSlugs: [],
    };
  }

  const [byId] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, trimmed))
    .limit(1);
  if (byId) {
    return {
      organization: byId,
      availableOrganizationSlugs: [],
    };
  }

  if (!actorUserId) return null;

  const membershipsForUser = await storage.getMembershipsByUserId(actorUserId);
  const activeMemberships = membershipsForUser.filter((membership) => membership.membershipState === "active");
  const availableOrganizationSlugs = Array.from(
    new Set(activeMemberships.map((membership) => membership.organizationSlug)),
  );
  const normalizedRequested = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const matchingMembership = activeMemberships.find((membership) => {
    const normalizedSlug = membership.organizationSlug.toLowerCase();
    const normalizedName = membership.organizationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return normalizedSlug === normalizedRequested || normalizedName === normalizedRequested;
  });

  if (!matchingMembership) {
    return {
      organization: {
        id: "",
        slug: "",
        name: "",
        settings: {},
      },
      availableOrganizationSlugs,
    };
  }

  const [byMembership] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name, settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, matchingMembership.organizationId))
    .limit(1);
  if (!byMembership) {
    return {
      organization: {
        id: "",
        slug: "",
        name: "",
        settings: {},
      },
      availableOrganizationSlugs,
    };
  }

  return {
    organization: byMembership,
    availableOrganizationSlugs,
  };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function compactCertificate(pem: string | null): string | null {
  if (!pem) return null;
  const compact = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "")
    .trim();
  return compact || null;
}

function extractSamlPrincipal(samlXml: string): { email: string | null; fullName: string | null } {
  const attributeMap = new Map<string, string[]>();
  const attributeRegex = /<(?:\w+:)?Attribute\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Attribute>/gi;
  let attributeMatch: RegExpExecArray | null;
  while ((attributeMatch = attributeRegex.exec(samlXml)) !== null) {
    const rawAttrs = attributeMatch[1] ?? "";
    const body = attributeMatch[2] ?? "";
    const name = /\bName="([^"]+)"/i.exec(rawAttrs)?.[1];
    const friendlyName = /\bFriendlyName="([^"]+)"/i.exec(rawAttrs)?.[1];
    const keys = [name, friendlyName]
      .filter((key): key is string => Boolean(key))
      .map((key) => key.toLowerCase());
    if (keys.length === 0) continue;

    const values = Array.from(
      body.matchAll(/<(?:\w+:)?AttributeValue\b[^>]*>([\s\S]*?)<\/(?:\w+:)?AttributeValue>/gi),
    )
      .map((match) => decodeXmlEntities((match[1] ?? "").replace(/<[^>]*>/g, "").trim()))
      .filter(Boolean);

    for (const key of keys) {
      const existing = attributeMap.get(key) ?? [];
      for (const value of values) {
        if (!existing.includes(value)) {
          existing.push(value);
        }
      }
      attributeMap.set(key, existing);
    }
  }

  const pickFirst = (keys: string[]): string | null => {
    for (const key of keys) {
      const value = attributeMap.get(key.toLowerCase())?.[0];
      if (value) return value;
    }
    return null;
  };

  const nameId = decodeXmlEntities(
    /<(?:\w+:)?NameID\b[^>]*>([\s\S]*?)<\/(?:\w+:)?NameID>/i.exec(samlXml)?.[1]?.trim() ?? "",
  );
  const email =
    pickFirst([
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn",
      "email",
      "mail",
      "emailaddress",
      "upn",
    ]) ??
    (nameId.includes("@") ? nameId : null);

  const fullName =
    pickFirst([
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname",
      "displayname",
      "name",
      "fullname",
    ]) ??
    (() => {
      const given = pickFirst([
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
        "givenname",
        "firstname",
      ]);
      const family = pickFirst([
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname",
        "surname",
        "lastname",
      ]);
      if (given && family) return `${given} ${family}`;
      return given ?? family ?? null;
    })();

  return { email, fullName };
}

async function recordAdminAuditEvent(input: {
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

async function verifyMfaChallenge(
  user: {
    id: string;
    mfaEnabled: boolean;
    mfaSecret: string | null;
    mfaRecoveryCodes: unknown;
  },
  input: { mfaCode?: string; recoveryCode?: string },
): Promise<
  | { valid: false }
  | {
      valid: true;
      usedRecoveryCode: boolean;
      remainingRecoveryCodes: string[];
    }
> {
  if (!user.mfaEnabled) {
    return { valid: true, usedRecoveryCode: false, remainingRecoveryCodes: [] };
  }

  const mfaCode = getOptionalString(input.mfaCode);
  if (mfaCode && user.mfaSecret && verifyTotpCode(user.mfaSecret, mfaCode)) {
    return { valid: true, usedRecoveryCode: false, remainingRecoveryCodes: [] };
  }

  const recoveryCode = getOptionalString(input.recoveryCode);
  if (recoveryCode) {
    const consumed = await consumeRecoveryCode(recoveryCode, user.mfaRecoveryCodes);
    if (consumed.valid) {
      return {
        valid: true,
        usedRecoveryCode: true,
        remainingRecoveryCodes: consumed.remainingRecoveryCodes,
      };
    }
  }

  return { valid: false };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "ai-control-tower",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/ready", async (_req, res) => {
    try {
      await db.execute(sql`select 1`);
      const queue = await backgroundJobService.getGlobalSummary();
      res.json({
        ok: true,
        ready: true,
        service: "ai-control-tower",
        queue,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      res.setHeader("X-Error-Code", "READINESS_CHECK_FAILED");
      res.status(503).json({
        ok: false,
        ready: false,
        service: "ai-control-tower",
        message: error instanceof Error ? error.message : "Readiness check failed",
        code: "READINESS_CHECK_FAILED",
        timestamp: new Date().toISOString(),
      });
    }
  });

  app.post("/api/monitoring/client-errors", async (req, res) => {
    const parsed = clientErrorEventSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.setHeader("X-Error-Code", "CLIENT_ERROR_PAYLOAD_INVALID");
      return res.status(400).json({
        message: "Invalid client error payload",
        code: "CLIENT_ERROR_PAYLOAD_INVALID",
      });
    }

    const payload = parsed.data;
    await monitoringService.reportClientError({
      level: "error",
      event: payload.event,
      message: payload.message,
      requestId: payload.requestId ?? req.requestId ?? null,
      route: payload.route,
      stack: payload.stack ?? null,
      metadata: payload.metadata ?? null,
    });

    return res.status(202).json({ ok: true });
  });

  app.get("/api/settings", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const user = await storage.getUser(req.user!.id);
    return res.json({
      allowSelfSignup: process.env.ALLOW_SELF_SIGNUP === "true",
      mfaEnabled: Boolean(user?.mfaEnabled),
      currentOrganizationId: req.session.currentOrganizationId ?? null,
    });
  });

  app.patch("/api/settings", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.json({
      ok: true,
      message: "Settings update accepted",
      updates: req.body ?? {},
    });
  });

  app.get(
    "/api/organization/background-jobs",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const rawStatus = req.query.status;
      const requestedStatus =
        typeof rawStatus === "string"
          ? rawStatus
          : Array.isArray(rawStatus)
            ? rawStatus[0]
            : "failed";
      const status =
        requestedStatus === "pending" ||
        requestedStatus === "processing" ||
        requestedStatus === "succeeded" ||
        requestedStatus === "failed"
          ? requestedStatus
          : "failed";
      const requestedLimit = Number(req.query.limit);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 10;

      const [summary, jobs] = await Promise.all([
        backgroundJobService.getJobSummaryForOrganization(req.tenant!.organizationId),
        backgroundJobService.getJobsForOrganization({
          organizationId: req.tenant!.organizationId,
          status,
          limit,
        }),
      ]);

      return res.json({ summary, jobs });
    },
  );

  app.post(
    "/api/organization/background-jobs/:jobId/retry",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
      const retried = await backgroundJobService.retryFailedJobForOrganization(
        req.tenant!.organizationId,
        jobId,
      );

      if (!retried) {
        return res.status(404).json({ message: "Background job not found" });
      }

      await db.insert(adminAuditEvents).values({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user?.id ?? null,
        actorName: req.user?.fullName || req.user?.username || "Unknown actor",
        action: "background_job.retried",
        targetType: "background_job",
        targetId: retried.id,
        metadata: {
          jobType: retried.type,
          previousStatus: "failed",
        },
      });

      return res.json({ ok: true, job: retried });
    },
  );

  app.get(
    "/api/organization/auth-settings",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const organization = await storage.getOrganizationById(req.tenant!.organizationId);

      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const authSettings = getOrgAuthSettings(organization.settings);
      const allowedDomains = await domainService.getAllowedDomainsForOrganization(organization);

      return res.json({
        ...authSettings,
        allowedDomains,
      });
    },
  );

  app.patch(
    "/api/organization/auth-settings",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const parsed = orgAuthSettingsPatchSchema.parse(req.body ?? {});
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);

        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const current = {
          ...getOrgAuthSettings(organization.settings),
          allowedDomains: await domainService.getAllowedDomainsForOrganization(organization),
        };
        const requestedAllowedDomains =
          parsed.allowedDomains === undefined
            ? current.allowedDomains
            : domainService.normalizeInputDomains(parsed.allowedDomains);
        const updated: OrgAuthSettings = {
          ...current,
          mode: parsed.mode ?? current.mode,
          ssoUrl: parsed.ssoUrl === undefined ? current.ssoUrl : parsed.ssoUrl,
          entityId: parsed.entityId === undefined ? current.entityId : parsed.entityId,
          idpIssuer: parsed.idpIssuer === undefined ? current.idpIssuer : parsed.idpIssuer,
          certificate: parsed.certificate === undefined ? current.certificate : parsed.certificate,
          callbackUrl: parsed.callbackUrl === undefined ? current.callbackUrl : parsed.callbackUrl,
          oidcIssuer: parsed.oidcIssuer === undefined ? current.oidcIssuer : parsed.oidcIssuer,
          oidcAuthorizationUrl:
            parsed.oidcAuthorizationUrl === undefined ? current.oidcAuthorizationUrl : parsed.oidcAuthorizationUrl,
          oidcTokenUrl: parsed.oidcTokenUrl === undefined ? current.oidcTokenUrl : parsed.oidcTokenUrl,
          oidcJwksUrl: parsed.oidcJwksUrl === undefined ? current.oidcJwksUrl : parsed.oidcJwksUrl,
          oidcClientId: parsed.oidcClientId === undefined ? current.oidcClientId : parsed.oidcClientId,
          oidcClientSecret:
            parsed.oidcClientSecret === undefined ? current.oidcClientSecret : parsed.oidcClientSecret,
          oidcScopes: parsed.oidcScopes === undefined ? current.oidcScopes : parsed.oidcScopes ?? "openid profile email",
          allowedDomains: requestedAllowedDomains,
          jitProvisioning: parsed.jitProvisioning ?? current.jitProvisioning,
          enforceSso: parsed.enforceSso ?? current.enforceSso,
          strictSamlValidation: parsed.strictSamlValidation ?? current.strictSamlValidation,
          defaultRole: parsed.defaultRole ?? current.defaultRole,
        };

        if (updated.mode === "local") {
          updated.enforceSso = false;
          updated.strictSamlValidation = false;
        }
        if (updated.mode === "saml" && !updated.ssoUrl) {
          return res.status(400).json({ message: "SSO URL is required when mode is saml" });
        }
        if (updated.mode === "saml" && updated.strictSamlValidation && !updated.certificate) {
          return res.status(400).json({ message: "IdP certificate is required when strict SAML validation is enabled" });
        }
        if (
          updated.mode === "oidc" &&
          (!updated.oidcIssuer ||
            !updated.oidcAuthorizationUrl ||
            !updated.oidcTokenUrl ||
            !updated.oidcJwksUrl ||
            !updated.oidcClientId)
        ) {
          return res.status(400).json({
            message: "OIDC issuer, authorization URL, token URL, JWKS URL, and client ID are required when mode is oidc",
          });
        }
        if (updated.mode !== "saml") {
          updated.strictSamlValidation = false;
        }

        if (parsed.allowedDomains !== undefined) {
          const storedDomains = await domainService.replaceAllowedDomains(organization.id, updated.allowedDomains);
          updated.allowedDomains = storedDomains.map((entry) => entry.domain);
        }

        await db
          .update(organizations)
          .set({
            settings: applyOrgAuthSettings(organization.settings, updated),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, organization.id));

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.auth_settings.updated",
          targetType: "organization",
          targetId: organization.id,
          metadata: {
            mode: updated.mode,
            enforceSso: updated.enforceSso,
            strictSamlValidation: updated.strictSamlValidation,
            allowedDomainsCount: updated.allowedDomains.length,
            jitProvisioning: updated.jitProvisioning,
            defaultRole: updated.defaultRole,
          },
        });

        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update auth settings" });
      }
    },
  );

  app.get(
    "/api/organization/domains",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      const buildDomainResponse = (
        storedDomains: Array<{ id: string; domain: string; isVerified: boolean; isPrimary: boolean }>,
        fallbackDomains: string[] = [],
      ) => ({
        domains: storedDomains.length > 0 ? storedDomains.map((entry) => entry.domain) : fallbackDomains,
        entries:
          storedDomains.length > 0
            ? storedDomains.map((entry) => ({
                id: entry.id,
                domain: entry.domain,
                isVerified: entry.isVerified,
                isPrimary: entry.isPrimary,
                verificationRecordName: domainService.getVerificationRecordName(entry.domain),
                verificationRecordValue: domainService.getVerificationRecordValue((entry as any).verificationToken),
                verifiedAt: (entry as any).verifiedAt ?? null,
              }))
            : fallbackDomains.map((domain, index) => ({
                id: null,
                domain,
                isVerified: false,
                isPrimary: index === 0,
                verificationRecordName: null,
                verificationRecordValue: null,
                verifiedAt: null,
              })),
        source: storedDomains.length > 0 ? "table" : fallbackDomains.length > 0 ? "legacy" : "none",
      });

      const organization = await storage.getOrganizationById(req.tenant!.organizationId);
      if (!organization) {
        return res.status(404).json({ message: "Organization not found" });
      }

      const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
      const domains =
        storedDomains.length > 0
          ? storedDomains.map((entry) => entry.domain)
          : await domainService.getAllowedDomainsForOrganization(organization);

      return res.json(buildDomainResponse(storedDomains, domains));
    },
  );

  app.put(
    "/api/organization/domains",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const parsed = updateOrganizationDomainsSchema.parse(req.body ?? {});
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);

        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domains = domainService.normalizeInputDomains(parsed.domains);
        const existingDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const storedDomains = await domainService.replaceAllowedDomains(
          organization.id,
          domains.map((domain, index) => {
            const existing = existingDomains.find((entry) => entry.domain === domain);
            return {
              id: existing?.id,
              domain,
              isVerified: existing?.isVerified ?? false,
              isPrimary: existing?.isPrimary ?? index === 0,
              verificationToken: existing?.verificationToken,
              verifiedAt: existing?.verifiedAt ?? null,
              createdAt: existing?.createdAt,
            };
          }),
        );
        const authSettings = {
          ...getOrgAuthSettings(organization.settings),
          allowedDomains: storedDomains.map((entry) => entry.domain),
        };

        await db
          .update(organizations)
          .set({
            settings: applyOrgAuthSettings(organization.settings, authSettings),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, organization.id));

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domains.updated",
          targetType: "organization",
          targetId: organization.id,
          metadata: {
            domains: storedDomains.map((entry) => entry.domain),
            domainsCount: storedDomains.length,
          },
        });

        return res.json({
          domains: storedDomains.map((entry) => entry.domain),
          entries: storedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationRecordName: domainService.getVerificationRecordName(entry.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(entry.verificationToken),
            verifiedAt: entry.verifiedAt ?? null,
          })),
          source: "table",
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update organization domains" });
      }
    },
  );

  app.patch(
    "/api/organization/domains/:domainId",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const parsed = z.object({
          isPrimary: z.literal(true),
        }).parse(req.body ?? {});

        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domainId = routeParam(req.params.domainId);
        const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const targetDomain = storedDomains.find((entry) => entry.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ message: "Organization domain not found" });
        }

        const nextDomains = storedDomains.map((entry) => ({
          id: entry.id,
          domain: entry.domain,
          isVerified: entry.isVerified,
          isPrimary: entry.id === domainId,
          verificationToken: entry.verificationToken,
          verifiedAt: entry.verifiedAt ?? null,
          createdAt: entry.createdAt,
        }));

        const updatedDomains = await domainService.replaceAllowedDomains(organization.id, nextDomains);
        const authSettings = {
          ...getOrgAuthSettings(organization.settings),
          allowedDomains: updatedDomains.map((entry) => entry.domain),
        };

        await db
          .update(organizations)
          .set({
            settings: applyOrgAuthSettings(organization.settings, authSettings),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, organization.id));

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domain.primary_updated",
          targetType: "organization_domain",
          targetId: targetDomain.id,
          metadata: {
            domain: targetDomain.domain,
            isVerified: targetDomain.isVerified,
            isPrimary: true,
          },
        });

        return res.json({
          domains: updatedDomains.map((entry) => entry.domain),
          entries: updatedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationRecordName: domainService.getVerificationRecordName(entry.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(entry.verificationToken),
            verifiedAt: entry.verifiedAt ?? null,
          })),
          source: "table",
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update organization domain" });
      }
    },
  );

  app.post(
    "/api/organization/domains/:domainId/verify",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domainId = routeParam(req.params.domainId);
        const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const targetDomain = storedDomains.find((entry) => entry.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ message: "Organization domain not found" });
        }

        const isVerified = await domainService.verifyDomainOwnership(targetDomain);
        if (!isVerified) {
          return res.status(409).json({
            message: "Verification TXT record not found",
            verificationRecordName: domainService.getVerificationRecordName(targetDomain.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(targetDomain.verificationToken),
          });
        }

        const updatedDomains = await domainService.replaceAllowedDomains(
          organization.id,
          storedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.id === domainId ? true : entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationToken: entry.verificationToken,
            verifiedAt: entry.id === domainId ? new Date() : entry.verifiedAt ?? null,
            createdAt: entry.createdAt,
          })),
        );

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domain.verified",
          targetType: "organization_domain",
          targetId: targetDomain.id,
          metadata: {
            domain: targetDomain.domain,
            verificationRecordName: domainService.getVerificationRecordName(targetDomain.domain),
          },
        });

        return res.json({
          domains: updatedDomains.map((entry) => entry.domain),
          entries: updatedDomains.map((entry) => ({
            id: entry.id,
            domain: entry.domain,
            isVerified: entry.isVerified,
            isPrimary: entry.isPrimary,
            verificationRecordName: domainService.getVerificationRecordName(entry.domain),
            verificationRecordValue: domainService.getVerificationRecordValue(entry.verificationToken),
            verifiedAt: entry.verifiedAt ?? null,
          })),
          source: "table",
        });
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to verify organization domain" });
      }
    },
  );

  app.delete(
    "/api/organization/domains/:domainId",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin"),
    async (req, res) => {
      try {
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }

        const domainId = routeParam(req.params.domainId);
        const storedDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const targetDomain = storedDomains.find((entry) => entry.id === domainId);
        if (!targetDomain) {
          return res.status(404).json({ message: "Organization domain not found" });
        }

        await storage.deleteOrganizationDomainByIdForOrg(organization.id, domainId);

        const remainingDomains = await domainService.getStoredOrganizationDomains(organization.id);
        const rebalancedDomains =
          remainingDomains.length > 0
            ? await domainService.replaceAllowedDomains(
                organization.id,
                remainingDomains.map((entry, index) => ({
                  id: entry.id,
                  domain: entry.domain,
                  isVerified: entry.isVerified,
                  isPrimary: entry.isPrimary || index === 0,
                  verificationToken: entry.verificationToken,
                  verifiedAt: entry.verifiedAt ?? null,
                  createdAt: entry.createdAt,
                })),
              )
            : [];

        const authSettings = {
          ...getOrgAuthSettings(organization.settings),
          allowedDomains: rebalancedDomains.map((entry) => entry.domain),
        };

        await db
          .update(organizations)
          .set({
            settings: applyOrgAuthSettings(organization.settings, authSettings),
            updatedAt: new Date(),
          })
          .where(eq(organizations.id, organization.id));

        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName || req.user!.username,
          action: "organization.domain.deleted",
          targetType: "organization_domain",
          targetId: targetDomain.id,
          metadata: {
            domain: targetDomain.domain,
            remainingDomains: rebalancedDomains.map((entry) => entry.domain),
          },
        });

        return res.status(204).send();
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to delete organization domain" });
      }
    },
  );

  app.get("/api/auth/sso/metadata", async (req, res) => {
    const rawOrg = Array.isArray(req.query.org) ? req.query.org[0] : req.query.org;
    const requestedOrg = getOptionalString(rawOrg);
    if (!requestedOrg) {
      return res.status(400).json({ message: "org is required" });
    }

    const resolved = await ssoService.resolveOrganizationForSso(
      requestedOrg,
      req.isAuthenticated?.() ? req.user?.id : undefined,
    );
    if (!resolved.organization) {
      const response: { message: string; availableOrganizationSlugs?: string[] } = {
        message: "Organization not found",
      };
      if (resolved.availableOrganizationSlugs.length) {
        response.availableOrganizationSlugs = resolved.availableOrganizationSlugs;
      }
      return res.status(404).json(response);
    }

    const authSettings = ssoService.getOrgAuthSettings(resolved.organization.settings);
    if (authSettings.mode !== "saml") {
      return res.status(400).json({ message: "Organization is not configured for SAML" });
    }

    const host = req.get("host");
    if (!host) {
      return res.status(400).json({ message: "Unable to resolve request host for SAML metadata" });
    }

    const metadataXml = await ssoService.buildMetadataXml(
      resolved.organization,
      `${req.protocol}://${host}`,
    );

    res.status(200).setHeader("Content-Type", "application/samlmetadata+xml");
    return res.send(metadataXml);
  });

  app.get("/api/auth/sso/start", async (req, res) => {
    try {
      const parsed = ssoStartSchema.parse({
        org: Array.isArray(req.query.org) ? req.query.org[0] : req.query.org,
        next: Array.isArray(req.query.next) ? req.query.next[0] : req.query.next,
      });
      const nextPath = ssoService.normalizeNextPath(parsed.next);
      const started = await ssoService.startLogin(
        parsed.org,
        nextPath,
        req.isAuthenticated?.() ? req.user?.id : undefined,
      );
      (req.session as any).ssoPending = started.pending;
      return res.redirect(302, started.redirectUrl);
    } catch (err: any) {
      if (err?.message === "Organization is not configured for SSO") {
        const requestedNext = Array.isArray(req.query.next) ? req.query.next[0] : req.query.next;
        return res.redirect(`/auth/login?next=${encodeURIComponent(ssoService.normalizeNextPath(getOptionalString(requestedNext) ?? undefined))}`);
      }
      if (err?.message === "Organization not found") {
        return res.status(404).json({
          message: err.message,
          availableOrganizationSlugs: err.availableOrganizationSlugs ?? [],
        });
      }
      return res.status(400).json({ message: err.message || "Invalid SSO start request" });
    }
  });

  app.get("/api/auth/oidc/start", async (req, res) => {
    try {
      const parsed = ssoStartSchema.parse({
        org: Array.isArray(req.query.org) ? req.query.org[0] : req.query.org,
        next: Array.isArray(req.query.next) ? req.query.next[0] : req.query.next,
      });
      const nextPath = ssoService.normalizeNextPath(parsed.next);
      const started = await ssoService.startOidcLogin(
        parsed.org,
        nextPath,
        req.isAuthenticated?.() ? req.user?.id : undefined,
        req.protocol,
        req.get("host"),
      );
      (req.session as any).ssoPending = started.pending;
      return res.redirect(302, started.redirectUrl);
    } catch (err: any) {
      if (err?.message === "Organization is not configured for OIDC") {
        const requestedNext = Array.isArray(req.query.next) ? req.query.next[0] : req.query.next;
        return res.redirect(
          `/auth/login?next=${encodeURIComponent(ssoService.normalizeNextPath(getOptionalString(requestedNext) ?? undefined))}`,
        );
      }
      if (err?.message === "Organization not found") {
        return res.status(404).json({
          message: err.message,
          availableOrganizationSlugs: err.availableOrganizationSlugs ?? [],
        });
      }
      return res.status(400).json({ message: err.message || "Invalid OIDC start request" });
    }
  });

  app.post("/api/auth/sso/callback", async (req, res) => {
    try {
      const relayState = getOptionalString(req.body?.RelayState);
      const samlResponse = getOptionalString(req.body?.SAMLResponse);
      const parsed = ssoAcsBodySchema.parse({
        RelayState: relayState,
        SAMLResponse: samlResponse,
      });

      const pending = (req.session as any).ssoPending as import("./services/ssoService").SsoPendingState | undefined;
      try {
        ssoService.assertPendingState(pending, parsed.RelayState);
      } catch (stateError: any) {
        if (stateError?.message === "SSO state has expired") {
          (req.session as any).ssoPending = undefined;
        }
        return res.status(400).json({ message: stateError?.message || "SSO state is invalid or missing" });
      }

      if (pending?.provider !== "saml") {
        (req.session as any).ssoPending = undefined;
        return res.status(400).json({ message: "SSO state is invalid or missing" });
      }

      const organization = await storage.getOrganizationById(pending!.organizationId);
      if (!organization) {
        (req.session as any).ssoPending = undefined;
        return res.status(404).json({ message: "Organization not found" });
      }

      const principal = await ssoService.buildPrincipalFromCallback(
        {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
          settings: organization.settings,
        },
        parsed.RelayState,
        parsed.SAMLResponse,
        req.protocol,
        req.get("host"),
      );

      if (!principal.email) {
        (req.session as any).ssoPending = undefined;
        return res.status(400).json({ message: "SAML response did not include a usable email claim" });
      }

      let completed;
      try {
        completed = await ssoService.completeLogin(pending!, {
          email: principal.email,
          fullName: principal.fullName,
          providerSubject: principal.providerSubject,
          externalGroup: principal.externalGroup,
        });
      } catch (completionError: any) {
        (req.session as any).ssoPending = undefined;
        const message = completionError?.message || "Failed to complete SSO callback";
        const derivedStatus =
          message === "Organization not found"
            ? 404
            : message === "Email domain is not allowed for this organization" ||
                message === "JIT user provisioning is disabled for this organization"
              ? 403
              : 400;
        const status = completionError?.status ?? derivedStatus;
        return res.status(status).json({ message });
      }

      await regenerateSessionForUser(req, completed.user);
      req.session.currentOrganizationId = completed.organization.id;
      (req.session as any).ssoPending = undefined;

      const authUser = await buildAndPersistAuthPayload(req);
      return res.json({
        ok: true,
        next: completed.next,
        user: authUser,
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to complete SSO callback" });
    }
  });

  app.post("/api/auth/sso/mock-callback", async (req, res) => {
    try {
      const parsed = ssoMockCallbackSchema.parse(req.body ?? {});
      const pending = (req.session as any).ssoPending as import("./services/ssoService").SsoPendingState | undefined;
      try {
        ssoService.assertPendingState(pending, parsed.state);
      } catch (stateError: any) {
        if (stateError?.message === "SSO state has expired") {
          (req.session as any).ssoPending = undefined;
        }
        return res.status(400).json({ message: stateError?.message || "SSO state is invalid or missing" });
      }

      if (pending?.provider !== "saml") {
        (req.session as any).ssoPending = undefined;
        return res.status(400).json({ message: "SSO state is invalid or missing" });
      }

      let completed;
      try {
        completed = await ssoService.completeLogin(pending!, {
          email: parsed.email,
          fullName: parsed.fullName,
          providerSubject: parsed.email,
        });
      } catch (completionError: any) {
        (req.session as any).ssoPending = undefined;
        const message = completionError?.message || "Failed to complete SSO callback";
        const derivedStatus =
          message === "Organization not found"
            ? 404
            : message === "Email domain is not allowed for this organization" ||
                message === "JIT user provisioning is disabled for this organization"
              ? 403
              : 400;
        const status = completionError?.status ?? derivedStatus;
        return res.status(status).json({ message });
      }

      await regenerateSessionForUser(req, completed.user);
      req.session.currentOrganizationId = completed.organization.id;
      (req.session as any).ssoPending = undefined;

      const authUser = await buildAndPersistAuthPayload(req);
      return res.json({
        ok: true,
        next: completed.next,
        user: authUser,
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to complete SSO callback" });
    }
  });

  app.get("/api/auth/oidc/callback", async (req, res) => {
    try {
      const parsed = oidcCallbackQuerySchema.parse({
        code: Array.isArray(req.query.code) ? req.query.code[0] : req.query.code,
        state: Array.isArray(req.query.state) ? req.query.state[0] : req.query.state,
      });
      const pending = (req.session as any).ssoPending as import("./services/ssoService").SsoPendingState | undefined;
      try {
        ssoService.assertPendingState(pending, parsed.state);
      } catch (stateError: any) {
        if (stateError?.message === "SSO state has expired") {
          (req.session as any).ssoPending = undefined;
        }
        return res.status(400).json({ message: stateError?.message || "OIDC state is invalid or missing" });
      }

      if (pending?.provider !== "oidc") {
        (req.session as any).ssoPending = undefined;
        return res.status(400).json({ message: "OIDC state is invalid or missing" });
      }

      const organization = await storage.getOrganizationById(pending.organizationId);
      if (!organization) {
        (req.session as any).ssoPending = undefined;
        return res.status(404).json({ message: "Organization not found" });
      }

      const principal = await ssoService.buildPrincipalFromOidcCallback(
        {
          id: organization.id,
          slug: organization.slug,
          name: organization.name,
          settings: organization.settings,
        },
        pending,
        parsed.code,
        req.protocol,
        req.get("host"),
      );

      if (!principal.email) {
        (req.session as any).ssoPending = undefined;
        return res.status(400).json({ message: "OIDC token did not include a usable email claim" });
      }

      let completed;
      try {
        completed = await ssoService.completeLogin(pending, {
          email: principal.email,
          fullName: principal.fullName,
          providerSubject: principal.providerSubject,
          externalGroup: principal.externalGroup,
        });
      } catch (completionError: any) {
        (req.session as any).ssoPending = undefined;
        const message = completionError?.message || "Failed to complete OIDC callback";
        const derivedStatus =
          message === "Organization not found"
            ? 404
            : message === "Email domain is not allowed for this organization" ||
                message === "JIT user provisioning is disabled for this organization"
              ? 403
              : 400;
        const status = completionError?.status ?? derivedStatus;
        return res.status(status).json({ message });
      }

      await regenerateSessionForUser(req, completed.user);
      req.session.currentOrganizationId = completed.organization.id;
      (req.session as any).ssoPending = undefined;

      const authUser = await buildAndPersistAuthPayload(req);
      return res.json({
        ok: true,
        next: completed.next,
        user: authUser,
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to complete OIDC callback" });
    }
  });

  app.post("/api/auth/oidc/mock-callback", async (req, res) => {
    try {
      const parsed = oidcMockCallbackSchema.parse(req.body ?? {});
      const pending = (req.session as any).ssoPending as import("./services/ssoService").SsoPendingState | undefined;
      try {
        ssoService.assertPendingState(pending, parsed.state);
      } catch (stateError: any) {
        if (stateError?.message === "SSO state has expired") {
          (req.session as any).ssoPending = undefined;
        }
        return res.status(400).json({ message: stateError?.message || "OIDC state is invalid or missing" });
      }

      if (pending?.provider !== "oidc") {
        (req.session as any).ssoPending = undefined;
        return res.status(400).json({ message: "OIDC state is invalid or missing" });
      }

      let completed;
      try {
        completed = await ssoService.completeLogin(pending, {
          email: parsed.email,
          fullName: parsed.fullName,
          providerSubject: parsed.providerSubject ?? parsed.email,
        });
      } catch (completionError: any) {
        (req.session as any).ssoPending = undefined;
        const message = completionError?.message || "Failed to complete OIDC callback";
        const derivedStatus =
          message === "Organization not found"
            ? 404
            : message === "Email domain is not allowed for this organization" ||
                message === "JIT user provisioning is disabled for this organization"
              ? 403
              : 400;
        const status = completionError?.status ?? derivedStatus;
        return res.status(status).json({ message });
      }

      await regenerateSessionForUser(req, completed.user);
      req.session.currentOrganizationId = completed.organization.id;
      (req.session as any).ssoPending = undefined;

      const authUser = await buildAndPersistAuthPayload(req);
      return res.json({
        ok: true,
        next: completed.next,
        user: authUser,
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to complete OIDC callback" });
    }
  });

  app.get("/api/organization/members", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const rows = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        username: users.username,
        fullName: users.fullName,
        email: users.email,
        role: memberships.role,
        membershipState: memberships.membershipState,
        isDefault: memberships.isDefault,
        createdAt: memberships.createdAt,
        updatedAt: memberships.updatedAt,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.organizationId, req.tenant!.organizationId))
      .orderBy(asc(users.fullName), asc(users.username));

    return res.json(rows);
  });

  app.patch("/api/organization/members/:membershipId", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = updateMembershipSchema.parse(req.body);
      const membershipId = routeParam(req.params.membershipId);

      const [targetMembership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.id, membershipId), eq(memberships.organizationId, req.tenant!.organizationId)))
        .limit(1);

      if (!targetMembership) {
        return res.status(404).json({ message: "Membership not found" });
      }

      if (targetMembership.role === "owner" && req.tenant!.membershipRole !== "owner") {
        return res.status(403).json({ message: "Only organization owners can modify owner memberships" });
      }

      if (parsed.role === "owner" && req.tenant!.membershipRole !== "owner") {
        return res.status(403).json({ message: "Only organization owners can assign owner role" });
      }

      if (parsed.role && !assignableMembershipRoles.has(parsed.role)) {
        return res.status(400).json({ message: "Unsupported membership role" });
      }

      if (targetMembership.userId === req.user!.id && parsed.membershipState && parsed.membershipState !== "active") {
        return res.status(400).json({ message: "Cannot deactivate your own membership" });
      }

      const [updated] = await db
        .update(memberships)
        .set({
          role: parsed.role ?? targetMembership.role,
          membershipState: parsed.membershipState ?? targetMembership.membershipState,
          updatedAt: new Date(),
        })
        .where(eq(memberships.id, membershipId))
        .returning();

      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        action: "membership.updated",
        targetType: "membership",
        targetId: membershipId,
        targetUserId: targetMembership.userId,
        metadata: {
          previousRole: targetMembership.role,
          nextRole: updated.role,
          previousState: targetMembership.membershipState,
          nextState: updated.membershipState,
        },
      });

      return res.json(updated);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update membership" });
    }
  });

  app.get("/api/organization/invites", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const invites = await inviteService.listInvites(req.tenant!.organizationId);
    return res.json(invites);
  });

  app.post("/api/organization/invites", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = createInviteSchema.parse(req.body);
      const result = await inviteService.createInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        email: parsed.email,
        role: parsed.role,
        expiresInDays: parsed.expiresInDays,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to create invite" });
    }
  });

  app.post("/api/organization/invites/:inviteId/resend", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const result = await inviteService.resendInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        inviteId: routeParam(req.params.inviteId),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to resend invite" });
    }
  });

  app.post("/api/organization/invites/:inviteId/revoke", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const result = await inviteService.revokeInvite({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName || req.user!.username,
        inviteId: routeParam(req.params.inviteId),
      });
      return res.json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to revoke invite" });
    }
  });

  app.get("/api/organization/invites/preview", async (req, res) => {
    const rawToken = req.query.token;
    const token = getOptionalString(Array.isArray(rawToken) ? rawToken[0] : rawToken);
    if (!token) {
      return res.status(400).json({ message: "Invite token is required" });
    }

    try {
      const preview = await inviteService.previewInvite(token);
      return res.json(preview);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to preview invite" });
    }
  });

  app.post("/api/organization/invites/accept", async (req, res) => {
    try {
      const parsed = acceptInviteSchema.parse(req.body);
      const result = await inviteService.acceptInvite({
        token: parsed.token,
        username: parsed.username,
        password: parsed.password,
        fullName: parsed.fullName,
        email: parsed.email,
      });
      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json({ message: err.message || "Failed to accept invite" });
    }
  });

  app.get("/api/organization/admin-audit", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const rows = await db
      .select()
      .from(adminAuditEvents)
      .where(eq(adminAuditEvents.organizationId, req.tenant!.organizationId))
      .orderBy(desc(adminAuditEvents.createdAt))
      .limit(200);
    return res.json(rows);
  });

  app.post("/api/auth/register", async (req, res) => {
    if (process.env.ALLOW_SELF_SIGNUP !== "true") {
      return res.status(403).json({ message: "Self-service registration is disabled" });
    }
    try {
      const { username, password, fullName, email } = req.body;
      if (!username || !password || !fullName) {
        return res.status(400).json({ message: "Username, password, and full name are required" });
      }
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const allUsers = await storage.getAllUsers();
      const assignedRole = allUsers.length === 0 ? "admin" : "reviewer";
      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashed,
        fullName,
        email: email || null,
        role: assignedRole,
      });
      const loginUser: Express.User = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      };
      try {
        await regenerateSessionForUser(req, loginUser);
        const authPayload = await buildAndPersistAuthPayload(req);
        return res.status(201).json(authPayload);
      } catch (authErr: any) {
        return res.status(500).json({ message: authErr.message || "Login failed after registration" });
      }
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        if (info?.message === "RATE_LIMITED") {
          return res.status(429).json({ message: "Too many login attempts. Try again in 5 minutes." });
        }
        if (info?.message === "PASSWORD_EXPIRED") {
          return res.status(403).json({ message: "Password expired. Reset required before login." });
        }
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      Promise.resolve()
        .then(async () => {
          const storedUser = await storage.getUser(user.id);
          if (!storedUser) {
            return res.status(401).json({ message: "Invalid credentials" });
          }

          const requestedOrgSlug = getOptionalString(req.body?.organizationSlug);
          const requestedOrgId = getOptionalString(req.body?.organizationId);
          const requestedNext = normalizeNextPath(getOptionalString(req.body?.next));
          const configuredBreakGlassToken = getOptionalString(process.env.BREAK_GLASS_TOKEN);
          const suppliedBreakGlassToken = getOptionalString(req.body?.breakGlassToken);
          const breakGlassAllowed =
            Boolean(configuredBreakGlassToken) && suppliedBreakGlassToken === configuredBreakGlassToken;

          const membershipRows = await db
            .select({
              membershipId: memberships.id,
              organizationId: memberships.organizationId,
              membershipState: memberships.membershipState,
              isDefault: memberships.isDefault,
              organizationSlug: organizations.slug,
              organizationSettings: organizations.settings,
            })
            .from(memberships)
            .innerJoin(organizations, eq(memberships.organizationId, organizations.id))
            .where(eq(memberships.userId, storedUser.id));

          const activeMemberships = membershipRows.filter((membership) => membership.membershipState === "active");
          let selectedMembership = activeMemberships[0];
          if (requestedOrgId) {
            selectedMembership =
              activeMemberships.find((membership) => membership.organizationId === requestedOrgId) ?? selectedMembership;
          }
          if (requestedOrgSlug) {
            const normalizedRequestedSlug = requestedOrgSlug.toLowerCase();
            selectedMembership =
              activeMemberships.find((membership) => membership.organizationSlug.toLowerCase() === normalizedRequestedSlug) ??
              selectedMembership;
          }
          if (req.session.currentOrganizationId) {
            selectedMembership =
              activeMemberships.find((membership) => membership.organizationId === req.session.currentOrganizationId) ??
              selectedMembership;
          }
          selectedMembership =
            activeMemberships.find((membership) => membership.isDefault) ?? selectedMembership;

          if (selectedMembership) {
            const selectedAuthSettings = getOrgAuthSettings(selectedMembership.organizationSettings);
            if (
              (selectedAuthSettings.mode === "saml" || selectedAuthSettings.mode === "oidc") &&
              selectedAuthSettings.enforceSso &&
              !breakGlassAllowed
            ) {
              const authStartPath =
                selectedAuthSettings.mode === "oidc" ? "/api/auth/oidc/start" : "/api/auth/sso/start";
              return res.status(403).json({
                message: "Password login is disabled for this organization. Use SSO.",
                ssoRequired: true,
                ssoStartUrl: `${authStartPath}?org=${encodeURIComponent(
                  selectedMembership.organizationSlug,
                )}&next=${encodeURIComponent(requestedNext)}`,
              });
            }
          }

          if (storedUser.mfaEnabled) {
            if (!storedUser.mfaSecret) {
              return res.status(500).json({ message: "MFA is enabled but not configured correctly" });
            }

            const mfaResult = await verifyMfaChallenge(
              {
                id: storedUser.id,
                mfaEnabled: storedUser.mfaEnabled,
                mfaSecret: storedUser.mfaSecret,
                mfaRecoveryCodes: storedUser.mfaRecoveryCodes,
              },
              {
                mfaCode: req.body?.mfaCode,
                recoveryCode: req.body?.recoveryCode,
              },
            );

            if (!mfaResult.valid) {
              return res.status(401).json({ message: "MFA verification required", mfaRequired: true });
            }

            if (mfaResult.usedRecoveryCode) {
              await storage.updateUserMfa(storedUser.id, {
                mfaEnabled: true,
                mfaSecret: storedUser.mfaSecret,
                mfaRecoveryCodes: mfaResult.remainingRecoveryCodes,
              });
            }
          }

          await regenerateSessionForUser(req, user);
          const authPayload = await buildAndPersistAuthPayload(req);
          return res.json(authPayload);
        })
        .catch((loginErr) => next(loginErr));
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      req.session.destroy((destroyErr) => {
        if (destroyErr) return res.status(500).json({ message: "Logout failed" });
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out" });
      });
    });
  });

  app.post("/api/track", async (req, res) => {
    const parsed = marketingEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid tracking payload" });
    }

    try {
      await db.insert(marketingEvents).values({
        eventName: parsed.data.eventName,
        pagePath: parsed.data.pagePath ?? null,
        section: parsed.data.section ?? null,
        cta: parsed.data.cta ?? null,
        source: parsed.data.source ?? null,
        campaign: parsed.data.campaign ?? null,
        referrer: parsed.data.referrer ?? null,
        metadata: parsed.data.metadata ?? {},
      });
      return res.status(201).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to record event" });
    }
  });

  app.post("/api/leads", async (req, res) => {
    const parsed = leadCaptureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid lead payload" });
    }

    try {
      const [lead] = await db
        .insert(leads)
        .values({
          name: parsed.data.name,
          workEmail: parsed.data.workEmail,
          company: parsed.data.company,
          role: parsed.data.role,
          teamSize: parsed.data.teamSize,
          primaryChallenge: parsed.data.primaryChallenge,
          formType: parsed.data.formType,
          source: parsed.data.source ?? null,
          ctaSource: parsed.data.ctaSource ?? null,
          campaign: parsed.data.campaign ?? null,
          notes: parsed.data.notes ?? null,
        })
        .returning();

      const webhookUrl = process.env.LEAD_WEBHOOK_URL;
      if (webhookUrl) {
        fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "lead.created",
            lead,
          }),
        }).catch((error) => {
          console.error("Lead webhook failed:", error);
        });
      }

      return res.status(201).json({ ok: true, leadId: lead.id });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to capture lead" });
    }
  });

  app.get("/api/leads", requireAuth, async (req, res) => {
    const allowedRoles = new Set(["admin", "cro", "ciso", "compliance_lead"]);
    if (!allowedRoles.has(req.user!.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const records = await db.select().from(leads).orderBy(desc(leads.createdAt));
      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to load leads" });
    }
  });

  const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(12, "New password must be at least 12 characters long"),
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const currentPasswordMatches = await comparePasswords(currentPassword, user.password);
      if (!currentPasswordMatches) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const passwordValidation = validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return res.status(400).json({ message: passwordValidation.message });
      }

      const reused = await isPasswordReused(newPassword, user.password, user.passwordHistory);
      if (reused) {
        return res.status(400).json({ message: "New password must not reuse recent passwords" });
      }

      const hashed = await hashPassword(newPassword);
      const updated = await storage.updateUserPassword(user.id, {
        password: hashed,
        passwordChangedAt: new Date(),
        passwordExpiresAt: getPasswordExpiryDate(),
        passwordHistory: buildNextPasswordHistory(user.password, user.passwordHistory),
      });
      if (!updated) {
        return res.status(500).json({ message: "Failed to update password" });
      }

      await regenerateSessionForUser(req, {
        id: updated.id,
        username: updated.username,
        fullName: updated.fullName,
        email: updated.email,
        role: updated.role,
      });

      const authPayload = await buildAndPersistAuthPayload(req);
      return res.json({ message: "Password updated", user: authPayload });
    } catch (err: any) {
      return res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/mfa/enroll", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const user = await storage.getUser(req.user!.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.mfaEnabled) {
      return res.status(400).json({ message: "MFA is already enabled" });
    }

    const secret = generateTotpSecret();
    const updated = await storage.updateUserMfa(user.id, {
      mfaEnabled: false,
      mfaSecret: secret,
      mfaRecoveryCodes: [],
    });
    if (!updated) {
      return res.status(500).json({ message: "Failed to start MFA enrollment" });
    }

    return res.json({
      secret,
      otpauthUrl: buildTotpOtpAuthUrl(secret, user.username),
      message: "Verify the TOTP code to complete MFA enrollment",
    });
  });

  app.post("/api/auth/mfa/verify-enroll", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const code = getOptionalString(req.body?.code);
    if (!code) {
      return res.status(400).json({ message: "MFA code is required" });
    }
    const user = await storage.getUser(req.user!.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.mfaSecret) {
      return res.status(400).json({ message: "MFA enrollment has not been started" });
    }
    if (!verifyTotpCode(user.mfaSecret, code)) {
      return res.status(400).json({ message: "Invalid MFA code" });
    }

    const issued = await issueRecoveryCodes();
    const updated = await storage.updateUserMfa(user.id, {
      mfaEnabled: true,
      mfaSecret: user.mfaSecret,
      mfaRecoveryCodes: issued.hashedRecoveryCodes,
    });
    if (!updated) {
      return res.status(500).json({ message: "Failed to enable MFA" });
    }

    return res.json({
      ok: true,
      recoveryCodes: issued.recoveryCodes,
      message: "MFA enabled successfully",
    });
  });

  app.post("/api/auth/mfa/disable", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const password = getOptionalString(req.body?.password);
    if (!password) {
      return res.status(400).json({ message: "Password is required" });
    }
    const user = await storage.getUser(req.user!.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.mfaEnabled) {
      return res.status(400).json({ message: "MFA is not enabled" });
    }

    const passwordValid = await comparePasswords(password, user.password);
    if (!passwordValid) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const mfaResult = await verifyMfaChallenge(
      {
        id: user.id,
        mfaEnabled: user.mfaEnabled,
        mfaSecret: user.mfaSecret,
        mfaRecoveryCodes: user.mfaRecoveryCodes,
      },
      {
        mfaCode: req.body?.mfaCode,
        recoveryCode: req.body?.recoveryCode,
      },
    );
    if (!mfaResult.valid) {
      return res.status(400).json({ message: "Invalid MFA verification" });
    }

    const updated = await storage.updateUserMfa(user.id, {
      mfaEnabled: false,
      mfaSecret: null,
      mfaRecoveryCodes: [],
    });
    if (!updated) {
      return res.status(500).json({ message: "Failed to disable MFA" });
    }

    return res.json({ ok: true, message: "MFA disabled" });
  });

  app.post("/api/auth/mfa/recovery-codes/regenerate", requireAuth, async (req, res) => {
    if (req.user!.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    const user = await storage.getUser(req.user!.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (!user.mfaEnabled || !user.mfaSecret) {
      return res.status(400).json({ message: "MFA is not enabled" });
    }

    const mfaResult = await verifyMfaChallenge(
      {
        id: user.id,
        mfaEnabled: user.mfaEnabled,
        mfaSecret: user.mfaSecret,
        mfaRecoveryCodes: user.mfaRecoveryCodes,
      },
      {
        mfaCode: req.body?.mfaCode,
        recoveryCode: req.body?.recoveryCode,
      },
    );
    if (!mfaResult.valid) {
      return res.status(400).json({ message: "Invalid MFA verification" });
    }

    const issued = await issueRecoveryCodes();
    const updated = await storage.updateUserMfa(user.id, {
      mfaEnabled: true,
      mfaSecret: user.mfaSecret,
      mfaRecoveryCodes: issued.hashedRecoveryCodes,
    });
    if (!updated) {
      return res.status(500).json({ message: "Failed to regenerate recovery codes" });
    }

    return res.json({
      ok: true,
      recoveryCodes: issued.recoveryCodes,
      message: "Recovery codes regenerated",
    });
  });

  app.get("/api/auth/user", async (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const authPayload = await buildAndPersistAuthPayload(req);
    res.json(authPayload);
  });

  app.post("/api/auth/onboarding-state", requireAuth, async (req, res) => {
    const parsed = onboardingStateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid onboarding state" });
    }

    const authPayload = await buildAndPersistAuthPayload(req);
    if (!authPayload.currentOrganizationId) {
      return res.status(400).json({ message: "No active organization context" });
    }

    const memberships = await storage.getMembershipsByUserId(req.user!.id);
    const membership = memberships.find(
      (entry) =>
        entry.organizationId === authPayload.currentOrganizationId &&
        entry.membershipState === "active",
    );
    if (!membership) {
      return res.status(403).json({ message: "Invalid organization access" });
    }

    const existingState = authPayload.currentOrganizationOnboarding ?? {
      currentStep: 0,
      completedSteps: [],
      dismissedAlerts: [],
      snoozedAlerts: {},
      updatedAt: null,
    };

    const nextState = {
      currentStep: parsed.data.currentStep ?? existingState.currentStep,
      completedSteps: parsed.data.completedSteps
        ? Array.from(new Set(parsed.data.completedSteps)).slice(0, 10)
        : existingState.completedSteps,
      dismissedAlerts: parsed.data.dismissedAlerts
        ? Array.from(new Set(parsed.data.dismissedAlerts)).slice(0, 20)
        : existingState.dismissedAlerts,
      snoozedAlerts: parsed.data.snoozedAlerts ?? existingState.snoozedAlerts,
      updatedAt: new Date().toISOString(),
    };

    await storage.updateMembershipOnboardingState(membership.id, nextState);
    const refreshedPayload = await buildAndPersistAuthPayload(req);
    return res.json(refreshedPayload);
  });

  app.post("/api/auth/switch-organization", requireAuth, async (req, res) => {
    const organizationId = req.body?.organizationId as string | undefined;
    if (!organizationId) {
      return res.status(400).json({ message: "organizationId is required" });
    }
    const memberships = await storage.getMembershipsByUserId(req.user!.id);
    const membership = memberships.find(
      (m) => m.organizationId === organizationId && m.membershipState === "active",
    );
    if (!membership) {
      return res.status(403).json({ message: "Invalid organization access" });
    }
    try {
      await regenerateSessionForUser(req, req.user!);
      req.session.currentOrganizationId = organizationId;
      return res.json({ ok: true, currentOrganizationId: organizationId });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to refresh session" });
    }
  });

  const routeParam = (value: string | string[] | undefined): string =>
    Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

  app.get("/api/ai-systems", requireAuth, requireTenant, async (req, res) => {
    const filters = {
      search: req.query.search as string | undefined,
      riskLevel: req.query.riskLevel as string | undefined,
      status: req.query.status as string | undefined,
      dataSensitivity: req.query.dataSensitivity as string | undefined,
      geography: req.query.geography as string | undefined,
      department: req.query.department as string | undefined,
    };
    const systems = await systemService.listSystems({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      filters,
    });
    res.json(systems);
  });

  app.get("/api/ai-systems/:id", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    res.json(system);
  });

  app.get("/api/ai-systems/:id/controls", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    const controls = await storage.getSystemControlsBySystemForOrg(req.tenant!.organizationId, routeParam(req.params.id));
    res.json(controls);
  });

  app.get("/api/ai-systems/:id/workflows", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    const workflows = await workflowService.getWorkflowsBySystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    res.json(workflows);
  });

  app.get("/api/ai-systems/:id/audit-logs", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    const logs = await auditService.listLogsByEntity({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      entityId: routeParam(req.params.id),
    });
    res.json(logs);
  });

  app.post(
    "/api/ai-systems",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const parsed = insertAiSystemSchema.parse(req.body);
        const system = await systemService.createSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: parsed,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: system.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `AI system "${system.name}" registered`,
          },
        });
        if (system.riskLevel === "high" || system.riskLevel === "unacceptable") {
          await notifyAllAdmins(
            req.tenant!.organizationId,
            "High-Risk System Registered",
            `"${system.name}" has been registered with ${system.riskLevel} risk level`,
            "high_risk_created",
            "ai_system",
            system.id,
          );
        }
        res.status(201).json(system);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.patch(
    "/api/ai-systems/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      const updated = await systemService.updateSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
        input: req.body,
      });
      if (!updated) return res.status(404).json({ message: "System not found" });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "ai_system",
          entityId: updated.id,
          action: "updated",
          performedBy: req.user!.fullName,
          details: `AI system "${updated.name}" updated`,
        },
      });
      res.json(updated);
    },
  );

  app.delete(
    "/api/ai-systems/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const system = await systemService.getSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
      });
      if (!system) return res.status(404).json({ message: "System not found" });
      await systemService.deleteSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
      });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "ai_system",
          entityId: routeParam(req.params.id),
          action: "deleted",
          performedBy: req.user!.fullName,
          details: `AI system "${system.name}" deleted`,
        },
      });
      res.status(204).send();
    },
  );

  app.get("/api/compliance-controls", requireAuth, async (_req, res) => {
    const controls = await storage.getComplianceControls();
    res.json(controls);
  });

  app.get("/api/system-controls", requireAuth, requireTenant, async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      systemId: req.query.systemId as string | undefined,
      assignee: req.query.assignee as string | undefined,
    };
    const controls = await controlService.listControls({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      filters,
    });
    res.json(controls);
  });

  app.post(
    "/api/system-controls",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const parsed = insertSystemControlSchema.parse(req.body);
        const sc = await controlService.createControlAssignment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: parsed,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "system_control",
            entityId: sc.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Control "${sc.controlId}" assigned to system "${sc.systemId}"`,
          },
        });
        res.status(201).json(sc);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.patch(
    "/api/system-controls/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner", "reviewer"),
    async (req, res) => {
      const updated = await controlService.updateControlAssignment({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        controlId: routeParam(req.params.id),
        input: req.body,
      });
      if (!updated) return res.status(404).json({ message: "Control not found" });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "system_control",
          entityId: updated.id,
          action: "status_changed",
          performedBy: req.user!.fullName,
          details: `Control status changed to "${updated.status}"`,
        },
      });
      res.json(updated);
    },
  );

  app.get("/api/approval-workflows", requireAuth, requireTenant, async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      systemId: req.query.systemId as string | undefined,
    };
    const workflows = await workflowService.listWorkflows({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      filters,
    });
    res.json(workflows);
  });

  app.post(
    "/api/approval-workflows",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = insertApprovalWorkflowSchema.parse(req.body);
        const wf = await workflowService.createWorkflow({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: parsed,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "approval_workflow",
            entityId: wf.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Approval workflow "${wf.title}" created`,
          },
        });
        if (wf.reviewer) {
          const reviewer = await workflowService.findUserByNameOrUsername({
            organizationId: req.tenant!.organizationId,
            identity: wf.reviewer,
          });
          if (reviewer) {
            await notifyUser(
              req.tenant!.organizationId,
              reviewer.id,
              "Approval Request Assigned",
              `You have been assigned to review "${wf.title}"`,
              "approval_assigned",
              "approval_workflow",
              wf.id,
            );
          }
        }
        res.status(201).json(wf);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.patch(
    "/api/approval-workflows/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer"),
    async (req, res) => {
      const updated = await workflowService.updateWorkflow({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        workflowId: routeParam(req.params.id),
        input: req.body,
      });
      if (!updated) return res.status(404).json({ message: "Workflow not found" });
      const action = req.body.status === "approved" ? "approved" : req.body.status === "rejected" ? "rejected" : "status_changed";
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "approval_workflow",
          entityId: updated.id,
          action,
          performedBy: req.user!.fullName,
          details: `Workflow "${updated.title}" ${action}`,
        },
      });
      const requester = await workflowService.findUserByNameOrUsername({
        organizationId: req.tenant!.organizationId,
        identity: updated.requestedBy,
      });
      if (requester) {
        await notifyUser(
          req.tenant!.organizationId,
          requester.id,
          `Workflow ${action}`,
          `Your workflow "${updated.title}" has been ${action}`,
          "workflow_status_changed",
          "approval_workflow",
          updated.id,
        );
      }
      res.json(updated);
    },
  );

  app.get("/api/audit-logs", requireAuth, requireTenant, async (req, res) => {
    const filters = {
      action: req.query.action as string | undefined,
      entityType: req.query.entityType as string | undefined,
      performedBy: req.query.performedBy as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    };
    const logs = await auditService.listLogs({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      filters,
    });
    res.json(logs);
  });

  app.get("/api/notifications", requireAuth, requireTenant, async (req, res) => {
    try {
      const notifs = await notificationService.listForUser({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json(notifs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, requireTenant, async (req, res) => {
    try {
      const count = await notificationService.getUnreadCountForUser({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, requireTenant, async (req, res) => {
    try {
      const updated = await notificationService.markRead({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        notificationId: routeParam(req.params.id),
      });
      if (!updated) return res.status(404).json({ message: "Notification not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, requireTenant, async (req, res) => {
    await notificationService.markAllRead({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
    });
    res.json({ message: "All notifications marked as read" });
  });

  const exportRequestSchema = z.object({
    type: z.enum(["ai_systems", "system_controls", "approval_workflows", "audit_logs", "evidence_files"]),
  });

  app.post("/api/exports", requireAuth, requireTenant, async (req, res) => {
    try {
      const { type } = exportRequestSchema.parse(req.body);
      const created = await exportService.createExport({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        type: type as ExportType,
      });
      res.status(201).json(created);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/exports/:exportId/download", requireAuth, requireTenant, async (req, res) => {
    try {
      const record = await exportService.getExportForDownload({
        organizationId: req.tenant!.organizationId,
        exportId: routeParam(req.params.exportId),
      });
      if (!record) {
        return res.status(404).json({ message: "Export not found" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(record.fileName)}"`);
      res.setHeader("Content-Type", record.mimeType);
      res.sendFile(record.filePath);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/evidence", requireAuth, requireTenant, async (req, res) => {
    try {
      const filters = {
        systemId: req.query.systemId as string | undefined,
        controlId: req.query.controlId as string | undefined,
        workflowId: req.query.workflowId as string | undefined,
      };
      const files = await evidenceService.listEvidence({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        filters,
      });
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(
    "/api/evidence",
    requireAuth,
    requireTenant,
    upload.single("file"),
    async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { systemId, controlId, workflowId } = req.body;
      if (!systemId) {
        return res.status(400).json({ message: "systemId is required" });
      }
      const evidence = await evidenceService.createEvidence({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          systemId,
          controlId: controlId || null,
          workflowId: workflowId || null,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          mimeType: req.file.mimetype,
          filePath: `${req.tenant!.organizationId}/${req.file.filename}`,
        },
      });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "evidence_file",
          entityId: evidence.id,
          action: "created",
          performedBy: req.user!.fullName,
          details: `Evidence file "${req.file.originalname}" uploaded for system ${systemId}`,
        },
      });
      res.status(201).json(evidence);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
    },
  );

  app.get("/api/evidence/:id/download", requireAuth, requireTenant, async (req, res) => {
    try {
      const file = await evidenceService.getEvidenceFile({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        evidenceId: routeParam(req.params.id),
      });
      if (!file) return res.status(404).json({ message: "File not found" });
      const filePath = path.join(uploadDir, file.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(file.fileName)}"`);
      res.setHeader("Content-Type", file.mimeType);
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete(
    "/api/evidence/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
    const file = await evidenceService.getEvidenceFile({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      evidenceId: routeParam(req.params.id),
    });
    if (!file) return res.status(404).json({ message: "File not found" });
    const filePath = path.join(uploadDir, file.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await evidenceService.deleteEvidence({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      evidenceId: routeParam(req.params.id),
    });
    await auditService.createLog({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      input: {
        entityType: "evidence_file",
        entityId: routeParam(req.params.id),
        action: "deleted",
        performedBy: req.user!.fullName,
        details: `Evidence file "${file.fileName}" deleted`,
      },
    });
    res.status(204).send();
    },
  );

  app.get("/api/risk-assessments", requireAuth, requireTenant, async (req, res) => {
    try {
      const assessments = await riskAssessmentService.listAssessments({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json(assessments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/risk-assessments/system/:systemId", requireAuth, requireTenant, async (req, res) => {
    try {
      const system = await systemService.getSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.systemId),
      });
      if (!system) return res.status(404).json({ message: "System not found" });
      const assessments = await riskAssessmentService.listAssessmentsBySystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.systemId),
      });
      res.json(assessments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const riskAssessmentAnswersSchema = z.object({
    intendedUse: z.enum(["autonomous_decisions", "decision_support", "automation", "analytics"]),
    domain: z.enum(["healthcare", "law_enforcement", "finance", "employment", "education", "critical_infrastructure", "general"]),
    personalData: z.enum(["special_category", "sensitive", "basic", "none"]),
    usersImpacted: z.enum(["over_100k", "10k_100k", "1k_10k", "under_1k"]),
    decisionImpact: z.enum(["legal_significant", "material", "minor", "none"]),
    humanOversight: z.enum(["none", "post_hoc", "in_loop", "full_control"]),
    geography: z.enum(["eu", "global", "us", "other"]).optional(),
    biometricUse: z.enum(["yes", "no"]).optional(),
    vulnerableGroups: z.enum(["yes", "no"]).optional(),
    purpose: z.string().optional(),
  });

  const riskAssessmentBodySchema = z.object({
    systemName: z.string().min(1, "System name is required"),
    systemId: z.string().nullable().optional(),
    answers: riskAssessmentAnswersSchema,
  });

  app.post(
    "/api/risk-assessments",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
    try {
      const parsed = riskAssessmentBodySchema.parse(req.body);
      const { answers, systemId, systemName } = parsed;

      if (systemId) {
        const system = await systemService.getSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId,
        });
        if (!system) {
          return res.status(404).json({ message: "System not found" });
        }
      }

      const { riskLevel, score, explanation, suggestedControls } = computeRiskClassification(answers);

      const assessment = await riskAssessmentService.createAssessment({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          systemId: systemId || null,
          systemName,
          answers,
          riskOutcome: riskLevel,
          riskScore: score,
          riskExplanation: explanation,
          suggestedControls,
        },
      });

      if (systemId) {
        await riskAssessmentService.updateLinkedSystemRisk({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId,
          riskLevel,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: systemId,
            action: "risk_assessed",
            performedBy: req.user!.fullName,
            details: `Risk assessment completed: ${riskLevel} (score: ${score})`,
          },
        });
      }

      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "risk_assessment",
          entityId: assessment.id,
          action: "created",
          performedBy: req.user!.fullName,
          details: `Risk assessment for "${systemName}" completed: ${riskLevel}`,
        },
      });

      res.status(201).json(assessment);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
    },
  );

  app.get("/api/dashboard/trends", requireAuth, requireTenant, async (req, res) => {
    try {
      const trends = await dashboardService.getTrends({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json(trends);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/activity-dashboard", requireAuth, requireTenant, async (req, res) => {
    try {
      const data = await activityService.getActivityDashboard({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        membershipRole: req.tenant!.membershipRole,
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/calendar-events", requireAuth, requireTenant, async (req, res) => {
    try {
      const monthParam = req.query.month as string | undefined;
      const typeFilter = req.query.type as string | undefined;
      const events = await calendarService.getCalendarEvents({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        membershipRole: req.tenant!.membershipRole,
        month: monthParam,
        type: typeFilter,
      });
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(
    "/api/system-controls/bulk",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
    try {
      const { systemIds, controlIds } = req.body;
      if (!Array.isArray(systemIds) || !Array.isArray(controlIds) || systemIds.length === 0 || controlIds.length === 0) {
        return res.status(400).json({ message: "systemIds and controlIds arrays are required" });
      }
      const result = await controlService.bulkAssignControls({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemIds,
        controlIds,
      });

      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "system_control",
          entityId: "bulk",
          action: "bulk_assigned",
          performedBy: req.user!.fullName,
          details: `Bulk assigned ${controlIds.length} controls to ${systemIds.length} systems (${result.total} new assignments)`,
        },
      });

      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
    },
  );

  return httpServer;
}

function computeRiskClassification(answers: any): {
  riskLevel: string;
  score: number;
  explanation: string;
  suggestedControls: string[];
} {
  let score = 0;
  const factors: string[] = [];
  const suggestedControls: string[] = [];

  if (answers.intendedUse === "autonomous_decisions") {
    score += 30;
    factors.push("System makes autonomous decisions affecting individuals");
  } else if (answers.intendedUse === "decision_support") {
    score += 15;
    factors.push("System supports human decision-making");
  } else if (answers.intendedUse === "automation") {
    score += 10;
    factors.push("System automates routine tasks");
  }

  if (answers.domain === "healthcare" || answers.domain === "law_enforcement") {
    score += 25;
    factors.push(`Deployed in high-stakes domain: ${answers.domain}`);
  } else if (answers.domain === "finance" || answers.domain === "employment" || answers.domain === "education") {
    score += 20;
    factors.push(`Deployed in regulated domain: ${answers.domain}`);
  } else if (answers.domain === "critical_infrastructure") {
    score += 25;
    factors.push("Used in critical infrastructure");
  } else if (answers.domain === "general") {
    score += 5;
    factors.push("General-purpose application domain");
  }

  if (answers.personalData === "special_category") {
    score += 20;
    factors.push("Processes special category personal data (biometric, health, etc.)");
  } else if (answers.personalData === "sensitive") {
    score += 15;
    factors.push("Processes sensitive personal data");
  } else if (answers.personalData === "basic") {
    score += 8;
    factors.push("Processes basic personal data");
  }

  if (answers.usersImpacted === "over_100k") {
    score += 15;
    factors.push("Impacts over 100,000 users");
  } else if (answers.usersImpacted === "10k_100k") {
    score += 10;
    factors.push("Impacts 10,000-100,000 users");
  } else if (answers.usersImpacted === "1k_10k") {
    score += 5;
    factors.push("Impacts 1,000-10,000 users");
  }

  if (answers.decisionImpact === "legal_significant") {
    score += 20;
    factors.push("Decisions produce legal or similarly significant effects");
  } else if (answers.decisionImpact === "material") {
    score += 12;
    factors.push("Decisions have material impact on individuals");
  } else if (answers.decisionImpact === "minor") {
    score += 4;
    factors.push("Decisions have minor impact");
  }

  if (answers.humanOversight === "none") {
    score += 15;
    factors.push("No human oversight in decision loop");
  } else if (answers.humanOversight === "post_hoc") {
    score += 8;
    factors.push("Human oversight only after decisions are made");
  } else if (answers.humanOversight === "in_loop") {
    score -= 5;
    factors.push("Human-in-the-loop oversight (risk mitigated)");
  }

  if (answers.geography === "eu" || answers.geography === "global") {
    score += 5;
    factors.push(`Operating in ${answers.geography === "eu" ? "EU" : "global"} jurisdiction`);
  }

  if (answers.biometricUse === "yes") {
    score += 15;
    factors.push("Uses biometric identification or categorization");
  }

  if (answers.vulnerableGroups === "yes") {
    score += 10;
    factors.push("Affects vulnerable groups (children, elderly, disabled)");
  }

  let riskLevel: string;
  if (score >= 80) {
    riskLevel = "unacceptable";
  } else if (score >= 50) {
    riskLevel = "high";
  } else if (score >= 25) {
    riskLevel = "limited";
  } else {
    riskLevel = "minimal";
  }

  if (riskLevel === "unacceptable" || riskLevel === "high") {
    suggestedControls.push("Risk Management System", "Data Governance Framework", "Technical Documentation", "Record-Keeping & Logging", "Human Oversight Mechanism", "Accuracy & Robustness Testing", "Cybersecurity Assessment", "Conformity Assessment");
  } else if (riskLevel === "limited") {
    suggestedControls.push("Transparency Disclosure", "User Notification", "AI Content Labeling", "Basic Documentation");
  } else {
    suggestedControls.push("Voluntary Code of Conduct", "Best Practice Guidelines");
  }

  const explanation = `Risk Score: ${score}/100 — Classification: ${riskLevel.toUpperCase()}\n\nFactors considered:\n${factors.map((f) => `• ${f}`).join("\n")}`;

  return { riskLevel, score, explanation, suggestedControls };
}
