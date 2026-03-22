import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { fetchWithTimeout } from "./http";
import {
  adminAuditEvents,
  incidentCategories,
  incidentSeverities,
  incidentStatuses,
  insertAiSystemSchema,
  insertApprovalWorkflowSchema,
  membershipRoles,
  memberships,
  organizationInvites,
  organizationInviteStatuses,
  organizations,
  subscriptionStatuses,
  subscriptionTiers,
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
import { incidentService } from "./services/incidentService";
import { jiraService } from "./services/jiraService";
import { monitoringService } from "./services/monitoringService";
import { notificationService } from "./services/notificationService";
import { portfolioService } from "./services/portfolioService";
import { decisionAuditService } from "./services/decisionAuditService";
import { retentionService } from "./services/retentionService";
import { riskAssessmentService } from "./services/riskAssessmentService";
import { ssoService } from "./services/ssoService";
import { subscriptionService } from "./services/subscriptionService";
import { systemService } from "./services/systemService";
import { telemetryPolicyService } from "./services/telemetryPolicyService";
import { telemetryAdapterService } from "./services/telemetryAdapterService";
import { telemetryService } from "./services/telemetryService";
import { controlTowerGatewayService } from "./services/controlTowerGatewayService";
import { telemetryReviewerExceptionService } from "./services/telemetryReviewerExceptionService";
import { upstreamProviderVaultService } from "./services/upstreamProviderVaultService";
import { workflowService } from "./services/workflowService";
import { autoDiscoveryService } from "./services/autoDiscoveryService";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  deliverPasswordReset,
  isPasswordResetTokenValidForUser,
  verifyPasswordResetToken,
} from "./services/passwordResetService";
import { getUploadsRoot } from "./runtime-paths";
import { areMockAuthRoutesEnabled, parseBooleanEnv } from "./env";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";

const uploadDir = getUploadsRoot();

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

function getTelemetryMetadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function getTelemetryStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function buildTelemetryAuditDetails(params: {
  sourceLabel: string;
  eventType: string;
  gateway?: string | null;
  decision: string;
  metadata: unknown;
}) {
  const metadata = getTelemetryMetadataRecord(params.metadata);
  const thresholdBreaches = getTelemetryStringArray(metadata.thresholdBreaches);
  const reasonCodes = getTelemetryStringArray(metadata.reasonCodes);
  const lawPackIds = getTelemetryStringArray(metadata.lawPackIdsApplied);
  const decisionSummary =
    typeof metadata.decisionSummary === "string" ? metadata.decisionSummary.trim() : "";
  const legalProfileApplied =
    typeof metadata.legalProfileApplied === "string" ? metadata.legalProfileApplied : null;

  const suffix: string[] = [];
  if (decisionSummary) {
    suffix.push(decisionSummary);
  }
  if (reasonCodes.length > 0) {
    suffix.push(`Reason codes: ${reasonCodes.join(", ")}`);
  }
  if (thresholdBreaches.length > 0) {
    suffix.push(`Threshold breaches: ${thresholdBreaches.join(", ")}`);
  }
  if (legalProfileApplied) {
    suffix.push(`Legal profile: ${legalProfileApplied}`);
  }
  if (lawPackIds.length > 0) {
    suffix.push(`Law packs: ${lawPackIds.join(", ")}`);
  }

  return `${params.sourceLabel} "${params.eventType}" recorded${params.gateway ? ` from ${params.gateway}` : ""} with decision "${params.decision}"${suffix.length > 0 ? `. ${suffix.join(". ")}` : ""}`;
}

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

function getErrorStatus(error: unknown, fallback = 400): number {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
  ) {
    return (error as { status: number }).status;
  }
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }
  return fallback;
}

type RequestWindowState = {
  count: number;
  windowStart: number;
};

const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PASSWORD_RESET_RATE_LIMIT_ATTEMPTS = 5;
const passwordResetAttemptsByIp = new Map<string, RequestWindowState>();

function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(",")[0].trim();
  }
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

function getRequestWindowState(map: Map<string, RequestWindowState>, key: string, now: number): RequestWindowState {
  const current = map.get(key);
  if (!current || now - current.windowStart > PASSWORD_RESET_RATE_LIMIT_WINDOW_MS) {
    const fresh = { count: 0, windowStart: now };
    map.set(key, fresh);
    return fresh;
  }
  return current;
}

function isPasswordResetRateLimited(ip: string): boolean {
  const windowState = getRequestWindowState(passwordResetAttemptsByIp, ip, Date.now());
  return windowState.count >= PASSWORD_RESET_RATE_LIMIT_ATTEMPTS;
}

function trackPasswordResetRequest(ip: string) {
  const windowState = getRequestWindowState(passwordResetAttemptsByIp, ip, Date.now());
  windowState.count += 1;
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

const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(20),
  newPassword: z.string().min(12, "New password must be at least 12 characters long"),
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

const decisionAuditPayloadSchema = z.object({
  systemId: z.string().trim().min(1).max(120),
  workflowId: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  businessObjective: z.string().trim().max(1000).optional().nullable(),
  modelName: z.string().trim().max(200).optional().nullable(),
  modelVersion: z.string().trim().max(120).optional().nullable(),
  promptText: z.string().trim().max(16000).optional().nullable(),
  inputSources: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  inputSnapshot: z.record(z.string(), z.unknown()).optional(),
  decisionConstraints: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  confidenceScore: z.number().int().min(0).max(100).optional().nullable(),
  uncertaintyScore: z.number().int().min(0).max(100).optional().nullable(),
  explainabilityFactors: z.array(z.string().trim().min(1).max(255)).max(25).optional(),
  documentationStatus: z.enum(["draft", "reviewed", "sealed"]).optional(),
  decisionContext: z.string().trim().min(1).max(6000),
  aiOutput: z.string().trim().min(1).max(12000),
  humanOutput: z.string().trim().max(12000).optional().nullable(),
  overrideDiff: z.string().trim().max(12000).optional().nullable(),
  overrideRationale: z.string().trim().max(4000).optional().nullable(),
  outcome30d: z.record(z.string(), z.unknown()).optional(),
  outcome60d: z.record(z.string(), z.unknown()).optional(),
  outcome90d: z.record(z.string(), z.unknown()).optional(),
  outcomeSummary: z.string().trim().max(4000).optional().nullable(),
  reviewedBy: z.string().trim().max(200).optional().nullable(),
  versionReason: z.string().trim().max(1000).optional().nullable(),
});

const decisionAuditLegalHoldSchema = z.object({
  enabled: z.boolean(),
  reason: z.string().trim().max(1000).optional().nullable(),
});

const incidentPayloadSchema = z.object({
  systemId: z.string().trim().max(120).optional().nullable(),
  workflowId: z.string().trim().max(120).optional().nullable(),
  title: z.string().trim().min(1).max(200),
  category: z.enum(incidentCategories),
  severity: z.enum(incidentSeverities).default("medium"),
  status: z.enum(incidentStatuses).default("open"),
  description: z.string().trim().min(1).max(6000),
  playbook: z.record(z.string(), z.unknown()).optional(),
  rootCause: z.string().trim().max(4000).optional().nullable(),
  postIncidentReview: z.record(z.string(), z.unknown()).optional(),
  affectedDecisionTraceIds: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  regulatoryNotifications: z.array(
    z.object({
      authority: z.string().trim().min(1).max(200),
      status: z.enum(["planned", "sent", "not_required"]),
      notes: z.string().trim().max(1000).optional().nullable(),
      completedAt: z.string().trim().datetime().optional().nullable(),
    }),
  ).max(20).optional(),
  owner: z.string().trim().max(200).optional().nullable(),
  escalatedTo: z.string().trim().max(200).optional().nullable(),
  detectedAt: z.coerce.date().optional(),
  dueAt: z.coerce.date().optional(),
  containedAt: z.coerce.date().optional().nullable(),
  resolvedAt: z.coerce.date().optional().nullable(),
  postmortemCompletedAt: z.coerce.date().optional().nullable(),
});

const telemetryEventPayloadSchema = z.object({
  systemId: z.string().trim().max(120).optional().nullable(),
  modelName: z.string().trim().max(200).optional().nullable(),
  provider: z.string().trim().max(120).optional().nullable(),
  gateway: z.string().trim().max(200).optional().nullable(),
  eventType: z.string().trim().min(1).max(120),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  driftScore: z.number().int().min(0).max(100).optional().nullable(),
  biasFlags: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  safetySignals: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  toxicityScore: z.number().int().min(0).max(100).optional().nullable(),
  piiFlags: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  promptText: z.string().trim().max(20000).optional().nullable(),
  modelOutput: z.string().trim().max(40000).optional().nullable(),
  runtimeContext: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().trim().max(200).optional().nullable(),
  summary: z.string().trim().min(1).max(4000),
  metadata: z.record(z.string(), z.unknown()).optional(),
  detectedAt: z.coerce.date().optional(),
});

const telemetryPolicyPatchSchema = z.object({
  driftAlertThreshold: z.number().int().min(1).max(100).optional(),
  driftCriticalThreshold: z.number().int().min(1).max(100).optional(),
  biasFlagThreshold: z.number().int().min(1).max(20).optional(),
  safetyFlagThreshold: z.number().int().min(1).max(20).optional(),
  toxicityWarningThreshold: z.number().int().min(1).max(100).optional(),
  toxicityCriticalThreshold: z.number().int().min(1).max(100).optional(),
  piiFlagThreshold: z.number().int().min(1).max(20).optional(),
  overrideRateWarningThreshold: z.number().int().min(1).max(100).optional(),
  overrideRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
  errorRateWarningThreshold: z.number().int().min(1).max(100).optional(),
  errorRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
  autoEscalateCritical: z.boolean().optional(),
  notifyOnWarning: z.boolean().optional(),
  enforceBlocking: z.boolean().optional(),
  blockOnPii: z.boolean().optional(),
  blockOnSafetyCritical: z.boolean().optional(),
  blockOnRestrictedPrompt: z.boolean().optional(),
  restrictedPromptPatterns: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one telemetry threshold setting must be provided",
});

const telemetryAdapterPatchSchema = z.object({
  enabled: z.boolean().optional(),
  allowedGateways: z.array(z.string().trim().min(1).max(120)).max(25).optional(),
  allowedToolNames: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
  toolArgumentPolicy: z.record(
    z.string().trim().min(1).max(120),
    z.object({
      allowedArgumentKeys: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
      blockedArgumentKeys: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
      blockedValuePatterns: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      maxStringLength: z.number().int().min(1).max(20000).optional(),
      argumentSchema: z.record(
        z.string().trim().min(1).max(200),
        z.object({
          type: z.enum(["string", "number", "boolean", "object", "array"]).optional(),
          required: z.boolean().optional(),
          enumValues: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
          minLength: z.number().int().min(0).max(20000).optional(),
          maxLength: z.number().int().min(1).max(20000).optional(),
          minimum: z.number().optional(),
          maximum: z.number().optional(),
        }),
      ).optional(),
    }),
  ).optional(),
  upstreamProviders: z.object({
    openai: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    anthropic: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    gemini: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    azureOpenAi: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      apiVersion: z.string().trim().max(120).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    vertexAi: z.object({
      enabled: z.boolean().optional(),
      apiKey: z.string().trim().max(4000).nullable().optional(),
      clearStoredApiKey: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    bedrock: z.object({
      enabled: z.boolean().optional(),
      baseUrl: z.string().trim().url().max(1000).nullable().optional(),
      region: z.string().trim().max(120).nullable().optional(),
      accessKeyId: z.string().trim().max(4000).nullable().optional(),
      secretAccessKey: z.string().trim().max(4000).nullable().optional(),
      sessionToken: z.string().trim().max(8000).nullable().optional(),
      clearStoredAwsCredentials: z.boolean().optional(),
      headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
      modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
    }).optional(),
    compatibleProviders: z.record(
      z.string().trim().min(1).max(120),
      z.object({
        enabled: z.boolean().optional(),
        apiKey: z.string().trim().max(4000).nullable().optional(),
        clearStoredApiKey: z.boolean().optional(),
        baseUrl: z.string().trim().url().max(1000).nullable().optional(),
        headers: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(2000)).optional(),
        modelAllowlist: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      }),
    ).optional(),
  }).optional(),
  defaultSystemId: z.string().trim().min(1).max(120).nullable().optional(),
  collectionProfile: z.enum(["minimal", "redacted", "full_evidence"]).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one telemetry adapter setting must be provided",
});

const telemetryReviewerThresholdNames = [
  "drift_gt_5_percent",
  "bias_flags_detected",
  "safety_flags_detected",
  "toxicity_warning",
  "pii_detected",
  "override_rate_spike",
  "error_rate_anomaly",
  "restricted_prompt_detected",
] as const;

const telemetryReviewerExceptionSchema = z.object({
  systemId: z.string().trim().min(1).max(120).nullable().optional(),
  gateway: z.string().trim().min(1).max(120).nullable().optional(),
  promptPattern: z.string().trim().min(3).max(1000),
  suppressedThresholds: z.array(z.enum(telemetryReviewerThresholdNames)).max(20).optional(),
  reviewerNote: z.string().trim().min(3).max(4000),
  active: z.boolean().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

const telemetryReviewerExceptionPatchSchema = z.object({
  gateway: z.string().trim().min(1).max(120).nullable().optional(),
  promptPattern: z.string().trim().min(3).max(1000).optional(),
  suppressedThresholds: z.array(z.enum(telemetryReviewerThresholdNames)).max(20).optional(),
  reviewerNote: z.string().trim().min(3).max(4000).optional(),
  active: z.boolean().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one exception field must be provided",
});

const jiraIntegrationSchema = z.object({
  enabled: z.boolean().default(false),
  baseUrl: z.string().trim().url().max(1000).nullable().optional(),
  projectKey: z.string().trim().max(120).nullable().optional(),
  userEmail: z.string().trim().email().max(255).nullable().optional(),
  apiToken: z.string().trim().max(4000).nullable().optional(),
  issueType: z.string().trim().max(120).default("Task"),
  labels: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

const subscriptionPatchSchema = z
  .object({
    tier: z.enum(subscriptionTiers).optional(),
    status: z.enum(subscriptionStatuses).optional(),
    billingEmail: z.string().trim().email().max(255).nullable().optional(),
    seatLimit: z.number().int().min(1).max(5000).optional(),
    trialEndsAt: z.coerce.date().optional().nullable(),
    renewalAt: z.coerce.date().optional().nullable(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "At least one field must be provided" });

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

  app.get("/api/settings", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const user = await storage.getUser(req.user!.id);
    return res.json({
      allowSelfSignup: parseBooleanEnv(process.env.ALLOW_SELF_SIGNUP, false),
      mfaEnabled: Boolean(user?.mfaEnabled),
      currentOrganizationId: req.session.currentOrganizationId ?? null,
    });
  });

  app.patch("/api/settings", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
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
    if (!areMockAuthRoutesEnabled()) {
      return res.status(404).json({ message: "Not found" });
    }

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
    if (!areMockAuthRoutesEnabled()) {
      return res.status(404).json({ message: "Not found" });
    }

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

  app.get("/api/organization/jira-integration", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const integration = await jiraService.getIntegration(req.tenant!.organizationId);
    return res.json(integration);
  });

  app.put("/api/organization/jira-integration", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = jiraIntegrationSchema.parse(req.body);
      const integration = await jiraService.upsertIntegration(req.tenant!.organizationId, {
        enabled: parsed.enabled,
        baseUrl: parsed.baseUrl ?? null,
        projectKey: parsed.projectKey ?? null,
        userEmail: parsed.userEmail ?? null,
        apiToken: parsed.apiToken ?? null,
        issueType: parsed.issueType,
        labels: parsed.labels ?? [],
      });
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.jira_integration.updated",
        targetType: "jira_integration",
        targetId: integration.id,
        metadata: {
          enabled: integration.enabled,
          projectKey: integration.projectKey,
        },
      });
      return res.json(integration);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update Jira integration" });
    }
  });

  app.post("/api/organization/jira-integration/test", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const result = await jiraService.testConnection(req.tenant!.organizationId);
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.get("/api/organization/subscription", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    const subscription = await subscriptionService.getForOrg(req.tenant!.organizationId);
    return res.json(subscription);
  });

  app.get(
    "/api/organization/telemetry-policy",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const policy = await telemetryPolicyService.getEffectiveForOrg(req.tenant!.organizationId);
      return res.json(policy);
    },
  );

  app.patch(
    "/api/organization/telemetry-policy",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = telemetryPolicyPatchSchema.parse(req.body);
        const updated = await telemetryPolicyService.updateForOrg(req.tenant!.organizationId, parsed);
        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "organization.telemetry_policy.updated",
          targetType: "telemetry_policy",
          targetId: updated.id,
          metadata: parsed,
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update telemetry policy" });
      }
    },
  );

  app.post(
    "/api/organization/telemetry-policy/reset",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const updated = await telemetryPolicyService.resetOrgOverride(req.tenant!.organizationId);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.telemetry_policy.reset",
        targetType: "telemetry_policy",
        targetId: req.tenant!.organizationId,
        metadata: {
          source: updated.source,
          inheritedFromPortfolioId: updated.inheritedFromPortfolioId,
        },
      });
      return res.json(updated);
    },
  );

  app.get(
    "/api/ai-systems/:id/telemetry-policy",
    requireAuth,
    requireTenant,
    async (req, res) => {
      const systemId = routeParam(req.params.id);
      const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
      if (!system) {
        return res.status(404).json({ message: "AI system not found" });
      }

      const policy = await telemetryPolicyService.getEffectiveForSystem(req.tenant!.organizationId, systemId);
      return res.json(policy);
    },
  );

  app.patch(
    "/api/ai-systems/:id/telemetry-policy",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const systemId = routeParam(req.params.id);
        const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
        if (!system) {
          return res.status(404).json({ message: "AI system not found" });
        }

        const parsed = telemetryPolicyPatchSchema.parse(req.body);
        const updated = await telemetryPolicyService.updateForSystem(req.tenant!.organizationId, systemId, parsed);
        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "system.telemetry_policy.updated",
          targetType: "ai_system",
          targetId: systemId,
          metadata: {
            systemName: system.name,
            ...parsed,
          },
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update system telemetry policy" });
      }
    },
  );

  app.post(
    "/api/ai-systems/:id/telemetry-policy/reset",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      const systemId = routeParam(req.params.id);
      const system = await storage.getAiSystemById(req.tenant!.organizationId, systemId);
      if (!system) {
        return res.status(404).json({ message: "AI system not found" });
      }

      const updated = await telemetryPolicyService.resetSystemOverride(req.tenant!.organizationId, systemId);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "system.telemetry_policy.reset",
        targetType: "ai_system",
        targetId: systemId,
        metadata: {
          systemName: system.name,
          source: updated.source,
        },
      });
      return res.json(updated);
    },
  );

  app.get(
    "/api/organization/telemetry-adapter",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const adapter = await telemetryAdapterService.getForOrg(req.tenant!.organizationId);
      return res.json(adapter);
    },
  );

  app.patch(
    "/api/organization/telemetry-adapter",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = telemetryAdapterPatchSchema.parse(req.body);
        if (parsed.defaultSystemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, parsed.defaultSystemId);
          if (!system) {
            return res.status(404).json({ message: "Default AI system not found for this organization" });
          }
        }
        const updated = await telemetryAdapterService.updateForOrg(req.tenant!.organizationId, parsed);
        await recordAdminAuditEvent({
          organizationId: req.tenant!.organizationId,
          actorUserId: req.user!.id,
          actorName: req.user!.fullName,
          action: "organization.telemetry_adapter.updated",
          targetType: "telemetry_adapter",
          targetId: updated.id,
          metadata: parsed,
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update telemetry adapter" });
      }
    },
  );

  app.post(
    "/api/organization/telemetry-adapter/rotate-key",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const rotated = await telemetryAdapterService.rotateKeyForOrg(req.tenant!.organizationId);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.telemetry_adapter.key_rotated",
        targetType: "telemetry_adapter",
        targetId: rotated.adapter.id,
        metadata: {
          keyPrefix: rotated.adapter.keyPrefix,
        },
      });
      return res.json(rotated);
    },
  );

  app.get(
    "/api/telemetry/reviewer-exceptions",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      const systemId = typeof req.query.systemId === "string" && req.query.systemId.trim() ? req.query.systemId.trim() : null;
      const rows = await telemetryReviewerExceptionService.listForOrg(req.tenant!.organizationId, {
        systemId,
      });
      return res.json(rows);
    },
  );

  app.post(
    "/api/telemetry/reviewer-exceptions",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryReviewerExceptionSchema.parse(req.body);
        if (parsed.systemId) {
          const system = await storage.getAiSystemById(req.tenant!.organizationId, parsed.systemId);
          if (!system) {
            return res.status(404).json({ message: "AI system not found for this organization" });
          }
        }
        const created = await telemetryReviewerExceptionService.createForOrg(req.tenant!.organizationId, {
          systemId: parsed.systemId ?? null,
          gateway: parsed.gateway ?? null,
          promptPattern: parsed.promptPattern,
          suppressedThresholds: parsed.suppressedThresholds ?? ["restricted_prompt_detected"],
          reviewerNote: parsed.reviewerNote,
          active: parsed.active ?? true,
          expiresAt: parsed.expiresAt ?? null,
          createdBy: req.user!.fullName || req.user!.username,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_exception",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Reviewer exception created for prompt pattern "${created.promptPattern}"`,
          },
        });
        return res.status(201).json(created);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to create reviewer exception" });
      }
    },
  );

  app.patch(
    "/api/telemetry/reviewer-exceptions/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryReviewerExceptionPatchSchema.parse(req.body);
        const updated = await telemetryReviewerExceptionService.updateForOrg(
          req.tenant!.organizationId,
          routeParam(req.params.id),
          {
            gateway: parsed.gateway ?? undefined,
            promptPattern: parsed.promptPattern ?? undefined,
            suppressedThresholds: parsed.suppressedThresholds ?? undefined,
            reviewerNote: parsed.reviewerNote ?? undefined,
            active: parsed.active ?? undefined,
            expiresAt: parsed.expiresAt ?? undefined,
          },
        );
        if (!updated) {
          return res.status(404).json({ message: "Reviewer exception not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_exception",
            entityId: updated.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Reviewer exception updated for prompt pattern "${updated.promptPattern}"`,
          },
        });
        return res.json(updated);
      } catch (err: any) {
        return res.status(400).json({ message: err.message || "Failed to update reviewer exception" });
      }
    },
  );

  app.patch("/api/organization/subscription", requireAuth, requireTenant, requireOrgRole("owner", "admin"), async (req, res) => {
    try {
      const parsed = subscriptionPatchSchema.parse(req.body);
      const updated = await subscriptionService.updateForOrg(req.tenant!.organizationId, parsed);
      await recordAdminAuditEvent({
        organizationId: req.tenant!.organizationId,
        actorUserId: req.user!.id,
        actorName: req.user!.fullName,
        action: "organization.subscription.updated",
        targetType: "subscription",
        targetId: updated.id,
        metadata: {
          tier: updated.tier,
          status: updated.status,
          seatLimit: updated.seatLimit,
        },
      });
      return res.json(updated);
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update subscription" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    if (!parseBooleanEnv(process.env.ALLOW_SELF_SIGNUP, false)) {
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
      if (email) {
        const existingByEmail = await storage.getUserByEmail(email);
        if (existingByEmail) {
          return res.status(400).json({ message: "Email already exists" });
        }
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { identifier } = forgotPasswordSchema.parse(req.body ?? {});
      const clientIp = getClientIp(req);

      if (isPasswordResetRateLimited(clientIp)) {
        return res.status(429).json({ message: "Too many password reset requests. Try again later." });
      }
      trackPasswordResetRequest(clientIp);

      const genericResponse = {
        ok: true,
        message: "If an eligible local account exists, a password reset link has been sent.",
      };

      const user = await storage.getUserByUsernameOrEmail(identifier);
      if (!user || (user.authProvider ?? "local") !== "local" || !user.email) {
        return res.status(202).json(genericResponse);
      }

      const { token, expiresAt } = createPasswordResetToken(user);
      const resetUrl = buildPasswordResetUrl(token);
      const delivery = await deliverPasswordReset({
        email: user.email,
        fullName: user.fullName || user.username,
        resetUrl,
        expiresAt,
      });

      return res.status(202).json({
        ...genericResponse,
        ...(process.env.NODE_ENV !== "production" ? { previewUrl: delivery.previewUrl ?? resetUrl } : {}),
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Password reset request failed" });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body ?? {});
      const payload = verifyPasswordResetToken(token);
      if (!payload) {
        return res.status(400).json({ message: "Password reset token is invalid or expired" });
      }

      const user = await storage.getUser(payload.sub);
      if (!user || !isPasswordResetTokenValidForUser(payload, user)) {
        return res.status(400).json({ message: "Password reset token is invalid or expired" });
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

      return res.json({
        ok: true,
        message: "Password reset successful. You can now sign in with your new password.",
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Password reset failed" });
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
        void fetchWithTimeout(webhookUrl, {
          method: "POST",
          timeoutMs: 5_000,
          timeoutMessage: "Lead webhook timed out",
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

  const autoDiscoveryManifestSchema = z.object({
    systemName: z.string().min(1, "System name is required"),
    owner: z.string().min(1, "Owner is required"),
    department: z.string().optional(),
    purpose: z.string().min(1, "Purpose is required"),
    vendor: z.string().optional(),
    provider: z.string().optional(),
    modelName: z.string().optional(),
    modelType: z.string().optional(),
    gateway: z.string().optional(),
    deploymentContext: z.string().optional(),
    intendedUse: z.enum(["autonomous_decisions", "decision_support", "automation", "analytics"]),
    domain: z.enum(["healthcare", "law_enforcement", "finance", "employment", "education", "critical_infrastructure", "general"]),
    personalData: z.enum(["special_category", "sensitive", "basic", "none"]),
    usersImpacted: z.enum(["over_100k", "10k_100k", "1k_10k", "under_1k"]),
    decisionImpact: z.enum(["legal_significant", "material", "minor", "none"]),
    humanOversight: z.enum(["none", "post_hoc", "in_loop", "full_control"]),
    geography: z.enum(["eu", "global", "us", "other"]).default("other"),
    biometricUse: z.enum(["yes", "no"]).default("no"),
    vulnerableGroups: z.enum(["yes", "no"]).default("no"),
    customerFacing: z.boolean().optional().default(false),
    telemetrySignals: z.object({
      productionTraffic: z.boolean().optional().default(false),
      piiExposureObserved: z.boolean().optional().default(false),
      safetyAlertsObserved: z.boolean().optional().default(false),
      biasAlertsObserved: z.boolean().optional().default(false),
    }).optional().default({}),
  });

  app.post(
    "/api/ai-systems/auto-register",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const manifest = autoDiscoveryManifestSchema.parse(req.body);
        const derivedAnswers = autoDiscoveryService.deriveAnswers(manifest);
        const { riskLevel, score, explanation, suggestedControls } = autoDiscoveryService.computeRiskClassification(derivedAnswers);
        const discoveryNotes = buildAutoDiscoveryNotes(manifest);
        const riskExplanation = discoveryNotes.length
          ? `${explanation}\n\nAuto-discovery signals:\n${discoveryNotes.map((note) => `• ${note}`).join("\n")}`
          : explanation;

        const system = await systemService.createSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: autoDiscoveryService.buildAutoRegisteredSystemInput(manifest, riskLevel),
        });

        const assessment = await riskAssessmentService.createAssessment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            systemId: system.id,
            systemName: system.name,
            answers: {
              ...derivedAnswers,
              discovery: {
                provider: manifest.provider ?? null,
                modelName: manifest.modelName ?? null,
                gateway: manifest.gateway ?? null,
                customerFacing: manifest.customerFacing,
                telemetrySignals: manifest.telemetrySignals,
              },
            },
            riskOutcome: riskLevel,
            riskScore: score,
            riskExplanation,
            suggestedControls,
          },
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: system.id,
            action: "auto_registered",
            performedBy: req.user!.fullName,
            details: `AI application "${system.name}" auto-registered from SDK/application manifest`,
          },
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "risk_assessment",
            entityId: assessment.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Derived risk assessment created for "${system.name}": ${riskLevel} (${score})`,
          },
        });

        if (riskLevel === "high" || riskLevel === "unacceptable") {
          await notifyAllAdmins(
            req.tenant!.organizationId,
            "High-Risk Application Connected",
            `"${system.name}" was auto-registered as ${riskLevel} risk from SDK/application intake`,
            "high_risk_created",
            "ai_system",
            system.id,
          );
        }

        res.status(201).json({ system, assessment, derivedAnswers });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/ai-systems/:id/auto-reassess",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const systemId = routeParam(req.params.id);
        const system = await systemService.getSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId,
        });
        if (!system) {
          return res.status(404).json({ message: "System not found" });
        }

        const manifest = autoDiscoveryManifestSchema.parse({
          ...req.body,
          systemName: req.body.systemName || system.name,
          owner: req.body.owner || system.owner,
          purpose: req.body.purpose || system.purpose || system.description || system.name,
        });

        const derivedAnswers = autoDiscoveryService.deriveAnswers(manifest);
        const { riskLevel, score, explanation, suggestedControls } = autoDiscoveryService.computeRiskClassification(derivedAnswers);
        const discoveryNotes = buildAutoDiscoveryNotes(manifest);
        const riskExplanation = discoveryNotes.length
          ? `${explanation}\n\nAuto-discovery signals:\n${discoveryNotes.map((note) => `• ${note}`).join("\n")}`
          : explanation;

        const updatedSystem = await systemService.updateSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId,
          input: autoDiscoveryService.buildAutoReassessedSystemInput(manifest, riskLevel),
        });

        const assessment = await riskAssessmentService.createAssessment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            systemId,
            systemName: system.name,
            answers: {
              ...derivedAnswers,
              discovery: {
                provider: manifest.provider ?? null,
                modelName: manifest.modelName ?? null,
                gateway: manifest.gateway ?? null,
                customerFacing: manifest.customerFacing,
                telemetrySignals: manifest.telemetrySignals,
              },
            },
            riskOutcome: riskLevel,
            riskScore: score,
            riskExplanation,
            suggestedControls,
          },
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: systemId,
            action: "auto_reassessed",
            performedBy: req.user!.fullName,
            details: `AI application "${system.name}" auto-reassessed from SDK/application manifest: ${riskLevel} (${score})`,
          },
        });

        res.json({ system: updatedSystem ?? system, assessment, derivedAnswers });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

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
      try {
        const parsed = insertSystemControlSchema.partial().parse(req.body ?? {});
        const updated = await controlService.updateControlAssignment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          controlId: routeParam(req.params.id),
          input: parsed,
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
      } catch (err: any) {
        res.status(err?.status ?? 400).json({ message: err.message || "Failed to update control" });
      }
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
            details: `Approval workflow "${wf.title}" created and routed to ${wf.committeeType?.replace(/_/g, " ") || "technical team"} as ${wf.decisionTier?.replace("_", " ") || "tier 1"}`,
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
        const linkedSystem = await storage.getAiSystemById(req.tenant!.organizationId, wf.systemId);
        const jiraSync = await jiraService.syncWorkflowIfNeeded({
          organizationId: req.tenant!.organizationId,
          workflow: wf,
          systemName: linkedSystem?.name ?? wf.systemId,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        if (jiraSync.status === "linked" && jiraSync.issueKey) {
          await auditService.createLog({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            input: {
              entityType: "approval_workflow",
              entityId: wf.id,
              action: "jira_linked",
              performedBy: req.user!.fullName,
              details: `Linked Jira issue ${jiraSync.issueKey} for workflow \"${wf.title}\"`,
            },
          });
        }
        if (jiraSync.status === "error") {
          await notifyAllAdmins(
            req.tenant!.organizationId,
            "Jira sync failed",
            `Workflow \"${wf.title}\" could not be synced to Jira: ${jiraSync.message}`,
            "workflow_status_changed",
            "approval_workflow",
            wf.id,
          );
        }
        const finalWorkflow = jiraSync.workflow ?? wf;
        await decisionAuditService.syncWorkflowTrace({
          organizationId: req.tenant!.organizationId,
          workflow: finalWorkflow,
          actorName: req.user!.fullName,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        res.status(201).json(finalWorkflow);
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
      try {
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
            details: `Workflow "${updated.title}" ${action} under ${updated.decisionTier?.replace("_", " ") || "tier 1"} / ${updated.committeeType?.replace(/_/g, " ") || "technical team"}`,
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
        const linkedSystem = await storage.getAiSystemById(req.tenant!.organizationId, updated.systemId);
        const jiraSync = await jiraService.syncWorkflowIfNeeded({
          organizationId: req.tenant!.organizationId,
          workflow: updated,
          systemName: linkedSystem?.name ?? updated.systemId,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        if (jiraSync.status === "linked" && jiraSync.issueKey) {
          await auditService.createLog({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            input: {
              entityType: "approval_workflow",
              entityId: updated.id,
              action: "jira_linked",
              performedBy: req.user!.fullName,
              details: `Linked Jira issue ${jiraSync.issueKey} for workflow \"${updated.title}\"`,
            },
          });
        }
        const finalWorkflow = jiraSync.workflow ?? updated;
        await decisionAuditService.syncWorkflowTrace({
          organizationId: req.tenant!.organizationId,
          workflow: finalWorkflow,
          actorName: req.user!.fullName,
          systemRiskLevel: linkedSystem?.riskLevel ?? null,
        });
        res.json(finalWorkflow);
      } catch (err: any) {
        res.status(err?.status ?? 400).json({ message: err.message || "Failed to update workflow" });
      }
    },
  );

  app.get("/api/decision-audits", requireAuth, requireTenant, async (req, res) => {
    const rows = await decisionAuditService.listForOrg(req.tenant!.organizationId, {
      systemId: req.query.systemId as string | undefined,
      workflowId: req.query.workflowId as string | undefined,
    });
    res.json(rows);
  });

  app.get("/api/decision-audits/summary", requireAuth, requireTenant, async (req, res) => {
    const summary = await decisionAuditService.getSummaryForOrg(req.tenant!.organizationId);
    res.json(summary);
  });

  app.get("/api/decision-audits/:id/versions", requireAuth, requireTenant, async (req, res) => {
    const versions = await decisionAuditService.listVersionsForOrg(req.tenant!.organizationId, routeParam(req.params.id));
    res.json(versions);
  });

  app.get(
    "/api/decision-audits/retention-summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const summary = await retentionService.getSummaryForOrg(req.tenant!.organizationId);
      res.json(summary);
    },
  );

  app.post(
    "/api/decision-audits",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = decisionAuditPayloadSchema.parse(req.body);
        const created = await decisionAuditService.createForOrg(req.tenant!.organizationId, {
          ...parsed,
          workflowId: parsed.workflowId ?? null,
          businessObjective: parsed.businessObjective ?? null,
          modelName: parsed.modelName ?? null,
          modelVersion: parsed.modelVersion ?? null,
          promptText: parsed.promptText ?? null,
          inputSources: parsed.inputSources ?? [],
          inputSnapshot: parsed.inputSnapshot ?? {},
          decisionConstraints: parsed.decisionConstraints ?? [],
          confidenceScore: parsed.confidenceScore ?? null,
          uncertaintyScore: parsed.uncertaintyScore ?? null,
          explainabilityFactors: parsed.explainabilityFactors ?? [],
          documentationStatus: parsed.documentationStatus ?? "sealed",
          humanOutput: parsed.humanOutput ?? null,
          overrideDiff: parsed.overrideDiff ?? null,
          overrideRationale: parsed.overrideRationale ?? null,
          outcome30d: parsed.outcome30d ?? {},
          outcome60d: parsed.outcome60d ?? {},
          outcome90d: parsed.outcome90d ?? {},
          outcomeSummary: parsed.outcomeSummary ?? null,
          reviewedBy: parsed.reviewedBy ?? null,
          createdBy: req.user!.fullName,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "decision_audit",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Decision trace \"${created.title}\" recorded`,
          },
        });
        res.status(201).json(created);
      } catch (err: any) {
        res.status(getErrorStatus(err)).json({ message: err.message || "Failed to create decision trace" });
      }
    },
  );

  app.patch(
    "/api/decision-audits/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = decisionAuditPayloadSchema.partial().parse(req.body);
        const updated = await decisionAuditService.updateForOrg(req.tenant!.organizationId, routeParam(req.params.id), {
          ...parsed,
          workflowId: parsed.workflowId ?? undefined,
          businessObjective: parsed.businessObjective ?? undefined,
          modelName: parsed.modelName ?? undefined,
          modelVersion: parsed.modelVersion ?? undefined,
          promptText: parsed.promptText ?? undefined,
          inputSources: parsed.inputSources ?? undefined,
          inputSnapshot: parsed.inputSnapshot ?? undefined,
          decisionConstraints: parsed.decisionConstraints ?? undefined,
          confidenceScore: parsed.confidenceScore ?? undefined,
          uncertaintyScore: parsed.uncertaintyScore ?? undefined,
          explainabilityFactors: parsed.explainabilityFactors ?? undefined,
          documentationStatus: parsed.documentationStatus ?? undefined,
          humanOutput: parsed.humanOutput ?? undefined,
          overrideDiff: parsed.overrideDiff ?? undefined,
          overrideRationale: parsed.overrideRationale ?? undefined,
          outcome30d: parsed.outcome30d ?? undefined,
          outcome60d: parsed.outcome60d ?? undefined,
          outcome90d: parsed.outcome90d ?? undefined,
          outcomeSummary: parsed.outcomeSummary ?? undefined,
          reviewedBy: parsed.reviewedBy ?? undefined,
          versionReason: parsed.versionReason ?? undefined,
          actorName: req.user!.fullName,
        });
        if (!updated) {
          return res.status(404).json({ message: "Decision trace not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "decision_audit",
            entityId: updated.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Decision trace \"${updated.title}\" updated to v${updated.currentVersionNumber}`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(getErrorStatus(err)).json({ message: err.message || "Failed to update decision trace" });
      }
    },
  );

  app.post(
    "/api/decision-audits/:id/legal-hold",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = decisionAuditLegalHoldSchema.parse(req.body);
        const updated = await retentionService.setLegalHold({
          organizationId: req.tenant!.organizationId,
          decisionAuditId: routeParam(req.params.id),
          enabled: parsed.enabled,
          reason: parsed.reason ?? null,
          actorName: req.user!.fullName,
        });
        if (!updated) {
          return res.status(404).json({ message: "Decision trace not found" });
        }
        res.json(updated);
      } catch (err: any) {
        res.status(err?.status ?? 400).json({ message: err.message || "Failed to update legal hold" });
      }
    },
  );

  app.post(
    "/api/decision-audits/retention-enforce",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const result = await retentionService.enforceDueRetention({
        organizationId: req.tenant!.organizationId,
        actorName: req.user!.fullName,
      });
      res.json(result);
    },
  );

  app.get("/api/incidents", requireAuth, requireTenant, async (req, res) => {
    const rows = await incidentService.listForOrg(req.tenant!.organizationId, {
      status: req.query.status as string | undefined,
      severity: req.query.severity as string | undefined,
    });
    res.json(rows);
  });

  app.get("/api/incidents/summary", requireAuth, requireTenant, async (req, res) => {
    const summary = await incidentService.getSummaryForOrg(req.tenant!.organizationId);
    res.json(summary);
  });

  app.post(
    "/api/incidents",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = incidentPayloadSchema.parse(req.body);
        const created = await incidentService.createForOrg(req.tenant!.organizationId, {
          ...parsed,
          systemId: parsed.systemId ?? null,
          workflowId: parsed.workflowId ?? null,
          playbook: parsed.playbook ?? {},
          rootCause: parsed.rootCause ?? null,
          postIncidentReview: parsed.postIncidentReview ?? {},
          affectedDecisionTraceIds: parsed.affectedDecisionTraceIds ?? [],
          regulatoryNotifications: parsed.regulatoryNotifications ?? [],
          owner: parsed.owner ?? null,
          escalatedTo: parsed.escalatedTo ?? null,
          dueAt: parsed.dueAt ?? null,
          containedAt: parsed.containedAt ?? null,
          resolvedAt: parsed.resolvedAt ?? null,
          postmortemCompletedAt: parsed.postmortemCompletedAt ?? null,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_incident",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `AI incident \"${created.title}\" opened`,
          },
        });
        if (created.severity === "critical" || created.severity === "high") {
          await notifyAllAdmins(
            req.tenant!.organizationId,
            `AI incident: ${created.title}`,
            `${created.severity.toUpperCase()} incident opened in category ${created.category}.`,
            "workflow_status_changed",
            "ai_incident",
            created.id,
          );
        }
        res.status(201).json(created);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to create incident" });
      }
    },
  );

  app.patch(
    "/api/incidents/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = incidentPayloadSchema.partial().parse(req.body);
        const updated = await incidentService.updateForOrg(req.tenant!.organizationId, routeParam(req.params.id), {
          ...parsed,
          playbook: parsed.playbook ?? undefined,
          rootCause: parsed.rootCause ?? undefined,
          postIncidentReview: parsed.postIncidentReview ?? undefined,
          affectedDecisionTraceIds: parsed.affectedDecisionTraceIds ?? undefined,
          regulatoryNotifications: parsed.regulatoryNotifications ?? undefined,
          owner: parsed.owner ?? undefined,
          escalatedTo: parsed.escalatedTo ?? undefined,
          dueAt: parsed.dueAt ?? undefined,
          containedAt: parsed.containedAt ?? undefined,
          resolvedAt: parsed.resolvedAt ?? undefined,
          postmortemCompletedAt: parsed.postmortemCompletedAt ?? undefined,
        });
        if (!updated) {
          return res.status(404).json({ message: "Incident not found" });
        }
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_incident",
            entityId: updated.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `AI incident \"${updated.title}\" moved to ${updated.status}`,
          },
        });
        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to update incident" });
      }
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

  app.get("/api/audit-logs/verify-chain", requireAuth, requireTenant, async (req, res) => {
    const result = await auditService.verifyChain({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
    });
    res.status(result.ok ? 200 : 409).json(result);
  });

  app.get("/api/telemetry/summary", requireAuth, requireTenant, async (req, res) => {
    const summary = await telemetryService.getSummaryForOrg(req.tenant!.organizationId);
    res.json(summary);
  });

  app.post(
    ["/api/telemetry/events", "/api/telemetry/ingest"],
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner"),
    async (req, res) => {
      try {
        const parsed = telemetryEventPayloadSchema.parse(req.body);
        const created = await telemetryService.createForOrg(req.tenant!.organizationId, {
          ...parsed,
          systemId: parsed.systemId ?? null,
          modelName: parsed.modelName ?? null,
          provider: parsed.provider ?? null,
          gateway: parsed.gateway ?? null,
          driftScore: parsed.driftScore ?? null,
          biasFlags: parsed.biasFlags ?? [],
          safetySignals: parsed.safetySignals ?? [],
          toxicityScore: parsed.toxicityScore ?? null,
          piiFlags: parsed.piiFlags ?? [],
          promptText: parsed.promptText ?? null,
          modelOutput: parsed.modelOutput ?? null,
          runtimeContext: parsed.runtimeContext ?? {},
          correlationId: parsed.correlationId ?? null,
          metadata: parsed.metadata ?? {},
          detectedAt: parsed.detectedAt ?? new Date(),
        }, {
          collectionProfile: "full_evidence",
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "telemetry_event",
            entityId: created.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: buildTelemetryAuditDetails({
              sourceLabel: "Telemetry event",
              eventType: created.eventType,
              decision: created.actionTaken,
              metadata: created.metadata,
            }),
          },
        });
        res.status(201).json(created);
      } catch (err: any) {
        res.status(getErrorStatus(err)).json({ message: err.message || "Failed to record telemetry event" });
      }
    },
  );

  app.post(["/api/telemetry/sdk-ingest", "/api/telemetry/sdk-evaluate"], async (req, res) => {
    try {
      const rawKey =
        req.get("x-telemetry-key") ||
        req.get("x-api-key") ||
        req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      if (!rawKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const parsed = telemetryEventPayloadSchema.parse(req.body);
      const allowedGateways = Array.isArray(adapter.allowedGateways)
        ? adapter.allowedGateways.filter((entry): entry is string => typeof entry === "string")
        : [];

      if (allowedGateways.length > 0 && (!parsed.gateway || !allowedGateways.includes(parsed.gateway))) {
        return res.status(403).json({ message: "Gateway is not allowed for this telemetry adapter" });
      }

      const created = await telemetryService.createForOrg(adapter.organizationId, {
        ...parsed,
        systemId: parsed.systemId ?? adapter.defaultSystemId ?? null,
        modelName: parsed.modelName ?? null,
        provider: parsed.provider ?? null,
        gateway: parsed.gateway ?? null,
        driftScore: parsed.driftScore ?? null,
        biasFlags: parsed.biasFlags ?? [],
        safetySignals: parsed.safetySignals ?? [],
        toxicityScore: parsed.toxicityScore ?? null,
        piiFlags: parsed.piiFlags ?? [],
        promptText: parsed.promptText ?? null,
        modelOutput: parsed.modelOutput ?? null,
        runtimeContext: parsed.runtimeContext ?? {},
        correlationId: parsed.correlationId ?? null,
        metadata: {
          ...(parsed.metadata ?? {}),
          adapterKeyPrefix: adapter.keyPrefix,
          ingestSource: "sdk",
          boundSystemId: adapter.defaultSystemId ?? null,
        },
        detectedAt: parsed.detectedAt ?? new Date(),
      }, {
        collectionProfile: adapter.collectionProfile ?? "full_evidence",
      });

      await telemetryAdapterService.markUsed(adapter.id);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "telemetry-sdk",
          username: "telemetry-sdk",
          fullName: "Telemetry SDK",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: created.id,
          action: "sdk_ingested",
          performedBy: "Telemetry SDK",
          details: buildTelemetryAuditDetails({
            sourceLabel: "Telemetry SDK event",
            eventType: created.eventType,
            gateway: parsed.gateway ?? null,
            decision: created.actionTaken,
            metadata: created.metadata,
          }),
        },
      });

      const metadata = created.metadata as Record<string, unknown>;
      return res.status(201).json({
        id: created.id,
        ok: true,
        decision: created.actionTaken,
        blocked: created.blocked,
        thresholdBreaches: Array.isArray(metadata?.thresholdBreaches)
          ? (metadata.thresholdBreaches as string[])
          : [],
        escalatedIncidentId:
          typeof metadata?.escalatedIncidentId === "string" ? metadata.escalatedIncidentId : null,
        restrictedPromptMatches: Array.isArray(metadata?.restrictedPromptMatches)
          ? (metadata.restrictedPromptMatches as string[])
          : [],
        reasonCodes: Array.isArray(metadata?.reasonCodes)
          ? (metadata.reasonCodes as string[])
          : [],
        decisionSummary:
          typeof metadata?.decisionSummary === "string" ? metadata.decisionSummary : null,
        legalProfileApplied:
          typeof metadata?.legalProfileApplied === "string" ? metadata.legalProfileApplied : null,
        lawPackIdsApplied: Array.isArray(metadata?.lawPackIdsApplied)
          ? (metadata.lawPackIdsApplied as string[])
          : [],
      });
      } catch (err: any) {
        return res.status(getErrorStatus(err)).json({ message: err.message || "Failed to ingest telemetry event" });
      }
  });

  app.post("/api/gateway/openai/v1/chat/completions", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const explicitApiKey =
        req.get("x-openai-api-key") ||
        req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "OpenAI chat completions payload must include model and messages" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "openai",
        {
          requestApiKey: explicitApiKey,
          requestBaseUrl: req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiChatCompletions(
        adapter,
        requestBody,
        upstreamConfig,
      );

      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        await auditService.createLog({
          organizationId: adapter.organizationId,
          actor: {
            id: "control-tower-gateway",
            username: "control-tower-gateway",
            fullName: "Control Tower Gateway",
            email: null,
            role: "system",
          },
          input: {
            entityType: "telemetry_event",
            entityId: decision.id,
            action: "gateway_blocked",
            performedBy: "Control Tower Gateway",
            details: `OpenAI chat completion blocked at ${result.stage} stage with decision "${decision.decision}"`,
          },
        });
        return res.status(403).json({
          ok: false,
          stage: result.stage,
          correlationId: result.correlationId,
          ...decision,
        });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `OpenAI chat completion proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/openai/v1/responses", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const explicitApiKey =
        req.get("x-openai-api-key") ||
        req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
        "";

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || requestBody.input === undefined) {
        return res.status(400).json({ message: "OpenAI responses payload must include model and input" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "openai",
        {
          requestApiKey: explicitApiKey,
          requestBaseUrl: req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiResponses(
        adapter,
        requestBody,
        upstreamConfig,
      );

      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        await auditService.createLog({
          organizationId: adapter.organizationId,
          actor: {
            id: "control-tower-gateway",
            username: "control-tower-gateway",
            fullName: "Control Tower Gateway",
            email: null,
            role: "system",
          },
          input: {
            entityType: "telemetry_event",
            entityId: decision.id,
            action: "gateway_blocked",
            performedBy: "Control Tower Gateway",
            details: `OpenAI response blocked at ${result.stage} stage with decision "${decision.decision}"`,
          },
        });
        return res.status(403).json({
          ok: false,
          stage: result.stage,
          correlationId: result.correlationId,
          ...decision,
        });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `OpenAI response proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/anthropic/v1/messages", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "Anthropic messages payload must include model and messages" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "anthropic",
        {
          requestApiKey:
            req.get("x-anthropic-api-key") ||
            req.get("x-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-anthropic-base-url"),
          requestHeaders: req.get("anthropic-version")
            ? { "anthropic-version": req.get("anthropic-version")! }
            : undefined,
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyAnthropicMessages(adapter, requestBody, upstreamConfig);
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `Anthropic message proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/gemini/v1beta/models/:modelAction", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const [modelName, action] = String(req.params.modelAction || "").split(":");
      if (!modelName || action !== "generateContent") {
        return res.status(404).json({ message: "Unsupported Gemini gateway route" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.contents)) {
        return res.status(400).json({ message: "Gemini generateContent payload must include contents" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "gemini",
        {
          requestApiKey:
            req.get("x-gemini-api-key") ||
            req.get("x-goog-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-gemini-base-url") || req.get("x-google-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, modelName);

      const result = await controlTowerGatewayService.proxyGeminiGenerateContent(
        adapter,
        requestBody,
        modelName,
        upstreamConfig,
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `Gemini generateContent proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/azure-openai/openai/deployments/:deployment/chat/completions", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const deployment = routeParam(req.params.deployment);
      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "Azure OpenAI payload must include messages" });
      }

      const apiVersion =
        typeof req.query["api-version"] === "string"
          ? req.query["api-version"]
          : typeof req.query.apiVersion === "string"
            ? req.query.apiVersion
            : req.get("x-azure-openai-api-version") || undefined;
      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "azureOpenAi",
        {
          protocol: "azure_openai",
          requestApiKey: req.get("x-azure-openai-api-key") || req.get("api-key") || "",
          requestBaseUrl: req.get("x-azure-openai-base-url"),
          requestApiVersion: apiVersion,
        },
      );

      const normalizedBody = {
        ...requestBody,
        model: typeof requestBody.model === "string" ? requestBody.model : deployment,
      };
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, normalizedBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiChatCompletions(
        adapter,
        normalizedBody,
        upstreamConfig,
        {
          upstreamPath: `/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(upstreamConfig.apiVersion ?? "2024-10-21")}`,
          gatewayFallback: "azure-openai-inline-gateway",
        },
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `Azure OpenAI chat completion proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/vertex-ai/v1/projects/:projectId/locations/:location/publishers/:publisher/models/:modelAction", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const [modelName, action] = String(req.params.modelAction || "").split(":");
      if (!modelName || action !== "generateContent") {
        return res.status(404).json({ message: "Unsupported Vertex AI gateway route" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.contents)) {
        return res.status(400).json({ message: "Vertex AI generateContent payload must include contents" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "vertexAi",
        {
          protocol: "vertex_ai",
          requestApiKey:
            req.get("x-vertex-ai-access-token") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-vertex-ai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, modelName);

      const result = await controlTowerGatewayService.proxyGeminiGenerateContent(
        adapter,
        requestBody,
        modelName,
        upstreamConfig,
        {
          upstreamPath:
            `${upstreamConfig.baseUrl}/v1/projects/${encodeURIComponent(routeParam(req.params.projectId))}` +
            `/locations/${encodeURIComponent(routeParam(req.params.location))}` +
            `/publishers/${encodeURIComponent(routeParam(req.params.publisher))}` +
            `/models/${encodeURIComponent(modelName)}:generateContent`,
          gatewayFallback: "vertex-ai-inline-gateway",
        },
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `Vertex AI generateContent proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/bedrock/:region/model/:modelId/converse", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "Bedrock Converse payload must include messages" });
      }

      const region = routeParam(req.params.region);
      const modelId = routeParam(req.params.modelId);
      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        "bedrock",
        {
          protocol: "bedrock",
          requestBaseUrl: req.get("x-bedrock-base-url"),
          requestRegion: region,
          requestAccessKeyId: req.get("x-aws-access-key-id"),
          requestSecretAccessKey: req.get("x-aws-secret-access-key"),
          requestSessionToken: req.get("x-aws-session-token"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, modelId);

      const result = await controlTowerGatewayService.proxyBedrockConverse(
        adapter,
        requestBody,
        modelId,
        upstreamConfig,
      );
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `Bedrock Converse proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/providers/:provider/v1/chat/completions", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const providerName = routeParam(req.params.provider).toLowerCase();
      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || !Array.isArray(requestBody.messages)) {
        return res.status(400).json({ message: "OpenAI-compatible payload must include model and messages" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        providerName,
        {
          protocol: "openai",
          requestApiKey:
            req.get("x-provider-api-key") ||
            req.get("x-openai-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-provider-base-url") || req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiChatCompletions(adapter, requestBody, upstreamConfig);
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `${providerName} chat completion proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
  });

  app.post("/api/gateway/providers/:provider/v1/responses", async (req, res) => {
    try {
      const rawTelemetryKey = req.get("x-telemetry-key") || req.get("x-aict-telemetry-key") || "";
      if (!rawTelemetryKey) {
        return res.status(401).json({ message: "Telemetry ingest key is required" });
      }

      const adapter = await telemetryAdapterService.resolveIngestKey(rawTelemetryKey.trim());
      if (!adapter) {
        return res.status(401).json({ message: "Invalid telemetry ingest key" });
      }

      const providerName = routeParam(req.params.provider).toLowerCase();
      const requestBody =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : null;
      if (!requestBody || typeof requestBody.model !== "string" || requestBody.input === undefined) {
        return res.status(400).json({ message: "OpenAI-compatible payload must include model and input" });
      }

      const upstreamConfig = upstreamProviderVaultService.resolveProviderConfig(
        adapter.upstreamProviders,
        providerName,
        {
          protocol: "openai",
          requestApiKey:
            req.get("x-provider-api-key") ||
            req.get("x-openai-api-key") ||
            req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
            "",
          requestBaseUrl: req.get("x-provider-base-url") || req.get("x-openai-base-url"),
        },
      );
      upstreamProviderVaultService.assertModelAllowed(upstreamConfig, requestBody.model);

      const result = await controlTowerGatewayService.proxyOpenAiResponses(adapter, requestBody, upstreamConfig);
      await telemetryAdapterService.markUsed(adapter.id);

      if (result.kind === "blocked") {
        const decision = controlTowerGatewayService.toDecision(result.postflight ?? result.preflight);
        return res.status(403).json({ ok: false, stage: result.stage, correlationId: result.correlationId, ...decision });
      }

      const preflightDecision = controlTowerGatewayService.toDecision(result.preflight);
      const postflightDecision = controlTowerGatewayService.toDecision(result.postflight);
      await auditService.createLog({
        organizationId: adapter.organizationId,
        actor: {
          id: "control-tower-gateway",
          username: "control-tower-gateway",
          fullName: "Control Tower Gateway",
          email: null,
          role: "system",
        },
        input: {
          entityType: "telemetry_event",
          entityId: postflightDecision.id,
          action: "gateway_proxied",
          performedBy: "Control Tower Gateway",
          details: `${providerName} response proxied with preflight "${preflightDecision.decision}" and postflight "${postflightDecision.decision}"`,
        },
      });
      res.setHeader("x-aict-correlation-id", result.correlationId);
      res.setHeader("x-aict-preflight-decision", preflightDecision.decision);
      res.setHeader("x-aict-decision", postflightDecision.decision);
      res.setHeader("x-aict-telemetry-event-id", postflightDecision.id);
      if (result.upstreamText && result.upstreamContentType?.includes("text/event-stream")) {
        res.setHeader("content-type", result.upstreamContentType);
        res.setHeader("cache-control", "no-cache, no-transform");
        return res.status(result.upstreamStatus).send(result.upstreamText);
      }
      return res.status(result.upstreamStatus).json(result.upstreamJson);
    } catch (err: any) {
      return res.status(err?.status ?? 400).json(err?.responseBody ?? { message: err.message || "Gateway request failed" });
    }
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

  app.get(
    "/api/portfolio-control",
    requireAuth,
    async (req, res) => {
      try {
        const rawPortfolioId = req.query.portfolioId;
        const portfolioId =
          typeof rawPortfolioId === "string"
            ? rawPortfolioId
            : Array.isArray(rawPortfolioId) && typeof rawPortfolioId[0] === "string"
              ? rawPortfolioId[0]
              : undefined;
        const data = await portfolioService.getControlPlane({
          userId: req.user!.id,
          actor: req.user!,
          portfolioId,
        });
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message || "Failed to load portfolio control plane" });
      }
    },
  );

  app.get("/api/portfolio-control/telemetry-policy", requireAuth, async (req, res) => {
    try {
      const rawPortfolioId = req.query.portfolioId;
      const portfolioId =
        typeof rawPortfolioId === "string"
          ? rawPortfolioId
          : Array.isArray(rawPortfolioId) && typeof rawPortfolioId[0] === "string"
            ? rawPortfolioId[0]
            : undefined;

      const available = await portfolioService.listForUser(req.user!.id, req.user!.fullName || req.user!.username);
      const selected = available.find((portfolio) => portfolio.id === portfolioId) ?? available[0];
      if (!selected) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const policy = await telemetryPolicyService.getForPortfolio(selected.id);
      return res.json({
        portfolio: selected,
        policy,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to load portfolio telemetry policy" });
    }
  });

  app.patch("/api/portfolio-control/telemetry-policy", requireAuth, async (req, res) => {
    try {
      const rawPortfolioId = req.query.portfolioId;
      const portfolioId =
        typeof rawPortfolioId === "string"
          ? rawPortfolioId
          : Array.isArray(rawPortfolioId) && typeof rawPortfolioId[0] === "string"
            ? rawPortfolioId[0]
            : undefined;

      const available = await portfolioService.listForUser(req.user!.id, req.user!.fullName || req.user!.username);
      const selected = available.find((portfolio) => portfolio.id === portfolioId) ?? available[0];
      if (!selected) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      if (selected.role !== "portfolio_admin") {
        return res.status(403).json({ message: "Portfolio admin access required" });
      }

      const parsed = telemetryPolicyPatchSchema.parse(req.body);
      const updated = await telemetryPolicyService.updateForPortfolio(selected.id, parsed);
      return res.json({
        portfolio: selected,
        policy: updated,
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update portfolio telemetry policy" });
    }
  });

  app.get(
    "/api/dashboard/exit-readiness",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const data = await dashboardService.getExitReadiness({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
        });
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message || "Failed to load exit readiness" });
      }
    },
  );

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

function buildAutoDiscoveryNotes(manifest: any): string[] {
  const notes: string[] = [];
  if (manifest.provider || manifest.modelName) {
    notes.push(`Model provider: ${[manifest.provider, manifest.modelName].filter(Boolean).join(" / ")}`);
  }
  if (manifest.gateway) {
    notes.push(`Gateway connected: ${manifest.gateway}`);
  }
  if (manifest.customerFacing) {
    notes.push("Customer-facing runtime detected");
  }
  if (manifest.telemetrySignals?.productionTraffic) {
    notes.push("Production traffic signal present");
  }
  if (manifest.telemetrySignals?.piiExposureObserved) {
    notes.push("Runtime telemetry observed PII exposure risk");
  }
  if (manifest.telemetrySignals?.safetyAlertsObserved) {
    notes.push("Runtime telemetry observed safety alerts");
  }
  if (manifest.telemetrySignals?.biasAlertsObserved) {
    notes.push("Runtime telemetry observed bias alerts");
  }
  return notes;
}

function deriveAutoDiscoveryAnswers(manifest: any) {
  let personalData = manifest.personalData;
  if (manifest.telemetrySignals?.piiExposureObserved) {
    personalData = personalData === "none" ? "basic" : personalData === "basic" ? "sensitive" : personalData;
  }

  let humanOversight = manifest.humanOversight;
  if (manifest.customerFacing && humanOversight === "full_control") {
    humanOversight = "in_loop";
  }

  let intendedUse = manifest.intendedUse;
  if (manifest.customerFacing && intendedUse === "automation") {
    intendedUse = "decision_support";
  }

  return {
    intendedUse,
    domain: manifest.domain,
    personalData,
    usersImpacted: manifest.usersImpacted,
    decisionImpact: manifest.decisionImpact,
    humanOversight,
    geography: manifest.geography,
    biometricUse: manifest.biometricUse,
    vulnerableGroups: manifest.vulnerableGroups,
    purpose: manifest.purpose,
  };
}

function mapPersonalDataToSensitivity(personalData: string) {
  if (personalData === "special_category") return "restricted";
  if (personalData === "sensitive") return "confidential";
  if (personalData === "basic") return "internal";
  return "public";
}

function mapUsersImpacted(usersImpacted: string) {
  if (usersImpacted === "over_100k") return 100000;
  if (usersImpacted === "10k_100k") return 25000;
  if (usersImpacted === "1k_10k") return 5000;
  return 500;
}

function mapGeographyLabel(geography: string) {
  if (geography === "eu") return "EU";
  if (geography === "us") return "US";
  if (geography === "global") return "Global";
  return "Other";
}

function buildAutoRegisteredSystemInput(manifest: any, riskLevel: string) {
  return {
    name: manifest.systemName,
    description: `Auto-discovered via SDK/application manifest. ${manifest.purpose}`,
    owner: manifest.owner,
    department: manifest.department || "AI Operations",
    vendor: manifest.vendor || manifest.provider || "Unknown",
    modelType: manifest.modelType || [manifest.provider, manifest.modelName].filter(Boolean).join(" / ") || "Unknown",
    riskLevel,
    status: "under_review",
    deploymentContext: manifest.deploymentContext || "SDK Connected Application",
    dataSensitivity: mapPersonalDataToSensitivity(manifest.personalData),
    geography: mapGeographyLabel(manifest.geography),
    purpose: manifest.purpose,
    usersImpacted: mapUsersImpacted(manifest.usersImpacted),
  };
}

function buildAutoReassessedSystemInput(manifest: any, riskLevel: string) {
  return {
    department: manifest.department || undefined,
    vendor: manifest.vendor || manifest.provider || undefined,
    modelType: manifest.modelType || [manifest.provider, manifest.modelName].filter(Boolean).join(" / ") || undefined,
    riskLevel,
    status: "under_review",
    deploymentContext: manifest.deploymentContext || undefined,
    dataSensitivity: mapPersonalDataToSensitivity(manifest.personalData),
    geography: mapGeographyLabel(manifest.geography),
    purpose: manifest.purpose,
    usersImpacted: mapUsersImpacted(manifest.usersImpacted),
  };
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
