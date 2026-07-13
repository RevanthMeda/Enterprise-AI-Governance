import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENVELOPE_PREFIX = "aict:secret:v1:";
const ENVELOPE_PARTS = 7;
const PURPOSE_MAX_LENGTH = 512;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_CONTEXT = "ai-control-grid:persisted-secret:key:v1\0";
const AAD_CONTEXT = "ai-control-grid:persisted-secret:aad:v1\0";

const PRESERVE_PLACEHOLDERS = new Set([
  "********",
  "••••••••",
  "••••••••••••",
  "__preserve__",
]);

export class PersistedSecretError extends Error {
  constructor(message = "Stored credential could not be processed") {
    super(message);
    this.name = "PersistedSecretError";
  }
}

export type PersistedSecretResolution = {
  plaintext: string | null;
  isLegacyPlaintext: boolean;
};

type VaultOptions = {
  vaultSecret?: string;
};

function getVaultSecret(options?: VaultOptions): string {
  const value = options?.vaultSecret ?? process.env.CONTROL_TOWER_VAULT_SECRET ?? "";
  if (!value.trim()) {
    throw new PersistedSecretError("CONTROL_TOWER_VAULT_SECRET must be configured to store credentials");
  }
  return value;
}

function validatePurpose(purpose: string): string {
  if (!purpose || purpose.length > PURPOSE_MAX_LENGTH) {
    throw new PersistedSecretError("Credential purpose is invalid");
  }
  return purpose;
}

function deriveKey(options?: VaultOptions): Buffer {
  return createHash("sha256")
    .update(KEY_CONTEXT, "utf8")
    .update(getVaultSecret(options), "utf8")
    .digest();
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new PersistedSecretError();
  }
  return Buffer.from(value, "base64url");
}

function purposeAad(purpose: string): Buffer {
  return Buffer.from(`${AAD_CONTEXT}${purpose}`, "utf8");
}

function purposesMatch(actual: Buffer, expected: Buffer): boolean {
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function isPersistedSecretEnvelope(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}

export function hasPersistedCredential(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function isSecretPreservePlaceholder(value: unknown): boolean {
  return typeof value === "string" && PRESERVE_PLACEHOLDERS.has(value.trim().toLowerCase());
}

export function encryptPersistedSecret(
  plaintext: string,
  purpose: string,
  options?: VaultOptions,
): string {
  const normalizedPurpose = validatePurpose(purpose);
  if (!plaintext || !plaintext.trim()) {
    throw new PersistedSecretError("Credential value must not be empty");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(options), iv);
  cipher.setAAD(purposeAad(normalizedPurpose));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "aict",
    "secret",
    "v1",
    encode(Buffer.from(normalizedPurpose, "utf8")),
    encode(iv),
    encode(tag),
    encode(encrypted),
  ].join(":");
}

export function resolvePersistedSecret(
  storedValue: unknown,
  purpose: string,
  options?: VaultOptions,
): PersistedSecretResolution {
  const normalizedPurpose = validatePurpose(purpose);
  if (!hasPersistedCredential(storedValue)) {
    return { plaintext: null, isLegacyPlaintext: false };
  }

  const value = storedValue as string;
  if (!isPersistedSecretEnvelope(value)) {
    if (value.startsWith("aict:secret:")) {
      throw new PersistedSecretError();
    }
    return { plaintext: value, isLegacyPlaintext: true };
  }

  try {
    const parts = value.split(":");
    if (
      parts.length !== ENVELOPE_PARTS ||
      parts[0] !== "aict" ||
      parts[1] !== "secret" ||
      parts[2] !== "v1"
    ) {
      throw new PersistedSecretError();
    }

    const storedPurpose = decode(parts[3]);
    const expectedPurpose = Buffer.from(normalizedPurpose, "utf8");
    if (!purposesMatch(storedPurpose, expectedPurpose)) {
      throw new PersistedSecretError();
    }

    const iv = decode(parts[4]);
    const tag = decode(parts[5]);
    const encrypted = decode(parts[6]);
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || encrypted.length === 0) {
      throw new PersistedSecretError();
    }

    const decipher = createDecipheriv("aes-256-gcm", deriveKey(options), iv);
    decipher.setAAD(purposeAad(normalizedPurpose));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    if (!plaintext) {
      throw new PersistedSecretError();
    }
    return { plaintext, isLegacyPlaintext: false };
  } catch (error) {
    if (error instanceof PersistedSecretError) throw error;
    throw new PersistedSecretError();
  }
}

export function mergePersistedSecret(input: {
  currentValue: unknown;
  nextValue?: unknown;
  clear?: boolean;
  purpose: string;
  options?: VaultOptions;
}): string | null {
  if (input.clear === true) return null;

  const nextValue = typeof input.nextValue === "string" ? input.nextValue.trim() : "";
  const shouldPreserve = !nextValue || isSecretPreservePlaceholder(nextValue);
  if (!shouldPreserve) {
    if (nextValue.startsWith("aict:secret:")) {
      throw new PersistedSecretError("Credential value is invalid");
    }
    return encryptPersistedSecret(nextValue, input.purpose, input.options);
  }

  if (!hasPersistedCredential(input.currentValue)) return null;
  const currentValue = input.currentValue as string;
  if (isPersistedSecretEnvelope(currentValue)) return currentValue;
  if (currentValue.startsWith("aict:secret:")) throw new PersistedSecretError();
  return encryptPersistedSecret(currentValue, input.purpose, input.options);
}

export const integrationSecretPurpose = {
  jiraApiToken(organizationId: string) {
    return `integration:jira:api-token:organization:${organizationId}`;
  },
  connectorAuthToken(organizationId: string, connectorId: string) {
    return `integration:connector:auth-token:organization:${organizationId}:connector:${connectorId}`;
  },
  threatFeedAuthToken(organizationId: string) {
    return `integration:threat-feed:auth-token:organization:${organizationId}`;
  },
  oidcClientSecret(organizationId: string) {
    return `identity:oidc:client-secret:organization:${organizationId}`;
  },
  oidcClientSecretBound(organizationId: string, bindingHash: string) {
    return `identity:oidc:client-secret:organization:${organizationId}:binding:${bindingHash}`;
  },
  backgroundJobPayload(jobId: string) {
    return `background-job:payload:job:${jobId}`;
  },
  mfaTotpSecret(userId: string) {
    return `identity:mfa:totp-secret:user:${userId}`;
  },
} as const;
