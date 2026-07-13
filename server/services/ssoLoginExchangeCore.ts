import { createHash, randomBytes } from "crypto";
import { normalizeInternalPath } from "@shared/internal-path";

export const SSO_LOGIN_EXCHANGE_TTL_MS = 2 * 60 * 1_000;
export const SSO_LOGIN_EXCHANGE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SsoLoginExchangeClaim = {
  userId: string;
  organizationId: string;
  nextPath: string;
};

export type SsoLoginExchangeInsert = SsoLoginExchangeClaim & {
  codeHash: string;
  createdAt: Date;
  expiresAt: Date;
};

export interface SsoLoginExchangeStore {
  insert(input: SsoLoginExchangeInsert): Promise<void>;
  consume(codeHash: string, now: Date): Promise<SsoLoginExchangeClaim | null>;
  cleanup(expiredBefore: Date): Promise<void>;
}

export function hashSsoLoginExchangeCode(code: string): string {
  return createHash("sha256")
    .update(`aict:sso-login-exchange:v1\0${code}`, "utf8")
    .digest("hex");
}

export class SsoLoginExchangeManager {
  constructor(
    private readonly store: SsoLoginExchangeStore,
    private readonly ttlMs = SSO_LOGIN_EXCHANGE_TTL_MS,
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > 10 * 60 * 1_000) {
      throw new Error("SSO login exchange TTL must be between one second and ten minutes");
    }
  }

  async issue(
    input: SsoLoginExchangeClaim,
    now = new Date(),
  ): Promise<{ code: string; expiresAt: Date }> {
    const code = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    await this.store.cleanup(now);
    await this.store.insert({
      codeHash: hashSsoLoginExchangeCode(code),
      userId: input.userId,
      organizationId: input.organizationId,
      nextPath: normalizeInternalPath(input.nextPath),
      createdAt: now,
      expiresAt,
    });

    return { code, expiresAt };
  }

  async consume(code: string, now = new Date()): Promise<SsoLoginExchangeClaim | null> {
    if (!SSO_LOGIN_EXCHANGE_CODE_PATTERN.test(code)) {
      return null;
    }
    const claim = await this.store.consume(hashSsoLoginExchangeCode(code), now);
    if (!claim) return null;
    return {
      ...claim,
      nextPath: normalizeInternalPath(claim.nextPath),
    };
  }
}
