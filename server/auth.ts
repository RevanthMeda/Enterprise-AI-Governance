import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import bcrypt from "bcrypt";
import connectPgSimple from "connect-pg-simple";
import { createHmac, randomBytes } from "crypto";
import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import type {
  AccessibilityPreferenceState,
  DashboardViewId,
  DashboardWidgetId,
  NotificationPreferenceState,
  WorkspaceLocale,
} from "@shared/operator-preferences";
import {
  DEFAULT_GUIDED_MODE,
  DEFAULT_WORKSPACE_LOCALE,
  getDashboardPreset,
  resolveDefaultDashboardView,
  sanitizeAccessibilityPreferences,
  sanitizeDashboardWidgets,
  sanitizeNotificationPreferences,
  sanitizeWorkspaceLocale,
} from "@shared/operator-preferences";
import { getPgPoolConfig } from "./db-config";
import { getRuntimeConfig } from "./env";
import { getVisibleActiveMemberships, pickCurrentOrganizationId } from "./auth-visibility";

declare global {
  namespace Express {
    interface User {
      id: string;
      username: string;
      fullName: string;
      email: string | null;
      role: string;
    }
  }
}

declare module "express-session" {
  interface SessionData {
    currentOrganizationId?: string;
    createdAt?: number;
    lastActivityAt?: number;
    csrfToken?: string;
  }
}

export interface AuthOrganization {
  id: string;
  name: string;
  slug: string;
  role: string;
  isDefault: boolean;
}

export interface AuthOnboardingState {
  currentStep: number;
  completedSteps: string[];
  dismissedAlerts: string[];
  snoozedAlerts: Record<string, string>;
  dashboardView: DashboardViewId;
  dashboardWidgets: DashboardWidgetId[];
  notificationPreferences: NotificationPreferenceState;
  accessibilityPreferences: AccessibilityPreferenceState;
  workspaceLocale: WorkspaceLocale;
  guidedMode: boolean;
  updatedAt: string | null;
}

export interface AuthUserPayload {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
  mfaEnabled: boolean;
  currentOrganizationId: string | null;
  currentOrganizationOnboarding: AuthOnboardingState | null;
  organizations: AuthOrganization[];
}

const PgStore = connectPgSimple(session);

const PASSWORD_ROTATION_DAYS = 90;
const PASSWORD_HISTORY_LIMIT = 5;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_ROTATION_MS = PASSWORD_ROTATION_DAYS * 24 * 60 * 60 * 1000;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const LOGIN_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_RATE_LIMIT_ATTEMPTS = 5;
const MFA_TOTP_PERIOD_SECONDS = 30;
const MFA_TOTP_DIGITS = 6;
const MFA_RECOVERY_CODES_COUNT = 8;
const MFA_RECOVERY_CODE_LENGTH = 10;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

type LoginWindowState = {
  count: number;
  windowStart: number;
};

const loginAttemptsByIpAndAccount = new Map<string, LoginWindowState>();
const loginAttemptsByAccount = new Map<string, LoginWindowState>();

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

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

function getState(map: Map<string, LoginWindowState>, key: string, now: number): LoginWindowState {
  const current = map.get(key);
  if (!current || now - current.windowStart > LOGIN_RATE_LIMIT_WINDOW_MS) {
    const fresh = { count: 0, windowStart: now };
    map.set(key, fresh);
    return fresh;
  }
  return current;
}

function isLoginRateLimited(ip: string, username: string): boolean {
  const now = Date.now();
  const ipAccountKey = `${ip}:${username}`;
  const byIpAndAccount = getState(loginAttemptsByIpAndAccount, ipAccountKey, now);
  const byAccount = getState(loginAttemptsByAccount, username, now);
  return (
    byIpAndAccount.count >= LOGIN_RATE_LIMIT_ATTEMPTS ||
    byAccount.count >= LOGIN_RATE_LIMIT_ATTEMPTS
  );
}

function trackFailedLogin(ip: string, username: string) {
  const now = Date.now();
  const ipAccountKey = `${ip}:${username}`;
  const byIpAndAccount = getState(loginAttemptsByIpAndAccount, ipAccountKey, now);
  const byAccount = getState(loginAttemptsByAccount, username, now);
  byIpAndAccount.count += 1;
  byAccount.count += 1;
}

function clearFailedLogins(ip: string, username: string) {
  const ipAccountKey = `${ip}:${username}`;
  loginAttemptsByIpAndAccount.delete(ipAccountKey);
  loginAttemptsByAccount.delete(username);
}

export function getPasswordExpiryDate(from: Date = new Date()): Date {
  return new Date(from.getTime() + PASSWORD_ROTATION_MS);
}

export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, message: "Password must be at least 12 characters long" };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "Password must include at least one lowercase letter" };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "Password must include at least one uppercase letter" };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "Password must include at least one number" };
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return { valid: false, message: "Password must include at least one special character" };
  }
  return { valid: true };
}

function getPasswordHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string").slice(0, PASSWORD_HISTORY_LIMIT);
}

export async function isPasswordReused(
  candidatePassword: string,
  currentPasswordHash: string,
  passwordHistory: unknown,
): Promise<boolean> {
  if (await comparePasswords(candidatePassword, currentPasswordHash)) {
    return true;
  }
  const history = getPasswordHistory(passwordHistory);
  for (const hash of history) {
    if (await comparePasswords(candidatePassword, hash)) {
      return true;
    }
  }
  return false;
}

export function buildNextPasswordHistory(currentPasswordHash: string, passwordHistory: unknown): string[] {
  const history = getPasswordHistory(passwordHistory);
  return [currentPasswordHash, ...history].slice(0, PASSWORD_HISTORY_LIMIT);
}

function setNoStoreHeaders(res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function sanitizeBase32Secret(secret: string): string {
  return secret.replace(/[^A-Z2-7]/gi, "").toUpperCase();
}

function base32Decode(secret: string): Buffer {
  const normalized = sanitizeBase32Secret(secret);
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  for (const char of normalized) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

function hotp(secret: string, counter: number, digits = MFA_TOTP_DIGITS): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  counterBuffer.writeUInt32BE(high >>> 0, 0);
  counterBuffer.writeUInt32BE(low, 4);
  const hmac = createHmac("sha1", key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binaryCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (binaryCode % 10 ** digits).toString().padStart(digits, "0");
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function getRecoveryCodeHashes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function generateTotpSecret(length = 32): string {
  const bytes = randomBytes(length);
  let secret = "";
  for (let i = 0; i < length; i += 1) {
    secret += BASE32_ALPHABET[bytes[i] % BASE32_ALPHABET.length];
  }
  return secret;
}

export function buildTotpOtpAuthUrl(secret: string, username: string, issuer = "AI Control Tower"): string {
  const accountLabel = `${issuer}:${username}`;
  return `otpauth://totp/${encodeURIComponent(accountLabel)}?secret=${encodeURIComponent(
    secret,
  )}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${MFA_TOTP_DIGITS}&period=${MFA_TOTP_PERIOD_SECONDS}`;
}

export function verifyTotpCode(secret: string, code: string, window = 1): boolean {
  const token = code.trim();
  if (!/^\d{6}$/.test(token)) return false;
  const currentCounter = Math.floor(Date.now() / (MFA_TOTP_PERIOD_SECONDS * 1000));
  for (let drift = -window; drift <= window; drift += 1) {
    if (hotp(secret, currentCounter + drift) === token) {
      return true;
    }
  }
  return false;
}

export async function issueRecoveryCodes(): Promise<{ recoveryCodes: string[]; hashedRecoveryCodes: string[] }> {
  const recoveryCodes = Array.from({ length: MFA_RECOVERY_CODES_COUNT }, () =>
    normalizeRecoveryCode(randomBytes(MFA_RECOVERY_CODE_LENGTH).toString("hex").slice(0, MFA_RECOVERY_CODE_LENGTH)),
  );
  const hashedRecoveryCodes = await Promise.all(
    recoveryCodes.map((code) => hashPassword(code)),
  );
  return { recoveryCodes, hashedRecoveryCodes };
}

export async function consumeRecoveryCode(
  code: string,
  storedCodes: unknown,
): Promise<{ valid: boolean; remainingRecoveryCodes: string[] }> {
  const candidate = normalizeRecoveryCode(code);
  if (!candidate) {
    return { valid: false, remainingRecoveryCodes: getRecoveryCodeHashes(storedCodes) };
  }
  const hashes = getRecoveryCodeHashes(storedCodes);
  for (let i = 0; i < hashes.length; i += 1) {
    if (await comparePasswords(candidate, hashes[i])) {
      const remainingRecoveryCodes = [...hashes.slice(0, i), ...hashes.slice(i + 1)];
      return { valid: true, remainingRecoveryCodes };
    }
  }
  return { valid: false, remainingRecoveryCodes: hashes };
}

export async function buildAuthUserPayload(
  user: Express.User,
  currentOrganizationId?: string,
): Promise<AuthUserPayload> {
  const storedUser = await storage.getUser(user.id);
  const memberships = await storage.getMembershipsByUserId(user.id);
  const resolvedCurrentOrganizationId = pickCurrentOrganizationId(currentOrganizationId, memberships);
  const normalizeOnboardingState = (value: unknown): AuthOnboardingState => {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const parsedCurrentStep = Number.isInteger(record.currentStep) ? (record.currentStep as number) : 0;
    const completedSteps = Array.isArray(record.completedSteps)
      ? record.completedSteps.filter((entry): entry is string => typeof entry === "string").slice(0, 10)
      : [];
    const dismissedAlerts = Array.isArray(record.dismissedAlerts)
      ? record.dismissedAlerts.filter((entry): entry is string => typeof entry === "string").slice(0, 20)
      : [];
    const snoozedAlerts =
      record.snoozedAlerts && typeof record.snoozedAlerts === "object"
        ? Object.entries(record.snoozedAlerts as Record<string, unknown>).reduce<Record<string, string>>(
            (acc, [key, val]) => {
              if (typeof key === "string" && typeof val === "string") {
                acc[key] = val;
              }
              return acc;
            },
            {},
          )
        : {};
    const updatedAt = typeof record.updatedAt === "string" ? record.updatedAt : null;
    const roleForDefaults =
      memberships.find((membership) => membership.organizationId === resolvedCurrentOrganizationId)?.role ?? user.role;
    const dashboardViewCandidate =
      typeof record.dashboardView === "string" ? (record.dashboardView as DashboardViewId) : null;
    const defaultDashboardView = resolveDefaultDashboardView(roleForDefaults);
    const dashboardView =
      dashboardViewCandidate === "custom" || getDashboardPreset(dashboardViewCandidate)
        ? (dashboardViewCandidate ?? defaultDashboardView)
        : defaultDashboardView;
    const defaultWidgets =
      getDashboardPreset(dashboardView)?.widgets ?? getDashboardPreset(defaultDashboardView)?.widgets ?? [];
    const dashboardWidgets = sanitizeDashboardWidgets(record.dashboardWidgets, defaultWidgets);
    const notificationPreferences = sanitizeNotificationPreferences(record.notificationPreferences);
    const accessibilityPreferences = sanitizeAccessibilityPreferences(record.accessibilityPreferences);
    const workspaceLocale = sanitizeWorkspaceLocale(record.workspaceLocale ?? DEFAULT_WORKSPACE_LOCALE);
    const guidedMode = typeof record.guidedMode === "boolean" ? record.guidedMode : DEFAULT_GUIDED_MODE;

    return {
      currentStep: Math.max(parsedCurrentStep, 0),
      completedSteps,
      dismissedAlerts,
      snoozedAlerts,
      dashboardView,
      dashboardWidgets,
      notificationPreferences,
      accessibilityPreferences,
      workspaceLocale,
      guidedMode,
      updatedAt,
    };
  };
  const organizations = getVisibleActiveMemberships(user, memberships, resolvedCurrentOrganizationId)
    .map((m) => ({
      id: m.organizationId,
      name: m.organizationName ?? m.organizationId,
      slug: m.organizationSlug ?? m.organizationId,
      role: m.role ?? "reviewer",
      isDefault: Boolean(m.isDefault),
    }));
  const currentMembership = memberships.find(
    (membership) =>
      membership.organizationId === resolvedCurrentOrganizationId && membership.membershipState === "active",
  );

  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    mfaEnabled: storedUser?.mfaEnabled ?? false,
    currentOrganizationId: resolvedCurrentOrganizationId,
    currentOrganizationOnboarding: currentMembership ? normalizeOnboardingState(currentMembership.onboardingState) : null,
    organizations,
  };
}

export function setupAuth(app: Express) {
  const sessionStore = new PgStore({
    conObject: getPgPoolConfig(process.env.DATABASE_URL),
    createTableIfMissing: true,
  });

  const runtimeConfig = getRuntimeConfig();

  app.use(
    session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: IDLE_TIMEOUT_MS,
        httpOnly: true,
        secure: runtimeConfig.sessionCookieSecure,
        sameSite: runtimeConfig.sessionCookieSameSite,
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());

  app.use((req, res, next) => {
    if (!req.session) return next();
    const now = Date.now();

    if (!req.session.createdAt) req.session.createdAt = now;
    if (!req.session.lastActivityAt) req.session.lastActivityAt = now;

    if (!req.isAuthenticated?.()) {
      return next();
    }

    const idleDuration = now - (req.session.lastActivityAt ?? now);
    const absoluteDuration = now - (req.session.createdAt ?? now);

    if (idleDuration > IDLE_TIMEOUT_MS || absoluteDuration > ABSOLUTE_TIMEOUT_MS) {
      setNoStoreHeaders(res);
      return req.logout((logoutErr) => {
        if (logoutErr) return next(logoutErr);
        req.session.destroy((destroyErr) => {
          if (destroyErr) return next(destroyErr);
          res.clearCookie("connect.sid");
          return res.status(401).json({ message: "Session expired. Please sign in again." });
        });
      });
    }

    req.session.lastActivityAt = now;
    return next();
  });

  passport.use(
    new LocalStrategy({ passReqToCallback: true }, async (req: Request, username, password, done) => {
      try {
        const normalizedUsername = normalizeUsername(username);
        const clientIp = getClientIp(req);

        if (isLoginRateLimited(clientIp, normalizedUsername)) {
          return done(null, false, {
            message: "RATE_LIMITED",
          });
        }

        const user = await storage.getUserByUsernameOrEmail(normalizedUsername);
        if (!user) {
          trackFailedLogin(clientIp, normalizedUsername);
          return done(null, false, { message: "Invalid username or password" });
        }
        const valid = await comparePasswords(password, user.password);
        if (!valid) {
          trackFailedLogin(clientIp, normalizedUsername);
          return done(null, false, { message: "Invalid username or password" });
        }

        if (user.passwordExpiresAt && new Date(user.passwordExpiresAt).getTime() <= Date.now()) {
          return done(null, false, {
            message: "PASSWORD_EXPIRED",
          });
        }

        clearFailedLogins(clientIp, normalizedUsername);
        await storage.updateUserLastLogin(user.id, new Date());

        return done(null, {
          id: user.id,
          username: user.username,
          fullName: user.fullName,
          email: user.email,
          role: user.role,
        });
      } catch (err) {
        return done(err);
      }
    })
  );

  passport.serializeUser((user: Express.User, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      });
    } catch (err) {
      done(err);
    }
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    setNoStoreHeaders(res);
    return next();
  }
  res.status(401).json({ message: "Authentication required" });
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!roles.includes(req.user!.role)) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}
