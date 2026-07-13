import type { BackgroundJob } from "@shared/schema";
import {
  encryptPersistedSecret,
  integrationSecretPurpose,
  resolvePersistedSecret,
} from "../persisted-secret";

const ENCRYPTED_PAYLOAD_KEY = "encryptedPayload";
const PAYLOAD_VERSION = 1;

type VaultOptions = { vaultSecret?: string };

type EncryptedJobPayload = {
  version: 1;
  encryptedPayload: string;
  source: string | null;
};

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function getBackgroundJobPayloadSource(payload: unknown): string | null {
  const record = getRecord(payload);
  if (!record) return null;
  if (typeof record.source === "string" && record.source.trim()) {
    return record.source.trim().slice(0, 64);
  }
  const body = getRecord(record.body);
  return typeof body?.source === "string" && body.source.trim()
    ? body.source.trim().slice(0, 64)
    : null;
}

export function isEncryptedBackgroundJobPayload(payload: unknown): payload is EncryptedJobPayload {
  const record = getRecord(payload);
  return (
    record?.version === PAYLOAD_VERSION &&
    typeof record[ENCRYPTED_PAYLOAD_KEY] === "string" &&
    (record[ENCRYPTED_PAYLOAD_KEY] as string).startsWith("aict:secret:v1:")
  );
}

export function protectBackgroundJobPayload(
  jobId: string,
  payload: unknown,
  options?: VaultOptions,
): unknown {
  if (isEncryptedBackgroundJobPayload(payload)) return payload;
  const serialized = JSON.stringify(payload ?? {});
  return {
    version: PAYLOAD_VERSION,
    encryptedPayload: encryptPersistedSecret(
      serialized,
      integrationSecretPurpose.backgroundJobPayload(jobId),
      options,
    ),
    source: getBackgroundJobPayloadSource(payload),
  } satisfies EncryptedJobPayload;
}

export function resolveBackgroundJobPayload(
  jobId: string,
  payload: unknown,
  options?: VaultOptions,
): unknown {
  if (!isEncryptedBackgroundJobPayload(payload)) return payload;
  const serialized = resolvePersistedSecret(
    payload.encryptedPayload,
    integrationSecretPurpose.backgroundJobPayload(jobId),
    options,
  ).plaintext;
  if (!serialized) return {};
  try {
    return JSON.parse(serialized);
  } catch {
    throw new Error("Background job payload could not be decoded");
  }
}

export type BackgroundJobClientView = Pick<
  BackgroundJob,
  | "id"
  | "type"
  | "status"
  | "organizationId"
  | "attempts"
  | "maxAttempts"
  | "runAt"
  | "lastError"
  | "createdAt"
  | "updatedAt"
> & { source: string | null };

export function backgroundJobClientView(job: BackgroundJob): BackgroundJobClientView {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    organizationId: job.organizationId,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    runAt: job.runAt,
    lastError: job.lastError
      ? "Background job failed; review protected service logs for details."
      : null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    source: getBackgroundJobPayloadSource(job.payload),
  };
}
