import * as nodemailer from "nodemailer";
import {
  getSmtpEnvironmentConfig,
  getPublicAppBaseUrl,
  isProductionEnvironment,
  parseBooleanEnv,
} from "../env";
import { fetchWithTimeout } from "../http";

export type InviteDeliveryStatus = "queued" | "sent" | "webhook_sent" | "preview" | "failed";

export type InviteDeliveryResult = {
  status: InviteDeliveryStatus;
  channel: "smtp" | "webhook" | "none";
  message: string;
  jobId?: string;
};

type InviteDeliveryInput = {
  email: string;
  organizationName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  invitedByName?: string | null;
  mode: "created" | "resent";
};

const DELIVERY_WEBHOOK_TIMEOUT_MS = 5_000;

export function buildInviteAcceptUrl(token: string): string {
  return `${getPublicAppBaseUrl()}/invite/accept?token=${encodeURIComponent(token)}`;
}

export function shouldExposeInviteSecrets(): boolean {
  if (parseBooleanEnv(process.env.EXPOSE_INVITE_TOKENS, false)) {
    return true;
  }

  return !isProductionEnvironment();
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

function buildInviteMail(input: InviteDeliveryInput) {
  const actionLabel = input.mode === "created" ? "You have been invited" : "Your invitation was refreshed";
  const inviter = input.invitedByName ? ` by ${input.invitedByName}` : "";
  const expiresAt = input.expiresAt.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return {
    subject: `${actionLabel} to ${input.organizationName} on AI Control Tower`,
    text: [
      `${actionLabel} to join ${input.organizationName}${inviter}.`,
      `Assigned role: ${input.role}.`,
      `Accept the invite: ${input.inviteUrl}`,
      `Expires at: ${expiresAt}`,
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="margin:0 0 12px">AI Control Tower invitation</h2>
        <p>${actionLabel} to join <strong>${input.organizationName}</strong>${inviter}.</p>
        <p><strong>Assigned role:</strong> ${input.role}</p>
        <p><strong>Expires at:</strong> ${expiresAt}</p>
        <p style="margin:20px 0">
          <a href="${input.inviteUrl}" style="display:inline-block;padding:10px 16px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px">
            Accept invite
          </a>
        </p>
        <p>If the button does not work, use this URL:</p>
        <p><a href="${input.inviteUrl}">${input.inviteUrl}</a></p>
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
      const response = await fetchWithTimeout(webhookUrl, {
        method: "POST",
        timeoutMs: DELIVERY_WEBHOOK_TIMEOUT_MS,
        timeoutMessage: "Invite delivery webhook timed out",
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
