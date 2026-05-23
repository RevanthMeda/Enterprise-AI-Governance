import type { Request } from "express";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import multer from "multer";
import {
  adminAuditEvents,
  aiTelemetryEvents,
  aiIncidents,
  approvalWorkflows,
  aiSystems,
  evidenceFiles,
} from "@shared/schema";
import { db } from "../db";
import { notificationService } from "../services/notificationService";
import { storage } from "../storage";
import { buildAuthUserPayload } from "../auth";
import { and, eq, inArray } from "drizzle-orm";
import { getUploadsRoot } from "../runtime-paths";

export const uploadDir = getUploadsRoot();

export const allowedMimeTypes = [
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

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 200);
}

export const upload = multer({
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

export async function notifyAllAdmins(
  organizationId: string,
  title: string,
  message: string,
  type: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
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
        metadata: metadata ?? {},
        read: false,
      },
    });
  }
}

export async function notifyUser(
  organizationId: string,
  userId: string,
  title: string,
  message: string,
  type: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
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
      metadata: metadata ?? {},
      read: false,
    },
  });
}

export function getTelemetryMetadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export function getTelemetryStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function buildTelemetryAuditDetails(params: {
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
  const policyCategories = getTelemetryStringArray(metadata.policyCategories);
  const requestedCapabilities = getTelemetryStringArray(metadata.requestedCapabilities);
  const outOfScopeCapabilities = getTelemetryStringArray(metadata.outOfScopeCapabilities);
  const decisionSummary =
    typeof metadata.decisionSummary === "string" ? metadata.decisionSummary.trim() : "";
  const legalProfileApplied =
    typeof metadata.legalProfileApplied === "string" ? metadata.legalProfileApplied : null;
  const capabilityProfileApplied =
    typeof metadata.capabilityProfileApplied === "string" ? metadata.capabilityProfileApplied : null;
  const strictnessApplied =
    typeof metadata.strictnessApplied === "string" ? metadata.strictnessApplied : null;
  const governanceCritic =
    metadata.governanceCritic && typeof metadata.governanceCritic === "object" && !Array.isArray(metadata.governanceCritic)
      ? (metadata.governanceCritic as Record<string, unknown>)
      : null;
  const factProvenanceVerifier =
    metadata.factProvenanceVerifier &&
    typeof metadata.factProvenanceVerifier === "object" &&
    !Array.isArray(metadata.factProvenanceVerifier)
      ? (metadata.factProvenanceVerifier as Record<string, unknown>)
      : null;
  const actionConfirmationVerifier =
    metadata.actionConfirmationVerifier &&
    typeof metadata.actionConfirmationVerifier === "object" &&
    !Array.isArray(metadata.actionConfirmationVerifier)
      ? (metadata.actionConfirmationVerifier as Record<string, unknown>)
      : null;
  const shadowPolicy =
    metadata.shadowPolicy && typeof metadata.shadowPolicy === "object" && !Array.isArray(metadata.shadowPolicy)
      ? (metadata.shadowPolicy as Record<string, unknown>)
      : null;
  const reviewRelease =
    metadata.reviewRelease && typeof metadata.reviewRelease === "object" && !Array.isArray(metadata.reviewRelease)
      ? (metadata.reviewRelease as Record<string, unknown>)
      : null;

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
  if (capabilityProfileApplied) {
    suffix.push(`Capability profile: ${capabilityProfileApplied}`);
  }
  if (strictnessApplied) {
    suffix.push(`Strictness: ${strictnessApplied}`);
  }
  if (policyCategories.length > 0) {
    suffix.push(`Policy categories: ${policyCategories.join(", ")}`);
  }
  if (requestedCapabilities.length > 0) {
    suffix.push(`Requested capabilities: ${requestedCapabilities.join(", ")}`);
  }
  if (outOfScopeCapabilities.length > 0) {
    suffix.push(`Out-of-scope capabilities: ${outOfScopeCapabilities.join(", ")}`);
  }
  if (governanceCritic && governanceCritic.enabled) {
    const verdict = typeof governanceCritic.verdict === "string" ? governanceCritic.verdict : null;
    const recommendedDecision =
      typeof governanceCritic.recommendedDecision === "string" ? governanceCritic.recommendedDecision : null;
    if (verdict) {
      suffix.push(`AI critic verdict: ${verdict}${recommendedDecision ? ` (${recommendedDecision})` : ""}`);
    }
  }
  if (factProvenanceVerifier && factProvenanceVerifier.requiresReview) {
    const missingFactKeys = Array.isArray(factProvenanceVerifier.missingFactKeys)
      ? (factProvenanceVerifier.missingFactKeys as string[])
      : [];
    suffix.push(
      `Authoritative facts missing${missingFactKeys.length > 0 ? `: ${missingFactKeys.join(", ")}` : ""}`,
    );
  }
  if (actionConfirmationVerifier && actionConfirmationVerifier.requiresConfirmation) {
    const missingActions = Array.isArray(actionConfirmationVerifier.missingConfirmedActions)
      ? (actionConfirmationVerifier.missingConfirmedActions as string[])
      : [];
    suffix.push(
      `Unconfirmed actions${missingActions.length > 0 ? `: ${missingActions.join(", ")}` : ""}`,
    );
  }
  if (shadowPolicy && shadowPolicy.enabled) {
    const shadowDecision = typeof shadowPolicy.decision === "string" ? shadowPolicy.decision : null;
    const differsFromLive = shadowPolicy.differsFromLive === true;
    suffix.push(
      `Shadow policy${shadowDecision ? `: ${shadowDecision}` : ""}${differsFromLive ? " (differs from live)" : ""}`,
    );
  }
  if (reviewRelease && reviewRelease.status === "released") {
    suffix.push(
      `Reviewer released${typeof reviewRelease.releasedBy === "string" ? ` by ${reviewRelease.releasedBy}` : ""}`,
    );
  }

  return `${params.sourceLabel} "${params.eventType}" recorded${params.gateway ? ` from ${params.gateway}` : ""} with decision "${params.decision}"${suffix.length > 0 ? `. ${suffix.join(". ")}` : ""}`;
}

export async function enrichAuditLogsWithContext<
  T extends {
    entityType: string;
    entityId: string;
  },
>(organizationId: string, logs: T[]) {
  const telemetryIds = Array.from(
    new Set(logs.filter((log) => log.entityType === "telemetry_event").map((log) => log.entityId)),
  );
  const incidentIds = Array.from(
    new Set(logs.filter((log) => log.entityType === "ai_incident").map((log) => log.entityId)),
  );
  const workflowIds = Array.from(
    new Set(logs.filter((log) => log.entityType === "approval_workflow").map((log) => log.entityId)),
  );
  const systemIds = Array.from(
    new Set(logs.filter((log) => log.entityType === "ai_system").map((log) => log.entityId)),
  );
  const evidenceIds = Array.from(
    new Set(logs.filter((log) => log.entityType === "evidence_file").map((log) => log.entityId)),
  );

  const [telemetryRows, incidentRows, workflowRows, systemRows, evidenceRows] = await Promise.all([
    telemetryIds.length > 0
      ? db
          .select({
            id: aiTelemetryEvents.id,
            metadata: aiTelemetryEvents.metadata,
            actionTaken: aiTelemetryEvents.actionTaken,
            blocked: aiTelemetryEvents.blocked,
            summary: aiTelemetryEvents.summary,
          })
          .from(aiTelemetryEvents)
          .where(
            and(
              eq(aiTelemetryEvents.organizationId, organizationId),
              inArray(aiTelemetryEvents.id, telemetryIds),
            ),
          )
      : Promise.resolve([]),
    incidentIds.length > 0
      ? db
          .select({
            id: aiIncidents.id,
            playbook: aiIncidents.playbook,
            severity: aiIncidents.severity,
            status: aiIncidents.status,
            title: aiIncidents.title,
          })
          .from(aiIncidents)
          .where(
            and(
              eq(aiIncidents.organizationId, organizationId),
              inArray(aiIncidents.id, incidentIds),
            ),
          )
      : Promise.resolve([]),
    workflowIds.length > 0
      ? db
          .select({
            id: approvalWorkflows.id,
            legalProfile: approvalWorkflows.legalProfile,
            lawPackIds: approvalWorkflows.lawPackIds,
            decisionTier: approvalWorkflows.decisionTier,
            committeeType: approvalWorkflows.committeeType,
            requiredApprovers: approvalWorkflows.requiredApprovers,
          })
          .from(approvalWorkflows)
          .where(
            and(
              eq(approvalWorkflows.organizationId, organizationId),
              inArray(approvalWorkflows.id, workflowIds),
            ),
          )
      : Promise.resolve([]),
    systemIds.length > 0
      ? db
          .select({
            id: aiSystems.id,
            legalProfile: aiSystems.legalProfile,
            lawPackIds: aiSystems.lawPackIds,
            riskLevel: aiSystems.riskLevel,
            status: aiSystems.status,
          })
          .from(aiSystems)
          .where(
            and(
              eq(aiSystems.organizationId, organizationId),
              inArray(aiSystems.id, systemIds),
            ),
          )
      : Promise.resolve([]),
    evidenceIds.length > 0
      ? db
          .select({
            id: evidenceFiles.id,
            metadata: evidenceFiles.metadata,
            workflowId: evidenceFiles.workflowId,
            systemId: evidenceFiles.systemId,
          })
          .from(evidenceFiles)
          .where(
            and(
              eq(evidenceFiles.organizationId, organizationId),
              inArray(evidenceFiles.id, evidenceIds),
            ),
          )
      : Promise.resolve([]),
  ]);

  const telemetryById = new Map(
    telemetryRows.map((row) => [
      row.id,
      (() => {
        const metadata = getTelemetryMetadataRecord(row.metadata);
        return {
          actionTaken: row.actionTaken,
          blocked: row.blocked,
          summary: row.summary,
          decisionSummary: typeof metadata.decisionSummary === "string" ? metadata.decisionSummary : null,
          reasonCodes: getTelemetryStringArray(metadata.reasonCodes),
          thresholdBreaches: getTelemetryStringArray(metadata.thresholdBreaches),
          legalProfileApplied:
            typeof metadata.legalProfileApplied === "string" ? metadata.legalProfileApplied : null,
          lawPackIdsApplied: getTelemetryStringArray(metadata.lawPackIdsApplied),
          rulesEngine:
            metadata.rulesEngine && typeof metadata.rulesEngine === "object" && !Array.isArray(metadata.rulesEngine)
              ? metadata.rulesEngine
              : null,
          governanceCritic:
            metadata.governanceCritic &&
            typeof metadata.governanceCritic === "object" &&
            !Array.isArray(metadata.governanceCritic)
              ? metadata.governanceCritic
              : null,
          sourceAttributionVerifier:
            metadata.sourceAttributionVerifier &&
            typeof metadata.sourceAttributionVerifier === "object" &&
            !Array.isArray(metadata.sourceAttributionVerifier)
              ? metadata.sourceAttributionVerifier
              : null,
          factProvenanceVerifier:
            metadata.factProvenanceVerifier &&
            typeof metadata.factProvenanceVerifier === "object" &&
            !Array.isArray(metadata.factProvenanceVerifier)
              ? metadata.factProvenanceVerifier
              : null,
          actionConfirmationVerifier:
            metadata.actionConfirmationVerifier &&
            typeof metadata.actionConfirmationVerifier === "object" &&
            !Array.isArray(metadata.actionConfirmationVerifier)
              ? metadata.actionConfirmationVerifier
              : null,
          reviewRelease:
            metadata.reviewRelease &&
            typeof metadata.reviewRelease === "object" &&
            !Array.isArray(metadata.reviewRelease)
              ? metadata.reviewRelease
              : null,
          shadowPolicy:
            metadata.shadowPolicy &&
            typeof metadata.shadowPolicy === "object" &&
            !Array.isArray(metadata.shadowPolicy)
              ? metadata.shadowPolicy
              : null,
        };
      })(),
    ]),
  );
  const incidentById = new Map(
    incidentRows.map((row) => {
      const playbook = getTelemetryMetadataRecord(row.playbook);
      const governanceEvidence =
        playbook.governanceEvidence &&
        typeof playbook.governanceEvidence === "object" &&
        !Array.isArray(playbook.governanceEvidence)
          ? playbook.governanceEvidence
          : null;
      return [
        row.id,
        {
          title: row.title,
          severity: row.severity,
          status: row.status,
          governanceEvidence,
        },
      ];
    }),
  );
  const workflowById = new Map(
    workflowRows.map((row) => [
      row.id,
      {
        legalProfileApplied: row.legalProfile,
        lawPackIdsApplied: getTelemetryStringArray(row.lawPackIds),
        decisionTier: row.decisionTier,
        committeeType: row.committeeType,
        requiredApprovers: getTelemetryStringArray(row.requiredApprovers),
      },
    ]),
  );
  const systemById = new Map(
    systemRows.map((row) => [
      row.id,
      {
        legalProfileApplied: row.legalProfile,
        lawPackIdsApplied: getTelemetryStringArray(row.lawPackIds),
        riskLevel: row.riskLevel,
        status: row.status,
      },
    ]),
  );
  const evidenceById = new Map(
    evidenceRows.map((row) => {
      const metadata = getTelemetryMetadataRecord(row.metadata);
      return [
        row.id,
        {
          systemId: row.systemId,
          workflowId: row.workflowId,
          legalProfileApplied:
            typeof metadata.legalProfileApplied === "string" ? metadata.legalProfileApplied : null,
          lawPackIdsApplied: getTelemetryStringArray(metadata.lawPackIdsApplied),
          lawPackSources: getTelemetryStringArray(metadata.lawPackSources),
          governanceScopeSource:
            typeof metadata.governanceScopeSource === "string" ? metadata.governanceScopeSource : null,
        },
      ];
    }),
  );

  return logs.map((log) => ({
    ...log,
    context:
      telemetryById.get(log.entityId) ||
      incidentById.get(log.entityId) ||
      workflowById.get(log.entityId) ||
      systemById.get(log.entityId) ||
      evidenceById.get(log.entityId) ||
      null,
  }));
}

export function mapUserRoleToMembershipRole(username: string, userRole: string): string {
  if (username === "admin") return "owner";
  if (userRole === "admin") return "admin";
  return userRole;
}

export async function ensureUserDefaultMembership(user: { id: string; username: string; role: string }) {
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

export async function buildAndPersistAuthPayload(
  req: Request,
): Promise<Awaited<ReturnType<typeof buildAuthUserPayload>>> {
  await ensureUserDefaultMembership(req.user!);
  const payload = await buildAuthUserPayload(req.user!, req.session.currentOrganizationId);
  req.session.currentOrganizationId = payload.currentOrganizationId ?? undefined;
  return payload;
}

export async function regenerateSessionForUser(req: Request, user: Express.User): Promise<void> {
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

export function getOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function getErrorStatus(error: unknown, fallback = 400): number {
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

export type RequestWindowState = {
  count: number;
  windowStart: number;
};

export const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_RATE_LIMIT_ATTEMPTS = 5;
export const passwordResetAttemptsByIp = new Map<string, RequestWindowState>();

export function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].split(",")[0].trim();
  }
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "unknown";
}

export function getRequestWindowState(map: Map<string, RequestWindowState>, key: string, now: number): RequestWindowState {
  const current = map.get(key);
  if (!current || now - current.windowStart > PASSWORD_RESET_RATE_LIMIT_WINDOW_MS) {
    const fresh = { count: 0, windowStart: now };
    map.set(key, fresh);
    return fresh;
  }
  return current;
}

export function isPasswordResetRateLimited(ip: string): boolean {
  const windowState = getRequestWindowState(passwordResetAttemptsByIp, ip, Date.now());
  return windowState.count >= PASSWORD_RESET_RATE_LIMIT_ATTEMPTS;
}

export function trackPasswordResetRequest(ip: string) {
  const windowState = getRequestWindowState(passwordResetAttemptsByIp, ip, Date.now());
  windowState.count += 1;
}

export async function recordAdminAuditEvent(input: {
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

export const routeParam = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

export function normalizeNextPath(nextPath?: string): string {
  if (!nextPath) return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("//")) return "/";
  return nextPath;
}

export function getOrganizationSettingsObject(rawSettings: unknown): Record<string, unknown> {
  return rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? { ...(rawSettings as Record<string, unknown>) }
    : {};
}

export function normalizeDomains(domains: string[]): string[] {
  const normalized = domains
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
    .map((domain) => (domain.startsWith("@") ? domain.slice(1) : domain));
  return Array.from(new Set(normalized));
}

export const ssoDefaultRoleOptions = ["owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"] as const;

export type OrgAuthSettings = {
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

export function getOrgAuthSettings(rawSettings: unknown): OrgAuthSettings {
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

export function applyOrgAuthSettings(rawSettings: unknown, authSettings: OrgAuthSettings): Record<string, unknown> {
  const settingsObject =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? { ...(rawSettings as Record<string, unknown>) }
      : {};
  settingsObject.auth = authSettings;
  return settingsObject;
}

export function getAnalyticsReportBuilderSettings(rawSettings: unknown) {
  const { sanitizeAnalyticsReportBuilderConfig } = require("@shared/analytics-report-builder");
  const settingsObject = getOrganizationSettingsObject(rawSettings);
  return sanitizeAnalyticsReportBuilderConfig(settingsObject.analyticsReportBuilder);
}

export function applyAnalyticsReportBuilderSettings(rawSettings: unknown, nextValue: unknown): Record<string, unknown> {
  const { sanitizeAnalyticsReportBuilderConfig } = require("@shared/analytics-report-builder");
  const settingsObject = getOrganizationSettingsObject(rawSettings);
  settingsObject.analyticsReportBuilder = sanitizeAnalyticsReportBuilderConfig(nextValue);
  return settingsObject;
}

export function getGovernanceAutomationSettings(rawSettings: unknown) {
  const { sanitizeGovernanceAutomationConfig } = require("@shared/governance-automation-builder");
  const settingsObject = getOrganizationSettingsObject(rawSettings);
  return sanitizeGovernanceAutomationConfig(settingsObject.governanceAutomationConfig);
}

export function applyGovernanceAutomationSettings(rawSettings: unknown, nextValue: unknown): Record<string, unknown> {
  const { sanitizeGovernanceAutomationConfig } = require("@shared/governance-automation-builder");
  const settingsObject = getOrganizationSettingsObject(rawSettings);
  settingsObject.governanceAutomationConfig = sanitizeGovernanceAutomationConfig(nextValue);
  return settingsObject;
}

export function getThreatIntelligenceSettings(rawSettings: unknown) {
  const { sanitizeThreatIntelConfig } = require("@shared/threat-intelligence");
  const settingsObject = getOrganizationSettingsObject(rawSettings);
  return sanitizeThreatIntelConfig(settingsObject.threatIntelligenceConfig);
}

export function applyThreatIntelligenceSettings(rawSettings: unknown, nextValue: unknown): Record<string, unknown> {
  const { sanitizeThreatIntelConfig } = require("@shared/threat-intelligence");
  const settingsObject = getOrganizationSettingsObject(rawSettings);
  settingsObject.threatIntelligenceConfig = sanitizeThreatIntelConfig(nextValue);
  return settingsObject;
}
