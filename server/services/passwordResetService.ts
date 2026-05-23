import { createHmac, timingSafeEqual } from "crypto";
import * as nodemailer from "nodemailer";
import type { User } from "@shared/schema";
import {
  getPublicAppBaseUrl,
  getSmtpEnvironmentConfig,
  normalizeOptionalString,
  parseBooleanEnv,
} from "../env";
import { fetchWithTimeout } from "../http";

export type PasswordResetDeliveryStatus = "sent" | "webhook_sent" | "preview" | "failed";

export type PasswordResetDeliveryResult = {
  status: PasswordResetDeliveryStatus;
  channel: "smtp" | "webhook" | "none";
  message: string;
  previewUrl?: string;
};

type PasswordResetTokenPayload = {
  purpose: "password_reset";
  sub: string;
  exp: number;
  pwdChangedAt: string;
};

type PasswordResetMailInput = {
  email: string;
  fullName: string;
  resetUrl: string;
  expiresAt: Date;
};

const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 30;
const DELIVERY_WEBHOOK_TIMEOUT_MS = 5_000;

function getPasswordResetSecret(): string {
  return process.env.PASSWORD_RESET_SECRET || process.env.SESSION_SECRET || "";
}

function getPasswordResetTtlMinutes(): number {
  const parsed = Number(process.env.PASSWORD_RESET_TTL_MINUTES);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_PASSWORD_RESET_TTL_MINUTES;
  }
  return Math.min(parsed, 24 * 60);
}

function encodePayload(payload: PasswordResetTokenPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getPasswordResetSecret()).update(encodedPayload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function getSmtpConfig() {
  const smtpEnv = getSmtpEnvironmentConfig();
  const host = smtpEnv.host;
  const port = Number(smtpEnv.port || 587);
  const secure = parseBooleanEnv(smtpEnv.secure, false);
  const user = smtpEnv.user;
  const pass = smtpEnv.pass;
  const from = smtpEnv.from;

  const hostLooksPlaceholder = !host || host.includes("example.com") || host.includes("<");
  const fromLooksPlaceholder = !from || from.includes("example.com") || from.includes("<");

  if (hostLooksPlaceholder || fromLooksPlaceholder) {
    return null;
  }

  return {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : undefined,
    from,
  };
}

function buildPasswordResetMail(input: PasswordResetMailInput) {
  const expiresAt = input.expiresAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return {
    subject: "Reset your AI CONTROL GRID password",
    text: [
      `Hello ${input.fullName},`,
      "",
      "A password reset was requested for your AI CONTROL GRID account.",
      `Reset your password: ${input.resetUrl}`,
      `This link expires at: ${expiresAt}`,
      "",
      "If you did not request this, you can ignore this message.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">Reset your password</h2>
        <p>Hello <strong>${input.fullName}</strong>,</p>
        <p>A password reset was requested for your AI CONTROL GRID account.</p>
        <p><strong>Expires at:</strong> ${expiresAt}</p>
        <p style="margin:20px 0">
          <a href="${input.resetUrl}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px">
            Reset password
          </a>
        </p>
        <p>If the button does not work, use this URL:</p>
        <p><a href="${input.resetUrl}">${input.resetUrl}</a></p>
        <p>If you did not request this, you can ignore this message.</p>
      </div>
    `,
  };
}

export function buildPasswordResetUrl(token: string): string {
  return `${getPublicAppBaseUrl()}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

export function createPasswordResetToken(user: Pick<User, "id" | "passwordChangedAt">, now = new Date()): {
  token: string;
  expiresAt: Date;
} {
  const expiresAt = new Date(now.getTime() + getPasswordResetTtlMinutes() * 60 * 1000);
  const payload: PasswordResetTokenPayload = {
    purpose: "password_reset",
    sub: user.id,
    exp: expiresAt.getTime(),
    pwdChangedAt: user.passwordChangedAt.toISOString(),
  };
  const encodedPayload = encodePayload(payload);
  return {
    token: `${encodedPayload}.${signPayload(encodedPayload)}`,
    expiresAt,
  };
}

export function verifyPasswordResetToken(token: string): PasswordResetTokenPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const secret = getPasswordResetSecret();
  if (!secret) {
    return null;
  }

  const expectedSignature = signPayload(encodedPayload);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const payload = parsed as Partial<PasswordResetTokenPayload>;
  if (
    payload.purpose !== "password_reset" ||
    typeof payload.sub !== "string" ||
    typeof payload.exp !== "number" ||
    typeof payload.pwdChangedAt !== "string"
  ) {
    return null;
  }

  if (payload.exp <= Date.now()) {
    return null;
  }

  return payload as PasswordResetTokenPayload;
}

export function isPasswordResetTokenValidForUser(
  payload: PasswordResetTokenPayload,
  user: Pick<User, "id" | "passwordChangedAt" | "authProvider">,
): boolean {
  const provider = user.authProvider ?? "local";
  return (
    provider === "local" &&
    payload.sub === user.id &&
    payload.pwdChangedAt === user.passwordChangedAt.toISOString()
  );
}

export async function deliverPasswordReset(input: PasswordResetMailInput): Promise<PasswordResetDeliveryResult> {
  const smtp = getSmtpConfig();
  const mail = buildPasswordResetMail(input);

  if (smtp) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth,
      });

      await transporter.sendMail({
        from: smtp.from,
        to: input.email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });

      return {
        status: "sent",
        channel: "smtp",
        message: `Password reset emailed to ${input.email}`,
      };
    } catch (error: any) {
      return {
        status: "failed",
        channel: "smtp",
        message: error?.message || "SMTP password reset delivery failed",
      };
    }
  }

  const webhookUrl = process.env.PASSWORD_RESET_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await fetchWithTimeout(webhookUrl, {
        method: "POST",
        timeoutMs: DELIVERY_WEBHOOK_TIMEOUT_MS,
        timeoutMessage: "Password reset delivery webhook timed out",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "password_reset",
          ...input,
        }),
      });

      if (!response.ok) {
        return {
          status: "failed",
          channel: "webhook",
          message: `Password reset webhook failed with ${response.status}`,
        };
      }

      return {
        status: "webhook_sent",
        channel: "webhook",
        message: `Password reset forwarded to delivery webhook for ${input.email}`,
      };
    } catch (error: any) {
      return {
        status: "failed",
        channel: "webhook",
        message: error?.message || "Password reset webhook delivery failed",
      };
    }
  }

  return {
    status: "preview",
    channel: "none",
    message: "No password reset delivery adapter configured",
    previewUrl: input.resetUrl,
  };
}
