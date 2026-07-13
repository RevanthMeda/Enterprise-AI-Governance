import type { Express, Request } from "express";
import passport from "passport";
import { storage } from "../storage";
import {
  buildTotpOtpAuthUrl,
  clearSessionCookie,
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
} from "../auth";
import { requireAuth } from "../auth";
import { isPlatformAdminUser, pickCurrentOrganizationId } from "../auth-visibility";
import { memberships, organizations } from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { ssoService } from "../services/ssoService";
import {
  buildPasswordResetUrl,
  createPasswordResetToken,
  deliverPasswordReset,
  isPasswordResetTokenValidForUser,
  verifyPasswordResetToken,
} from "../services/passwordResetService";
import { areMockAuthRoutesEnabled, parseBooleanEnv } from "../env";
import {
  buildAndPersistAuthPayload,
  regenerateSessionForUser,
  getOptionalString,
  getOrgAuthSettings,
  getClientIp,
  isPasswordResetRateLimited,
  trackPasswordResetRequest,
  normalizeNextPath,
} from "./_helpers";
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

export async function registerAuthRoutes(app: Express): Promise<void> {
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
        isPlatformAdmin: user.isPlatformAdmin,
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
        isPlatformAdmin: updated.isPlatformAdmin,
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
      return res.status(500).json({ message: err.message || "Failed to refresh session" });
    }
  });

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

      const pending = (req.session as any).ssoPending as import("../services/ssoService").SsoPendingState | undefined;
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
      const pending = (req.session as any).ssoPending as import("../services/ssoService").SsoPendingState | undefined;
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
      const pending = (req.session as any).ssoPending as import("../services/ssoService").SsoPendingState | undefined;
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
      const pending = (req.session as any).ssoPending as import("../services/ssoService").SsoPendingState | undefined;
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
}
