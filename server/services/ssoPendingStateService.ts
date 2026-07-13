import { createHash } from "crypto";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { ssoLoginAttempts } from "@shared/schema";
import { normalizeInternalPath } from "@shared/internal-path";
import { db } from "../db";
import { encryptPersistedSecret, resolvePersistedSecret } from "../persisted-secret";

export type PersistedSsoPendingState = {
  state: string;
  organizationId: string;
  next: string;
  expiresAt: number;
  provider: "saml" | "oidc";
  codeVerifier?: string | null;
  nonce?: string | null;
};

const SSO_STATE_PATTERN = /^[A-Za-z0-9_-]{32,200}$/;

export function hashSsoPendingState(state: string): string {
  return createHash("sha256")
    .update(`aict:sso-pending-state:v1\0${state}`, "utf8")
    .digest("hex");
}

function getPendingStateVaultSecret(): string {
  const secret =
    process.env.CONTROL_TOWER_VAULT_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("A vault or session secret is required to protect SSO pending state");
  }
  return secret;
}

function pendingStatePurpose(input: {
  stateHash: string;
  organizationId: string;
  provider: "saml" | "oidc";
}): string {
  return `identity:sso:pending:${input.provider}:organization:${input.organizationId}:state:${input.stateHash}`;
}

function serializePendingState(pending: PersistedSsoPendingState, stateHash: string): string {
  const payload = JSON.stringify({
    next: normalizeInternalPath(pending.next),
    codeVerifier: pending.codeVerifier ?? null,
    nonce: pending.nonce ?? null,
  });
  return encryptPersistedSecret(
    payload,
    pendingStatePurpose({
      stateHash,
      organizationId: pending.organizationId,
      provider: pending.provider,
    }),
    { vaultSecret: getPendingStateVaultSecret() },
  );
}

function deserializePendingState(input: {
  state: string;
  stateHash: string;
  organizationId: string;
  provider: "saml" | "oidc";
  expiresAt: Date;
  pendingPayload: string;
}): PersistedSsoPendingState {
  const resolved = resolvePersistedSecret(
    input.pendingPayload,
    pendingStatePurpose(input),
    { vaultSecret: getPendingStateVaultSecret() },
  );
  if (!resolved.plaintext || resolved.isLegacyPlaintext) {
    throw new Error("Stored SSO pending state could not be processed");
  }

  const parsed = JSON.parse(resolved.plaintext) as Record<string, unknown>;
  const codeVerifier =
    typeof parsed.codeVerifier === "string" && parsed.codeVerifier.length <= 512
      ? parsed.codeVerifier
      : null;
  const nonce =
    typeof parsed.nonce === "string" && parsed.nonce.length <= 200
      ? parsed.nonce
      : null;
  return {
    state: input.state,
    organizationId: input.organizationId,
    next: normalizeInternalPath(typeof parsed.next === "string" ? parsed.next : "/"),
    expiresAt: input.expiresAt.getTime(),
    provider: input.provider,
    codeVerifier,
    nonce,
  };
}

async function persist(pending: PersistedSsoPendingState): Promise<void> {
  if (!SSO_STATE_PATTERN.test(pending.state)) {
    throw new Error("SSO state is invalid");
  }
  const now = new Date();
  const expiresAt = new Date(pending.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
    throw new Error("SSO state expiry is invalid");
  }
  const stateHash = hashSsoPendingState(pending.state);
  const pendingPayload = serializePendingState(pending, stateHash);

  await db.transaction(async (tx) => {
    await tx.delete(ssoLoginAttempts).where(lte(ssoLoginAttempts.expiresAt, now));
    await tx.insert(ssoLoginAttempts).values({
      stateHash,
      organizationId: pending.organizationId,
      provider: pending.provider,
      pendingPayload,
      expiresAt,
      consumedAt: null,
      createdAt: now,
    });
  });
}

async function consume(
  state: string,
  provider: "saml" | "oidc",
  now = new Date(),
): Promise<PersistedSsoPendingState | null> {
  if (!SSO_STATE_PATTERN.test(state)) return null;
  const stateHash = hashSsoPendingState(state);
  const [claimed] = await db
    .update(ssoLoginAttempts)
    .set({ consumedAt: now })
    .where(
      and(
        eq(ssoLoginAttempts.stateHash, stateHash),
        eq(ssoLoginAttempts.provider, provider),
        isNull(ssoLoginAttempts.consumedAt),
        gt(ssoLoginAttempts.expiresAt, now),
      ),
    )
    .returning({
      organizationId: ssoLoginAttempts.organizationId,
      provider: ssoLoginAttempts.provider,
      pendingPayload: ssoLoginAttempts.pendingPayload,
      expiresAt: ssoLoginAttempts.expiresAt,
    });
  if (!claimed || (claimed.provider !== "saml" && claimed.provider !== "oidc")) return null;
  return deserializePendingState({
    state,
    stateHash,
    organizationId: claimed.organizationId,
    provider: claimed.provider,
    pendingPayload: claimed.pendingPayload,
    expiresAt: claimed.expiresAt,
  });
}

export const ssoPendingStateService = {
  persist,
  consume,
};
