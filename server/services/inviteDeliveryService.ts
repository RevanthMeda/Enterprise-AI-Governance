import * as nodemailer from "nodemailer";
import {
  getSmtpEnvironmentConfig,
  getPublicAppBaseUrl,
  isProductionEnvironment,
  parseBooleanEnv,
} from "../env";
import { escapeEmailHtml, sanitizeEmailText } from "../email-content";
import { safeOutboundFetch } from "../safe-outbound-http";

export type InviteDeliveryStatus = "queued" | "sent" | "webhook_sent" | "preview" | "failed";

export type InviteDeliveryResult = {
  status: InviteDeliveryStatus;
  channel: "smtp" | "webhook" | "none";
  message: string;
  jobId?: string;
};

export type InviteDeliveryInput = {
  email: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string | null;
  mode: "created" | "resent";
};

const DELIVERY_WEBHOOK_TIMEOUT_MS = 5_000;
const SMTP_CONNECTION_TIMEOUT_MS = 15_000;
const SMTP_SOCKET_TIMEOUT_MS = 30_000;

export function buildInviteAcceptUrl(token: string): string {
  // Keep bearer credentials out of the initial HTTP request, access logs, and
  // Referer headers. The SPA captures and removes this fragment immediately.
  return `${getPublicAppBaseUrl()}/invite/accept#token=${encodeURIComponent(token)}`;
}

export function shouldExposeInviteSecrets(): boolean {
  return (
    !isProductionEnvironment() &&
    parseBooleanEnv(process.env.EXPOSE_INVITE_TOKENS, true)
  );
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

export function getInviteDeliveryChannel(): InviteDeliveryResult["channel"] {
  if (getSmtpConfig()) {
    return "smtp";
  }
  if (process.env.INVITE_WEBHOOK_URL) {
    return "webhook";
  }
  return "none";
}

export function isInviteDeliverySuccessful(
  result: InviteDeliveryResult,
  production = isProductionEnvironment(),
): boolean {
  if (result.status === "failed") return false;
  // A preview is useful during development, but in production it means the
  // recipient never received the invitation and the queued job must retry or
  // surface as failed for an administrator.
  if (production && result.status === "preview") return false;
  return true;
}

export function buildInviteMail(input: InviteDeliveryInput) {
  const actionLabel = input.mode === "created" ? "You have been invited" : "Your invitation was refreshed";
  const organizationName = sanitizeEmailText(input.organizationName);
  const role = sanitizeEmailText(input.role);
  const inviteUrl = sanitizeEmailText(input.inviteUrl);
  const invitedByName = sanitizeEmailText(input.invitedByName);
  const inviter = invitedByName ? ` by ${invitedByName}` : "";
  const expiresAt = sanitizeEmailText(input.expiresAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }));
  const escapedOrganizationName = escapeEmailHtml(organizationName);
  const escapedRole = escapeEmailHtml(role);
  const escapedInviteUrl = escapeEmailHtml(inviteUrl);
  const escapedInviter = invitedByName ? ` by ${escapeEmailHtml(invitedByName)}` : "";
  const escapedExpiresAt = escapeEmailHtml(expiresAt);

  return {
    subject: `${actionLabel} to ${organizationName} on AI CONTROL GRID`,
    text: [
      `${actionLabel} to join ${organizationName}${inviter}.`,
      `Assigned role: ${role}.`,
      `Accept the invite: ${inviteUrl}`,
      `Expires at: ${expiresAt}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">AI CONTROL GRID invitation</h2>
        <p>${actionLabel} to join <strong>${escapedOrganizationName}</strong>${escapedInviter}.</p>
        <p><strong>Assigned role:</strong> ${escapedRole}</p>
        <p><strong>Expires at:</strong> ${escapedExpiresAt}</p>
        <p style="margin:20px 0">
          <a href="${escapedInviteUrl}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px">
            Accept invite
          </a>
        </p>
        <p>If the button does not work, use this URL:</p>
        <p><a href="${escapedInviteUrl}">${escapedInviteUrl}</a></p>
      </div>
    `,
  };
}

export async function deliverInvite(input: InviteDeliveryInput): Promise<InviteDeliveryResult> {
  const smtp = getSmtpConfig();
  const mail = buildInviteMail(input);

  if (smtp) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.auth,
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
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
        message: `Invite emailed to ${input.email}`,
      };
    } catch (error: any) {
      return {
        status: "failed",
        channel: "smtp",
        message: error?.message || "SMTP invite delivery failed",
      };
    }
  }

  const webhookUrl = process.env.INVITE_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const response = await safeOutboundFetch(webhookUrl, {
        method: "POST",
        timeoutMs: DELIVERY_WEBHOOK_TIMEOUT_MS,
        maxResponseBytes: 64 * 1024,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "organization_invite",
          ...input,
        }),
      });

      if (!response.ok) {
        return {
          status: "failed",
          channel: "webhook",
          message: `Invite webhook failed with ${response.status}`,
        };
      }

      return {
        status: "webhook_sent",
        channel: "webhook",
        message: `Invite forwarded to delivery webhook for ${input.email}`,
      };
    } catch (error: any) {
      return {
        status: "failed",
        channel: "webhook",
        message: error?.message || "Invite webhook delivery failed",
      };
    }
  }

  return {
    status: "preview",
    channel: "none",
    message: "No invite delivery adapter configured",
  };
}
