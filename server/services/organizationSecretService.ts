import {
  PersistedSecretError,
  encryptPersistedSecret,
  hasPersistedCredential,
  integrationSecretPurpose,
  mergePersistedSecret,
  resolvePersistedSecret,
} from "../persisted-secret";
import { updateOrganizationSettingsForTenant } from "./organizationSettingsService";
import { getOidcClientSecretBinding } from "./oidcEndpointSecurity";

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStoredOidcClientSecret(rawSettings: unknown): unknown {
  return getRecord(getRecord(rawSettings).auth).oidcClientSecret;
}

function boundOidcSecretPurpose(organizationId: string, rawSettings: unknown): string {
  return integrationSecretPurpose.oidcClientSecretBound(
    organizationId,
    getOidcClientSecretBinding(rawSettings),
  );
}

function applyStoredOidcClientSecret(rawSettings: unknown, storedValue: string | null) {
  const settings = { ...getRecord(rawSettings) };
  settings.auth = {
    ...getRecord(settings.auth),
    oidcClientSecret: storedValue,
  };
  return settings;
}

export function mergeOidcClientSecret(input: {
  organizationId: string;
  currentValue: unknown;
  nextValue?: unknown;
  clear?: boolean;
  bindingSettings: unknown;
}) {
  return mergePersistedSecret({
    currentValue: input.currentValue,
    nextValue: input.nextValue,
    clear: input.clear,
    purpose: boundOidcSecretPurpose(input.organizationId, input.bindingSettings),
  });
}

export function getOidcClientSecretState(rawSettings: unknown) {
  return {
    oidcClientSecret: null,
    hasOidcClientSecret: hasPersistedCredential(getStoredOidcClientSecret(rawSettings)),
  } as const;
}

export async function resolveOidcClientSecretForExecution(input: {
  organizationId: string;
  rawSettings: unknown;
}): Promise<string | null> {
  const storedValue = getStoredOidcClientSecret(input.rawSettings);
  const purpose = boundOidcSecretPurpose(input.organizationId, input.rawSettings);
  let resolved;
  let requiresBindingMigration = false;
  try {
    resolved = resolvePersistedSecret(storedValue, purpose);
  } catch (error) {
    if (!(error instanceof PersistedSecretError)) throw error;
    // One-time migration from the old organization-only envelope. A secret
    // already bound to a different destination cannot be opened this way.
    resolved = resolvePersistedSecret(
      storedValue,
      integrationSecretPurpose.oidcClientSecret(input.organizationId),
    );
    requiresBindingMigration = Boolean(resolved.plaintext);
  }
  if ((!resolved.isLegacyPlaintext && !requiresBindingMigration) || !resolved.plaintext) {
    return resolved.plaintext;
  }

  let encrypted: string;
  try {
    encrypted = encryptPersistedSecret(resolved.plaintext, purpose);
  } catch (error) {
    if (error instanceof PersistedSecretError) return resolved.plaintext;
    throw error;
  }

  await updateOrganizationSettingsForTenant(input.organizationId, (currentSettings) => {
    if (getStoredOidcClientSecret(currentSettings) !== storedValue) {
      return { ...currentSettings };
    }
    return applyStoredOidcClientSecret(currentSettings, encrypted);
  });

  return resolved.plaintext;
}

export async function tryMigrateOidcClientSecret(input: {
  organizationId: string;
  rawSettings: unknown;
}): Promise<void> {
  await resolveOidcClientSecretForExecution(input);
}
