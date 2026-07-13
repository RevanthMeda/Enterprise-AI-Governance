import { createHash, randomBytes } from "crypto";

const INVITE_TOKEN_DIGEST_PREFIX = "invite:sha256:v1:";
const INVITE_TOKEN_DIGEST_PATTERN = /^invite:sha256:v1:[0-9a-f]{64}$/;

/**
 * Invitation tokens contain 192 bits of cryptographic randomness. A SHA-256
 * digest is therefore sufficient for one-way storage without introducing a
 * rotatable secret that would invalidate every outstanding invitation.
 */
export function digestInviteToken(rawToken: string): string {
  return `${INVITE_TOKEN_DIGEST_PREFIX}${createHash("sha256")
    .update(rawToken, "utf8")
    .digest("hex")}`;
}

export function isInviteTokenDigest(value: string): boolean {
  return INVITE_TOKEN_DIGEST_PATTERN.test(value);
}

export function createInviteToken(): { rawToken: string; tokenDigest: string } {
  const rawToken = randomBytes(24).toString("hex");
  return {
    rawToken,
    tokenDigest: digestInviteToken(rawToken),
  };
}

/**
 * A digest-shaped value must never be treated as a legacy bearer token. This
 * prevents a database reader from authenticating with the stored digest.
 */
export function getInviteTokenLookupValues(rawToken: string): {
  tokenDigest: string;
  legacyToken: string | null;
} {
  return {
    tokenDigest: digestInviteToken(rawToken),
    legacyToken: isInviteTokenDigest(rawToken) ? null : rawToken,
  };
}

export function getInviteTokenFromAuthorizationHeader(
  value: string | null | undefined,
): string | null {
  const match = value?.match(/^Invite[ \t]+(.+)$/i);
  return match && isPlausibleInviteBearerToken(match[1]) ? match[1] : null;
}

export function isPlausibleInviteBearerToken(value: string): boolean {
  return /^\S{20,512}$/.test(value);
}

export const inviteTokenDigestSqlPattern = "^invite:sha256:v1:[0-9a-f]{64}$";
