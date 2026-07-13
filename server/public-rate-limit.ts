import type { Request, Response } from "express";
import { sharedRateLimitService } from "./services/sharedRateLimitService";
import type { RateLimitPolicy } from "./services/sharedRateLimitCore";

const MINUTE = 60 * 1_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const publicRateLimitPolicies = {
  trackGlobal: { scope: "public.track.global", limit: 20_000, windowMs: 5 * MINUTE },
  trackIp: { scope: "public.track.ip", limit: 300, windowMs: 5 * MINUTE },
  leadGlobal: { scope: "public.lead.global", limit: 1_000, windowMs: HOUR },
  leadIp: { scope: "public.lead.ip", limit: 10, windowMs: HOUR },
  leadEmail: { scope: "public.lead.email", limit: 3, windowMs: DAY },
  clientErrorGlobal: { scope: "public.client_error.global", limit: 5_000, windowMs: 5 * MINUTE },
  clientErrorIp: { scope: "public.client_error.ip", limit: 60, windowMs: 5 * MINUTE },
  registrationGlobal: { scope: "auth.registration.global", limit: 500, windowMs: HOUR },
  registrationIp: { scope: "auth.registration.ip", limit: 5, windowMs: HOUR },
  forgotPasswordGlobal: { scope: "auth.forgot_password.global", limit: 5_000, windowMs: 15 * MINUTE },
  forgotPasswordIp: { scope: "auth.forgot_password.ip", limit: 5, windowMs: 15 * MINUTE },
  forgotPasswordAccount: { scope: "auth.forgot_password.account", limit: 5, windowMs: 15 * MINUTE },
  resetPasswordGlobal: { scope: "auth.reset_password.global", limit: 5_000, windowMs: 15 * MINUTE },
  resetPasswordIp: { scope: "auth.reset_password.ip", limit: 10, windowMs: 15 * MINUTE },
  resetPasswordToken: { scope: "auth.reset_password.token", limit: 5, windowMs: 15 * MINUTE },
  loginGlobal: { scope: "auth.login.global", limit: 50_000, windowMs: 5 * MINUTE },
  loginIp: { scope: "auth.login.ip", limit: 100, windowMs: 5 * MINUTE },
  loginIpAccount: { scope: "auth.login.ip_account", limit: 5, windowMs: 5 * MINUTE },
  loginAccount: { scope: "auth.login.account", limit: 5, windowMs: 5 * MINUTE },
  ssoMetadataGlobal: { scope: "auth.sso_metadata.global", limit: 20_000, windowMs: 15 * MINUTE },
  ssoMetadataIp: { scope: "auth.sso_metadata.ip", limit: 300, windowMs: 15 * MINUTE },
  ssoStartGlobal: { scope: "auth.sso_start.global", limit: 10_000, windowMs: 15 * MINUTE },
  ssoStartIp: { scope: "auth.sso_start.ip", limit: 300, windowMs: 15 * MINUTE },
  ssoCallbackGlobal: { scope: "auth.sso_callback.global", limit: 10_000, windowMs: 15 * MINUTE },
  ssoCallbackIp: { scope: "auth.sso_callback.ip", limit: 300, windowMs: 15 * MINUTE },
  ssoExchangeGlobal: { scope: "auth.sso_exchange.global", limit: 10_000, windowMs: 15 * MINUTE },
  ssoExchangeIp: { scope: "auth.sso_exchange.ip", limit: 300, windowMs: 15 * MINUTE },
  ssoExchangeToken: { scope: "auth.sso_exchange.token", limit: 5, windowMs: 15 * MINUTE },
  invitePreviewGlobal: { scope: "auth.invite_preview.global", limit: 10_000, windowMs: 15 * MINUTE },
  invitePreviewIp: { scope: "auth.invite_preview.ip", limit: 60, windowMs: 15 * MINUTE },
  inviteAcceptGlobal: { scope: "auth.invite_accept.global", limit: 1_000, windowMs: HOUR },
  inviteAcceptIp: { scope: "auth.invite_accept.ip", limit: 20, windowMs: HOUR },
  inviteAcceptToken: { scope: "auth.invite_accept.token", limit: 5, windowMs: HOUR },
} satisfies Record<string, RateLimitPolicy>;

export interface SharedRateLimitCheck {
  policy: RateLimitPolicy;
  identity: readonly string[];
}

export function getRateLimitClientAddress(req: Request): string {
  // Express resolves req.ip according to the centrally configured trust-proxy
  // boundary. Reading X-Forwarded-For here directly would allow spoofing when
  // the app is reached without that trusted proxy.
  return req.ip?.trim().toLowerCase() || req.socket.remoteAddress?.trim().toLowerCase() || "unresolved";
}

export function globalRateLimitIdentity(): readonly string[] {
  return ["all-clients"];
}

export async function enforceSharedRateLimits(
  req: Request,
  res: Response,
  checks: readonly SharedRateLimitCheck[],
): Promise<boolean> {
  try {
    for (const check of checks) {
      const decision = await sharedRateLimitService.consume(check.policy, check.identity);
      if (!decision.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil(decision.retryAfterMs / 1_000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        res.setHeader("RateLimit-Limit", String(decision.limit));
        res.setHeader("RateLimit-Remaining", "0");
        res.setHeader("RateLimit-Reset", String(retryAfterSeconds));
        res.setHeader("X-Error-Code", "RATE_LIMIT_EXCEEDED");
        res.status(429).json({
          message: "Too many requests. Try again later.",
          code: "RATE_LIMIT_EXCEEDED",
        });
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error("Shared abuse protection is unavailable", {
      requestId: req.requestId ?? null,
      route: req.path,
      error: error instanceof Error ? error.message : "Unknown rate-limit error",
    });
    res.setHeader("Retry-After", "30");
    res.setHeader("X-Error-Code", "ABUSE_PROTECTION_UNAVAILABLE");
    res.status(503).json({
      message: "Request protection is temporarily unavailable. Try again shortly.",
      code: "ABUSE_PROTECTION_UNAVAILABLE",
    });
    return false;
  }
}
