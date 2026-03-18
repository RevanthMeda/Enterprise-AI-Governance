import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export type UpstreamProviderName = "openai" | "anthropic" | "gemini" | "azureOpenAi" | "vertexAi" | "bedrock";
export type UpstreamProviderProtocol =
  | "openai"
  | "anthropic"
  | "gemini"
  | "azure_openai"
  | "vertex_ai"
  | "bedrock";

type StoredProviderConfig = {
  enabled?: boolean;
  encryptedApiKey?: string | null;
  encryptedAccessKeyId?: string | null;
  encryptedSecretAccessKey?: string | null;
  encryptedSessionToken?: string | null;
  baseUrl?: string | null;
  headers?: Record<string, string>;
  modelAllowlist?: string[];
  apiVersion?: string | null;
  region?: string | null;
};

export type ProviderPatchInput = {
  enabled?: boolean;
  apiKey?: string | null;
  clearStoredApiKey?: boolean;
  accessKeyId?: string | null;
  secretAccessKey?: string | null;
  sessionToken?: string | null;
  clearStoredAwsCredentials?: boolean;
  baseUrl?: string | null;
  headers?: Record<string, string>;
  modelAllowlist?: string[];
  apiVersion?: string | null;
  region?: string | null;
};

export type ResolvedProviderConfig = {
  provider: string;
  protocol: UpstreamProviderProtocol;
  enabled: boolean;
  apiKey: string;
  baseUrl: string;
  headers: Record<string, string>;
  modelAllowlist: string[];
  apiVersion: string | null;
  region: string | null;
  accessKeyId: string | null;
  secretAccessKey: string | null;
  sessionToken: string | null;
};

const DEFAULT_BASE_URLS: Record<UpstreamProviderName, string> = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  azureOpenAi: "",
  vertexAi: "",
  bedrock: "",
};

function normalizeProviderKey(provider: string) {
  return provider.trim();
}

function inferProtocol(provider: string): UpstreamProviderProtocol {
  const normalized = provider.toLowerCase();
  if (normalized === "anthropic") return "anthropic";
  if (normalized === "gemini") return "gemini";
  if (normalized === "azureopenai" || normalized === "azure-openai" || normalized === "azure_openai") return "azure_openai";
  if (normalized === "vertexai" || normalized === "vertex-ai" || normalized === "vertex_ai") return "vertex_ai";
  if (normalized === "bedrock" || normalized === "aws-bedrock" || normalized === "aws_bedrock") return "bedrock";
  return "openai";
}

function getVaultSecret() {
  const raw = process.env.CONTROL_TOWER_VAULT_SECRET ?? process.env.SESSION_SECRET ?? "";
  if (!raw.trim()) {
    throw new Error("CONTROL_TOWER_VAULT_SECRET must be configured to store upstream provider keys");
  }
  return createHash("sha256").update(raw).digest();
}

function encryptSecret(plainText: string) {
  const key = getVaultSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

function decryptSecret(value: string) {
  const [ivPart, tagPart, cipherPart] = value.split(".");
  if (!ivPart || !tagPart || !cipherPart) {
    throw new Error("Stored upstream provider secret is malformed");
  }

  const key = getVaultSecret();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherPart, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getStringRecord(value: unknown) {
  return Object.fromEntries(
    Object.entries(getRecord(value)).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0) : [];
}

function getStoredVault(value: unknown) {
  const root = getRecord(value);
  return Object.fromEntries(
    Object.entries(root).map(([provider, config]) => [provider, getRecord(config)]),
  ) as Record<string, StoredProviderConfig>;
}

function defaultHeaders(protocol: UpstreamProviderProtocol) {
  if (protocol === "anthropic") {
    return { "anthropic-version": "2023-06-01" };
  }
  return {};
}

function envApiKey(protocol: UpstreamProviderProtocol) {
  if (protocol === "openai") {
    return process.env.OPENAI_API_KEY ?? "";
  }
  if (protocol === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ?? "";
  }
  if (protocol === "gemini") {
    return process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  }
  if (protocol === "azure_openai") {
    return process.env.AZURE_OPENAI_API_KEY ?? "";
  }
  if (protocol === "vertex_ai") {
    return process.env.VERTEX_AI_ACCESS_TOKEN ?? process.env.GOOGLE_ACCESS_TOKEN ?? "";
  }
  return "";
}

function envBaseUrl(protocol: UpstreamProviderProtocol) {
  if (protocol === "openai") {
    return process.env.OPENAI_BASE_URL ?? "";
  }
  if (protocol === "anthropic") {
    return process.env.ANTHROPIC_BASE_URL ?? "";
  }
  if (protocol === "gemini") {
    return process.env.GEMINI_BASE_URL ?? process.env.GOOGLE_BASE_URL ?? "";
  }
  if (protocol === "azure_openai") {
    return process.env.AZURE_OPENAI_BASE_URL ?? "";
  }
  if (protocol === "vertex_ai") {
    return process.env.VERTEX_AI_BASE_URL ?? "";
  }
  return process.env.AWS_BEDROCK_BASE_URL ?? "";
}

function envRegion(protocol: UpstreamProviderProtocol) {
  if (protocol === "bedrock") {
    return process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "";
  }
  return "";
}

function sanitizeProviderConfig(config: StoredProviderConfig) {
  return {
    enabled: config.enabled !== false,
    hasStoredApiKey: Boolean(config.encryptedApiKey),
    hasStoredAwsCredentials: Boolean(config.encryptedAccessKeyId || config.encryptedSecretAccessKey),
    hasStoredSessionToken: Boolean(config.encryptedSessionToken),
    baseUrl: getString(config.baseUrl) ?? null,
    headers: getStringRecord(config.headers),
    modelAllowlist: getStringArray(config.modelAllowlist),
    apiVersion: getString(config.apiVersion) ?? null,
    region: getString(config.region) ?? null,
  };
}

function mergeProviderPatch(
  currentValue: Record<string, unknown>,
  patchValue: ProviderPatchInput & Record<string, unknown>,
): StoredProviderConfig {
  return {
    enabled: typeof patchValue.enabled === "boolean" ? patchValue.enabled : (currentValue.enabled as boolean | undefined),
    encryptedApiKey:
      patchValue.clearStoredApiKey
        ? null
        : getString(patchValue.apiKey)
          ? encryptSecret(getString(patchValue.apiKey)!)
          : getString(currentValue.encryptedApiKey),
    encryptedAccessKeyId:
      patchValue.clearStoredAwsCredentials
        ? null
        : getString(patchValue.accessKeyId)
          ? encryptSecret(getString(patchValue.accessKeyId)!)
          : getString(currentValue.encryptedAccessKeyId),
    encryptedSecretAccessKey:
      patchValue.clearStoredAwsCredentials
        ? null
        : getString(patchValue.secretAccessKey)
          ? encryptSecret(getString(patchValue.secretAccessKey)!)
          : getString(currentValue.encryptedSecretAccessKey),
    encryptedSessionToken:
      patchValue.clearStoredAwsCredentials
        ? null
        : getString(patchValue.sessionToken)
          ? encryptSecret(getString(patchValue.sessionToken)!)
          : getString(currentValue.encryptedSessionToken),
    baseUrl:
      patchValue.baseUrl === null
        ? null
        : getString(patchValue.baseUrl) ?? getString(currentValue.baseUrl),
    headers:
      Object.keys(getStringRecord(patchValue.headers)).length > 0
        ? getStringRecord(patchValue.headers)
        : getStringRecord(currentValue.headers),
    modelAllowlist:
      Array.isArray(patchValue.modelAllowlist)
        ? getStringArray(patchValue.modelAllowlist)
        : getStringArray(currentValue.modelAllowlist),
    apiVersion:
      patchValue.apiVersion === null
        ? null
        : getString(patchValue.apiVersion) ?? getString(currentValue.apiVersion),
    region:
      patchValue.region === null
        ? null
        : getString(patchValue.region) ?? getString(currentValue.region),
  };
}

function getStoredProviderConfig(rawVault: unknown, provider: string) {
  const vault = getStoredVault(rawVault);
  if (provider === "openai" || provider === "anthropic" || provider === "gemini") {
    return getRecord(vault[provider] ?? {});
  }
  const compatibleProviders = getRecord(vault.compatibleProviders);
  return getRecord(compatibleProviders[provider] ?? {});
}

export class UpstreamProviderVaultService {
  sanitizeForClient(rawVault: unknown) {
    const vault = getStoredVault(rawVault);
    const sanitized = Object.fromEntries(
      Object.entries(vault)
        .filter(([provider]) => provider !== "compatibleProviders")
        .map(([provider, config]) => [provider, sanitizeProviderConfig(config)]),
    );
    const compatibleProviders = getRecord(vault.compatibleProviders);
    return {
      ...sanitized,
      compatibleProviders: Object.fromEntries(
        Object.entries(compatibleProviders).map(([provider, config]) => [
          provider,
          sanitizeProviderConfig(getRecord(config)),
        ]),
      ),
    };
  }

  mergeForStorage(existingVault: unknown, patchVault: Record<string, unknown>) {
    const merged = getStoredVault(existingVault);

    for (const [providerName, rawPatch] of Object.entries(getRecord(patchVault))) {
      if (providerName === "compatibleProviders") {
        const existingCompatible = getRecord(merged.compatibleProviders);
        const nextCompatible = { ...existingCompatible };
        for (const [customProviderName, rawCustomPatch] of Object.entries(getRecord(rawPatch))) {
          const current = getRecord(nextCompatible[customProviderName] ?? {});
          const patch = getRecord(rawCustomPatch) as ProviderPatchInput & Record<string, unknown>;
          nextCompatible[customProviderName] = mergeProviderPatch(current, patch);
        }
        merged.compatibleProviders = nextCompatible;
        continue;
      }

      const current = getRecord(merged[providerName] ?? {});
      const patch = getRecord(rawPatch) as ProviderPatchInput & Record<string, unknown>;
      merged[normalizeProviderKey(providerName)] = mergeProviderPatch(current, patch);
    }

    return merged;
  }

  resolveProviderConfig(
    rawVault: unknown,
    provider: string,
    options?: {
      requestApiKey?: string | null;
      requestBaseUrl?: string | null;
      requestHeaders?: Record<string, string>;
      protocol?: UpstreamProviderProtocol;
      requestApiVersion?: string | null;
      requestRegion?: string | null;
      requestAccessKeyId?: string | null;
      requestSecretAccessKey?: string | null;
      requestSessionToken?: string | null;
    },
  ): ResolvedProviderConfig {
    const protocol =
      options?.protocol ?? inferProtocol(provider);
    const stored = getStoredProviderConfig(rawVault, provider);
    const requestApiKey = getString(options?.requestApiKey);
    const storedApiKey = getString(stored.encryptedApiKey);
    const apiKey =
      requestApiKey ??
      (storedApiKey ? decryptSecret(storedApiKey) : null) ??
      getString(envApiKey(protocol));

    const requestAccessKeyId = getString(options?.requestAccessKeyId);
    const requestSecretAccessKey = getString(options?.requestSecretAccessKey);
    const requestSessionToken = getString(options?.requestSessionToken);
    const accessKeyId =
      requestAccessKeyId ??
      (getString(stored.encryptedAccessKeyId) ? decryptSecret(getString(stored.encryptedAccessKeyId)!) : null);
    const secretAccessKey =
      requestSecretAccessKey ??
      (getString(stored.encryptedSecretAccessKey) ? decryptSecret(getString(stored.encryptedSecretAccessKey)!) : null);
    const sessionToken =
      requestSessionToken ??
      (getString(stored.encryptedSessionToken) ? decryptSecret(getString(stored.encryptedSessionToken)!) : null);

    if (protocol !== "bedrock" && !apiKey) {
      throw new Error(`${provider} provider key is required`);
    }

    const baseUrl =
      getString(options?.requestBaseUrl) ??
      getString(stored.baseUrl) ??
      getString(envBaseUrl(protocol)) ??
      (protocol === "openai"
        ? DEFAULT_BASE_URLS.openai
        : protocol === "anthropic"
          ? DEFAULT_BASE_URLS.anthropic
          : protocol === "gemini"
            ? DEFAULT_BASE_URLS.gemini
            : protocol === "bedrock"
              ? (() => {
                  const region = getString(options?.requestRegion) ?? getString(stored.region) ?? getString(envRegion(protocol));
                  return region ? `https://bedrock-runtime.${region}.amazonaws.com` : null;
                })()
              : null);

    if (!baseUrl) {
      throw new Error(`${provider} base URL is required`);
    }

    const apiVersion =
      getString(options?.requestApiVersion) ??
      getString(stored.apiVersion) ??
      (protocol === "azure_openai" ? process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21" : null);
    const region =
      getString(options?.requestRegion) ??
      getString(stored.region) ??
      getString(envRegion(protocol));

    if (protocol === "bedrock" && (!accessKeyId || !secretAccessKey)) {
      throw new Error("bedrock credentials are required");
    }

    const headers = {
      ...defaultHeaders(protocol),
      ...getStringRecord(stored.headers),
      ...getStringRecord(options?.requestHeaders),
    };

    return {
      provider,
      protocol,
      enabled: stored.enabled !== false,
      apiKey: apiKey ?? "",
      baseUrl,
      headers,
      modelAllowlist: getStringArray(stored.modelAllowlist),
      apiVersion,
      region,
      accessKeyId,
      secretAccessKey,
      sessionToken,
    };
  }

  assertModelAllowed(config: ResolvedProviderConfig, modelName: string | null) {
    if (config.modelAllowlist.length === 0 || !modelName) {
      return;
    }

    if (!config.modelAllowlist.includes(modelName)) {
      throw new Error(`Model "${modelName}" is not allowed for provider ${config.provider}`);
    }
  }
}

export const upstreamProviderVaultService = new UpstreamProviderVaultService();
