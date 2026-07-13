import type { Express, Request } from "express";
import passport from "passport";
import { storage } from "../storage";
import {
  buildTotpOtpAuthUrl,
  clearSessionCookie,
  buildNextPasswordHistory,
  comparePasswords,
  consumeRecoveryCode,
  finalizeSuccessfulLocalLogin,
  generateTotpSecret,
  getPasswordExpiryDate,
  hashPassword,
  issueRecoveryCodes,
  isPasswordReused,
  validatePasswordStrength,
  verifyTotpCode,
} from "../auth";
import { requireAuth } from "../auth";
import { isPlatformAdminUser, pickCurrentOrganizationId } from "../auth-visibility";
import { memberships, organizations, type User } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { ssoService } from "../services/ssoService";
import {
  SSO_LOGIN_EXCHANGE_CODE_PATTERN,
  ssoLoginExchangeService,
} from "../services/ssoLoginExchangeService";
import { ssoPendingStateService } from "../services/ssoPendingStateService";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  deliverPasswordReset,
  isPasswordResetTokenValidForUser,
  verifyPasswordResetToken,
} from "../services/passwordResetService";
import {
  areMockAuthRoutesEnabled,
  getPublicAppBaseUrl,
  isSelfSignupEnabled,
} from "../env";
import {
  encryptPersistedSecret,
  integrationSecretPurpose,
  isPersistedSecretEnvelope,
  resolvePersistedSecret,
} from "../persisted-secret";
import { mfaSecurityService } from "../services/mfaSecurityService";
import { toPublicHttpError } from "../http-error-response";
import { isTrustedAuthRequestOrigin } from "../auth-origin";
import { secretsMatch } from "../secret-comparison";
import {
  buildAndPersistAuthPayload,
  regenerateSessionForUser,
  getOptionalString,
  getOrgAuthSettings,
  normalizeNextPath,
  recordAdminAuditEvent,
} from "./_helpers";
import {
  enforceSharedRateLimits,
  getRateLimitClientAddress,
  globalRateLimitIdentity,
  publicRateLimitPolicies,
} from "../public-rate-limit";
import {
  DEFAULT_GUIDED_MODE,
  DEFAULT_WORKSPACE_LOCALE,
  sanitizeAccessibilityPreferences,
  sanitizeDashboardWidgets,
  sanitizeNotificationPreferences,
  sanitizeWorkspaceLocale,
} from "@shared/operator-preferences";
import { z } from "zod";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(12, "New password must be at least 12 characters long"),
});

const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
});

const resetPasswordSchema = z.object({
  token: z.string().trim().min(20),
  newPassword: z.string().min(12, "New password must be at least 12 characters long"),
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

const ssoLoginExchangeSchema = z.object({
  code: z.string().regex(SSO_LOGIN_EXCHANGE_CODE_PATTERN),
});

const oidcCallbackQuerySchema = z.object({
  code: z.string().trim().min(3).max(2000),
  state: z.string().trim().min(8).max(200),
});

function isBrowserNavigationRequest(req: Request): boolean {
  return (req.get("accept") ?? "")
    .split(",")
    .some((value) => value.trim().toLowerCase().startsWith("text/html"));
}

function buildSsoSuccessRedirect(nextPath: string): string {
  const publicBaseUrl = `${getPublicAppBaseUrl().replace(/\/+$/, "")}/`;
  return new URL(ssoService.normalizeNextPath(nextPath), publicBaseUrl).toString();
}

function buildSsoExchangeRedirect(code: string): string {
  const target = new URL("/auth/sso/complete", `${getPublicAppBaseUrl().replace(/\/+$/, "")}/`);
  target.hash = new URLSearchParams({ sso_exchange: code }).toString();
  return target.toString();
}

function toSessionUser(user: Pick<User, "id" | "username" | "fullName" | "email" | "role" | "isPlatformAdmin" | "sessionVersion">): Express.User {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    isPlatformAdmin: user.isPlatformAdmin,
    sessionVersion: user.sessionVersion,
  };
}

const oidcMockCallbackSchema = z.object({
  state: z.string().trim().min(8).max(200),
  email: z.string().trim().email(),
  fullName: z.string().trim().min(1).max(200).optional(),
  providerSubject: z.string().trim().min(1).max(255).optional(),
});

function getSsoCompletionPublicError(error: unknown, internalMessage: string) {
  const message =
    error && typeof error === "object" && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : "";
  if (message === "Organization not found") {
    return { status: 404, message, code: "NOT_FOUND" };
  }
  return toPublicHttpError(error, { fallbackStatus: 500, internalMessage });
}

const onboardingStateSchema = z.object({
  currentStep: z.number().int().min(0).max(10).optional(),
  completedSteps: z.array(z.string().trim().min(1).max(80)).max(10).optional(),
  dismissedAlerts: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  snoozedAlerts: z.record(z.string().trim().min(1).max(80), z.string().datetime()).optional(),
  dashboardView: z.string().optional(),
  dashboardWidgets: z.array(z.string()).optional(),
  notificationPreferences: z
    .object({
      priorityOnly: z.boolean().optional(),
      mutedTypes: z.array(z.string()).optional(),
      feedMode: z.string().optional(),
    })
    .optional(),
  accessibilityPreferences: z
    .object({
      highContrast: z.boolean().optional(),
      reducedMotion: z.boolean().optional(),
      fontScale: z.string().optional(),
    })
    .optional(),
  workspaceLocale: z.string().optional(),
  guidedMode: z.boolean().optional(),
});

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
  if (mfaCode && user.mfaSecret) {
    const resolved = resolvePersistedSecret(
      user.mfaSecret,
      integrationSecretPurpose.mfaTotpSecret(user.id),
    );
    if (resolved.plaintext && verifyTotpCode(resolved.plaintext, mfaCode)) {
      if (resolved.isLegacyPlaintext && process.env.CONTROL_TOWER_VAULT_SECRET?.trim()) {
        await storage.updateUserMfaSecretIfUnchanged(
          user.id,
          user.mfaSecret,
          encryptPersistedSecret(
            resolved.plaintext,
            integrationSecretPurpose.mfaTotpSecret(user.id),
          ),
        );
      }
      return { valid: true, usedRecoveryCode: false, remainingRecoveryCodes: [] };
    }
  }

  const recoveryCode = getOptionalString(input.recoveryCode);
  if (recoveryCode) {
    const consumed = await consumeRecoveryCode(recoveryCode, user.mfaRecoveryCodes);
    if (consumed.valid) {
      const expectedRecoveryCodes = Array.isArray(user.mfaRecoveryCodes)
        ? user.mfaRecoveryCodes.filter((entry): entry is string => typeof entry === "string")
        : [];
      const persisted = await storage.consumeUserMfaRecoveryCodes(
        user.id,
        expectedRecoveryCodes,
        consumed.remainingRecoveryCodes,
      );
      if (!persisted) return { valid: false };
      if (
        user.mfaSecret &&
        !isPersistedSecretEnvelope(user.mfaSecret) &&
        process.env.CONTROL_TOWER_VAULT_SECRET?.trim()
      ) {
        await storage.updateUserMfaSecretIfUnchanged(
          user.id,
          user.mfaSecret,
          encryptPersistedSecret(
            user.mfaSecret,
            integrationSecretPurpose.mfaTotpSecret(user.id),
          ),
        );
      }
      return {
        valid: true,
        usedRecoveryCode: true,
        remainingRecoveryCodes: consumed.remainingRecoveryCodes,
      };
    }
  }

  return { valid: false };
}

export async function registerAuthRoutes(app: Express): Promise<void> {
  app.use("/api/auth", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, private, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });

  app.post("/api/auth/register", async (req, res) => {
    if (!isTrustedAuthRequestOrigin(req)) {
      res.setHeader("X-Error-Code", "ORIGIN_NOT_ALLOWED");
      return res.status(403).json({ message: "Request origin is not allowed", code: "ORIGIN_NOT_ALLOWED" });
    }
    if (!isSelfSignupEnabled()) {
      return res.status(403).json({ message: "Self-service registration is disabled" });
    }
    const clientAddress = getRateLimitClientAddress(req);
    if (
      !(await enforceSharedRateLimits(req, res, [
        { policy: publicRateLimitPolicies.registrationGlobal, identity: globalRateLimitIdentity() },
        { policy: publicRateLimitPolicies.registrationIp, identity: [clientAddress] },
      ]))
    ) {
      return;
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
      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashed,
        fullName,
        email: email || null,
        role: "reviewer",
      });
      const loginUser: Express.User = {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isPlatformAdmin: user.isPlatformAdmin,
        sessionVersion: user.sessionVersion,
      };
      try {
        await regenerateSessionForUser(req, loginUser);
        const authPayload = await buildAndPersistAuthPayload(req);
        return res.status(201).json(authPayload);
      } catch (authErr: any) {
        console.error("Login failed after registration:", authErr);
        return res.status(500).json({ message: "Login failed after registration" });
      }
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An account with this username or email already exists" });
      }
      console.error("Registration failed:", err);
      return res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { identifier } = forgotPasswordSchema.parse(req.body ?? {});
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.forgotPasswordGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.forgotPasswordIp, identity: [clientAddress] },
          {
            policy: publicRateLimitPolicies.forgotPasswordAccount,
            identity: [identifier.toLowerCase()],
          },
        ]))
      ) {
        return;
      }

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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid password reset request" });
      }
      console.error("Password reset request failed:", err);
      return res.status(202).json({
        ok: true,
        message: "If an eligible local account exists, a password reset link has been sent.",
      });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, newPassword } = resetPasswordSchema.parse(req.body ?? {});
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.resetPasswordGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.resetPasswordIp, identity: [clientAddress] },
          { policy: publicRateLimitPolicies.resetPasswordToken, identity: [token] },
        ]))
      ) {
        return;
      }
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
        expectedCurrentPasswordHash: user.password,
      });
      if (!updated) {
        return res.status(400).json({ message: "Password reset token is invalid or expired" });
      }

      return res.json({
        ok: true,
        message: "Password reset successful. You can now sign in with your new password.",
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid password reset request" });
      }
      console.error("Password reset failed:", err);
      return res.status(500).json({ message: "Password reset failed" });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    if (!isTrustedAuthRequestOrigin(req)) {
      res.setHeader("X-Error-Code", "ORIGIN_NOT_ALLOWED");
      return res.status(403).json({ message: "Request origin is not allowed", code: "ORIGIN_NOT_ALLOWED" });
    }
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) {
        if (info?.message === "RATE_LIMITED") {
          const retryAfterSeconds = Math.max(
            1,
            Math.ceil((req.loginRateLimitRetryAfterMs ?? 5 * 60 * 1_000) / 1_000),
          );
          res.setHeader("Retry-After", String(retryAfterSeconds));
          res.setHeader("X-Error-Code", "RATE_LIMIT_EXCEEDED");
          return res.status(429).json({
            message: "Too many login attempts. Try again later.",
            code: "RATE_LIMIT_EXCEEDED",
          });
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
          const breakGlassAllowed = secretsMatch(
            configuredBreakGlassToken,
            suppliedBreakGlassToken,
          );

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

          let usedBreakGlass = false;
          if (selectedMembership) {
            const selectedAuthSettings = getOrgAuthSettings(selectedMembership.organizationSettings);
            const ssoEnforced =
              (selectedAuthSettings.mode === "saml" || selectedAuthSettings.mode === "oidc") &&
              selectedAuthSettings.enforceSso;
            if (ssoEnforced && !breakGlassAllowed) {
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
            usedBreakGlass = ssoEnforced && breakGlassAllowed;
          }

          if (storedUser.mfaEnabled) {
            if (!storedUser.mfaSecret) {
              return res.status(500).json({ message: "MFA is enabled but not configured correctly" });
            }

            const mfaAttemptState = await mfaSecurityService.getAttemptState(storedUser.id);
            if (!mfaAttemptState.allowed) {
              return res.status(429).json({
                message: "Too many MFA attempts. Try again in 5 minutes.",
                mfaRequired: true,
              });
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
              const nextAttemptState = await mfaSecurityService.recordFailure(storedUser.id);
              if (!nextAttemptState.allowed) {
                return res.status(429).json({
                  message: "Too many MFA attempts. Try again in 5 minutes.",
                  mfaRequired: true,
                });
              }
              return res.status(401).json({ message: "MFA verification required", mfaRequired: true });
            }
            await mfaSecurityService.clearFailures(storedUser.id);
          }

          await finalizeSuccessfulLocalLogin(req, storedUser.id);
          if (usedBreakGlass && selectedMembership) {
            await recordAdminAuditEvent({
              organizationId: selectedMembership.organizationId,
              actorUserId: storedUser.id,
              actorName: storedUser.fullName || storedUser.username,
              action: "auth.break_glass_login",
              targetType: "user",
              targetId: storedUser.id,
              targetUserId: storedUser.id,
              metadata: {
                requestId: req.requestId ?? null,
                organizationSlug: selectedMembership.organizationSlug,
              },
            });
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
        clearSessionCookie(res);
        res.json({ message: "Logged out" });
      });
    });
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
        expectedCurrentPasswordHash: user.password,
      });
      if (!updated) {
        return res.status(409).json({ message: "Password changed in another session; try again" });
      }

      await regenerateSessionForUser(req, {
        id: updated.id,
        username: updated.username,
        fullName: updated.fullName,
        email: updated.email,
        role: updated.role,
        isPlatformAdmin: updated.isPlatformAdmin,
        sessionVersion: updated.sessionVersion,
      });

      const authPayload = await buildAndPersistAuthPayload(req);
      return res.json({ message: "Password updated", user: authPayload });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.issues[0]?.message || "Invalid password change request",
        });
      }
      console.error("Password change failed:", err);
      return res.status(500).json({ message: "Password change failed" });
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
    if ((user.authProvider ?? "local") !== "local") {
      return res.status(400).json({ message: "MFA for SSO-managed accounts must be configured with the identity provider" });
    }
    const currentPassword = getOptionalString(req.body?.currentPassword);
    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required to start MFA enrollment" });
    }
    if (!(await comparePasswords(currentPassword, user.password))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const secret = generateTotpSecret();
    const encryptedSecret = encryptPersistedSecret(
      secret,
      integrationSecretPurpose.mfaTotpSecret(user.id),
    );
    const updated = await storage.updateUserMfa(user.id, {
      mfaEnabled: false,
      mfaSecret: encryptedSecret,
      mfaRecoveryCodes: [],
    });
    if (!updated) {
      return res.status(500).json({ message: "Failed to start MFA enrollment" });
    }
    await regenerateSessionForUser(req, toSessionUser(updated));

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
    const resolvedSecret = resolvePersistedSecret(
      user.mfaSecret,
      integrationSecretPurpose.mfaTotpSecret(user.id),
    ).plaintext;
    if (!resolvedSecret || !verifyTotpCode(resolvedSecret, code)) {
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
    await regenerateSessionForUser(req, toSessionUser(updated));

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
    await regenerateSessionForUser(req, toSessionUser(updated));

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
    await regenerateSessionForUser(req, toSessionUser(updated));

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

    const membershipsList = await storage.getMembershipsByUserId(req.user!.id);
    const membership = membershipsList.find(
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
      dashboardView: "operations",
      dashboardWidgets: [],
      notificationPreferences: sanitizeNotificationPreferences(null),
      accessibilityPreferences: sanitizeAccessibilityPreferences(null),
      workspaceLocale: DEFAULT_WORKSPACE_LOCALE,
      guidedMode: DEFAULT_GUIDED_MODE,
      updatedAt: null,
    };

    const dashboardView = parsed.data.dashboardView ?? existingState.dashboardView;
    const dashboardWidgets = sanitizeDashboardWidgets(
      parsed.data.dashboardWidgets ?? existingState.dashboardWidgets,
      existingState.dashboardWidgets,
    );
    const notificationPreferences = sanitizeNotificationPreferences(
      parsed.data.notificationPreferences ?? existingState.notificationPreferences,
    );
    const accessibilityPreferences = sanitizeAccessibilityPreferences(
      parsed.data.accessibilityPreferences ?? existingState.accessibilityPreferences,
    );
    const workspaceLocale = sanitizeWorkspaceLocale(parsed.data.workspaceLocale ?? existingState.workspaceLocale);

    const nextState = {
      currentStep: parsed.data.currentStep ?? existingState.currentStep,
      completedSteps: parsed.data.completedSteps
        ? Array.from(new Set(parsed.data.completedSteps)).slice(0, 10)
        : existingState.completedSteps,
      dismissedAlerts: parsed.data.dismissedAlerts
        ? Array.from(new Set(parsed.data.dismissedAlerts)).slice(0, 20)
        : existingState.dismissedAlerts,
      snoozedAlerts: parsed.data.snoozedAlerts ?? existingState.snoozedAlerts,
      dashboardView,
      dashboardWidgets,
      notificationPreferences,
      accessibilityPreferences,
      workspaceLocale,
      guidedMode: parsed.data.guidedMode ?? existingState.guidedMode,
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
    const membershipsList = await storage.getMembershipsByUserId(req.user!.id);
    if (!isPlatformAdminUser(req.user!)) {
      const currentOrganizationId = pickCurrentOrganizationId(req.session.currentOrganizationId, membershipsList);
      if (!currentOrganizationId || currentOrganizationId !== organizationId) {
        return res.status(403).json({ message: "Cross-organization switching is restricted to platform admins" });
      }
    }
    const membership = membershipsList.find(
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
      console.error("Failed to refresh session:", err);
      return res.status(500).json({ message: "Failed to refresh session" });
    }
  });

  app.get("/api/auth/sso/metadata", async (req, res) => {
    const clientAddress = getRateLimitClientAddress(req);
    if (
      !(await enforceSharedRateLimits(req, res, [
        { policy: publicRateLimitPolicies.ssoMetadataGlobal, identity: globalRateLimitIdentity() },
        { policy: publicRateLimitPolicies.ssoMetadataIp, identity: [clientAddress] },
      ]))
    ) {
      return;
    }

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
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.ssoStartGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.ssoStartIp, identity: [clientAddress] },
        ]))
      ) {
        return;
      }
      const parsed = ssoStartSchema.parse({
        org: Array.isArray(req.query.org) ? req.query.org[0] : req.query.org,
        next: Array.isArray(req.query.next) ? req.query.next[0] : req.query.next,
      });
      const nextPath = ssoService.normalizeNextPath(parsed.next);
      const started = await ssoService.startLogin(
        parsed.org,
        nextPath,
        req.isAuthenticated?.() ? req.user?.id : undefined,
        req.protocol,
        req.get("host"),
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid SSO start request" });
      }
      console.error("Failed to start SAML login:", err);
      return res.status(500).json({ message: "Unable to start SAML login" });
    }
  });

  app.get("/api/auth/oidc/start", async (req, res) => {
    try {
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.ssoStartGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.ssoStartIp, identity: [clientAddress] },
        ]))
      ) {
        return;
      }
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid OIDC start request" });
      }
      console.error("Failed to start OIDC login:", err);
      return res.status(500).json({ message: "Unable to start OIDC login" });
    }
  });

  app.post("/api/auth/sso/callback", async (req, res) => {
    try {
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.ssoCallbackGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.ssoCallbackIp, identity: [clientAddress] },
        ]))
      ) {
        return;
      }
      const relayState = getOptionalString(req.body?.RelayState);
      const samlResponse = getOptionalString(req.body?.SAMLResponse);
      const parsed = ssoAcsBodySchema.parse({
        RelayState: relayState,
        SAMLResponse: samlResponse,
      });

      const pending = await ssoPendingStateService.consume(parsed.RelayState, "saml");
      (req.session as any).ssoPending = undefined;
      if (!pending) {
        return res.status(400).json({ message: "SSO state is invalid, expired, or already used" });
      }

      const organization = await storage.getOrganizationById(pending.organizationId);
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
        pending,
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
        completed = await ssoService.completeLogin(pending, {
          email: principal.email,
          fullName: principal.fullName,
          providerSubject: principal.providerSubject,
          externalGroup: principal.externalGroup,
        });
      } catch (completionError: any) {
        (req.session as any).ssoPending = undefined;
        const publicError = getSsoCompletionPublicError(
          completionError,
          "Failed to complete SSO callback",
        );
        if (publicError.status >= 500) {
          console.error("Failed to complete SSO callback:", completionError);
        }
        return res.status(publicError.status).json({ message: publicError.message });
      }

      if (isBrowserNavigationRequest(req)) {
        const exchange = await ssoLoginExchangeService.issue({
          userId: completed.user.id,
          organizationId: completed.organization.id,
          nextPath: completed.next,
        });
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        return res.redirect(303, buildSsoExchangeRedirect(exchange.code));
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid SSO callback request" });
      }
      const publicError = toPublicHttpError(err, {
        fallbackStatus: 500,
        internalMessage: "Failed to complete SSO callback",
      });
      if (publicError.status >= 500) {
        console.error("Failed to process SSO callback:", err);
      }
      return res.status(publicError.status).json({ message: publicError.message });
    }
  });

  app.post("/api/auth/sso/mock-callback", async (req, res) => {
    if (!areMockAuthRoutesEnabled() || !ssoService.areInsecureSamlTestFixturesAllowed()) {
      return res.status(404).json({ message: "Not found" });
    }

    try {
      const parsed = ssoMockCallbackSchema.parse(req.body ?? {});
      const pending = await ssoPendingStateService.consume(parsed.state, "saml");
      (req.session as any).ssoPending = undefined;
      if (!pending) {
        return res.status(400).json({ message: "SSO state is invalid, expired, or already used" });
      }

      let completed;
      try {
        completed = await ssoService.completeLogin(pending, {
          email: parsed.email,
          fullName: parsed.fullName,
          providerSubject: parsed.email,
        });
      } catch (completionError: any) {
        (req.session as any).ssoPending = undefined;
        const publicError = getSsoCompletionPublicError(
          completionError,
          "Failed to complete SSO callback",
        );
        if (publicError.status >= 500) {
          console.error("Failed to complete mock SSO callback:", completionError);
        }
        return res.status(publicError.status).json({ message: publicError.message });
      }

      await regenerateSessionForUser(req, completed.user);
      req.session.currentOrganizationId = completed.organization.id;
      (req.session as any).ssoPending = undefined;

      const authUser = await buildAndPersistAuthPayload(req);
      if (isBrowserNavigationRequest(req)) {
        return res.redirect(303, buildSsoSuccessRedirect(completed.next));
      }
      return res.json({
        ok: true,
        next: completed.next,
        user: authUser,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid SSO callback request" });
      }
      const publicError = toPublicHttpError(err, {
        fallbackStatus: 500,
        internalMessage: "Failed to complete SSO callback",
      });
      if (publicError.status >= 500) {
        console.error("Failed to process mock SSO callback:", err);
      }
      return res.status(publicError.status).json({ message: publicError.message });
    }
  });

  app.get("/api/auth/oidc/callback", async (req, res) => {
    try {
      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.ssoCallbackGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.ssoCallbackIp, identity: [clientAddress] },
        ]))
      ) {
        return;
      }
      const parsed = oidcCallbackQuerySchema.parse({
        code: Array.isArray(req.query.code) ? req.query.code[0] : req.query.code,
        state: Array.isArray(req.query.state) ? req.query.state[0] : req.query.state,
      });
      const pending = await ssoPendingStateService.consume(parsed.state, "oidc");
      (req.session as any).ssoPending = undefined;
      if (!pending) {
        return res.status(400).json({ message: "OIDC state is invalid, expired, or already used" });
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
        const publicError = getSsoCompletionPublicError(
          completionError,
          "Failed to complete OIDC callback",
        );
        if (publicError.status >= 500) {
          console.error("Failed to complete OIDC callback:", completionError);
        }
        return res.status(publicError.status).json({ message: publicError.message });
      }

      if (isBrowserNavigationRequest(req)) {
        const exchange = await ssoLoginExchangeService.issue({
          userId: completed.user.id,
          organizationId: completed.organization.id,
          nextPath: completed.next,
        });
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        return res.redirect(303, buildSsoExchangeRedirect(exchange.code));
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid OIDC callback request" });
      }
      const publicError = toPublicHttpError(err, {
        fallbackStatus: 500,
        internalMessage: "Failed to complete OIDC callback",
      });
      if (publicError.status >= 500) {
        console.error("Failed to process OIDC callback:", err);
      }
      return res.status(publicError.status).json({ message: publicError.message });
    }
  });

  app.post("/api/auth/sso/exchange", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Pragma", "no-cache");

    try {
      if (!isTrustedAuthRequestOrigin(req)) {
        res.setHeader("X-Error-Code", "ORIGIN_NOT_ALLOWED");
        return res.status(403).json({
          message: "Request origin is not allowed",
          code: "ORIGIN_NOT_ALLOWED",
        });
      }

      const clientAddress = getRateLimitClientAddress(req);
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.ssoExchangeGlobal, identity: globalRateLimitIdentity() },
          { policy: publicRateLimitPolicies.ssoExchangeIp, identity: [clientAddress] },
        ]))
      ) {
        return;
      }

      const parsed = ssoLoginExchangeSchema.parse(req.body ?? {});
      if (
        !(await enforceSharedRateLimits(req, res, [
          { policy: publicRateLimitPolicies.ssoExchangeToken, identity: [parsed.code] },
        ]))
      ) {
        return;
      }

      const claimed = await ssoLoginExchangeService.consume(parsed.code);
      if (!claimed) {
        res.setHeader("X-Error-Code", "SSO_EXCHANGE_INVALID");
        return res.status(400).json({
          message: "The sign-in handoff is invalid, expired, or has already been used.",
          code: "SSO_EXCHANGE_INVALID",
        });
      }

      const [user, membershipsList] = await Promise.all([
        storage.getUser(claimed.userId),
        storage.getMembershipsByUserId(claimed.userId),
      ]);
      const membership = membershipsList.find(
        (candidate) =>
          candidate.organizationId === claimed.organizationId &&
          candidate.membershipState === "active" &&
          candidate.organizationStatus === "active",
      );
      if (!user || !membership) {
        res.setHeader("X-Error-Code", "SSO_EXCHANGE_INVALID");
        return res.status(400).json({
          message: "The sign-in handoff is invalid, expired, or has already been used.",
          code: "SSO_EXCHANGE_INVALID",
        });
      }

      await regenerateSessionForUser(req, user);
      req.session.currentOrganizationId = claimed.organizationId;
      const authUser = await buildAndPersistAuthPayload(req);

      return res.json({
        ok: true,
        next: ssoService.normalizeNextPath(claimed.nextPath),
        user: authUser,
      });
    } catch (err: unknown) {
      if (err instanceof z.ZodError) {
        res.setHeader("X-Error-Code", "SSO_EXCHANGE_INVALID");
        return res.status(400).json({
          message: "The sign-in handoff is invalid, expired, or has already been used.",
          code: "SSO_EXCHANGE_INVALID",
        });
      }
      const publicError = toPublicHttpError(err, {
        fallbackStatus: 500,
        internalMessage: "Failed to complete SSO login exchange",
      });
      if (publicError.status >= 500) {
        console.error("Failed to complete SSO login exchange:", err);
      }
      return res.status(publicError.status).json({
        message: publicError.message,
        code: publicError.code,
      });
    }
  });

  app.post("/api/auth/oidc/mock-callback", async (req, res) => {
    if (!areMockAuthRoutesEnabled()) {
      return res.status(404).json({ message: "Not found" });
    }

    try {
      const parsed = oidcMockCallbackSchema.parse(req.body ?? {});
      const pending = await ssoPendingStateService.consume(parsed.state, "oidc");
      (req.session as any).ssoPending = undefined;
      if (!pending) {
        return res.status(400).json({ message: "OIDC state is invalid, expired, or already used" });
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
        const publicError = getSsoCompletionPublicError(
          completionError,
          "Failed to complete OIDC callback",
        );
        if (publicError.status >= 500) {
          console.error("Failed to complete mock OIDC callback:", completionError);
        }
        return res.status(publicError.status).json({ message: publicError.message });
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
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid OIDC callback request" });
      }
      const publicError = toPublicHttpError(err, {
        fallbackStatus: 500,
        internalMessage: "Failed to complete OIDC callback",
      });
      if (publicError.status >= 500) {
        console.error("Failed to process mock OIDC callback:", err);
      }
      return res.status(publicError.status).json({ message: publicError.message });
    }
  });
}
