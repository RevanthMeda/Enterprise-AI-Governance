import { createHash } from "crypto";
import { hasPersistedCredential, isSecretPreservePlaceholder } from "../persisted-secret";

export type OidcEndpointSettings = {
  oidcIssuer: string | null;
  oidcAuthorizationUrl: string | null;
  oidcTokenUrl: string | null;
  oidcJwksUrl: string | null;
};

export type ValidatedOidcEndpoints = {
  issuer: URL;
  authorization: URL;
  token: URL;
  jwks: URL;
};

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getOidcAuthRecord(rawSettings: unknown): Record<string, unknown> {
  const root = getRecord(rawSettings);
  const nestedAuth = getRecord(root.auth);
  return Object.keys(nestedAuth).length > 0 ? nestedAuth : root;
}

function normalizedUrlBinding(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return value.trim();
  }
}

export function getOidcClientSecretBinding(rawSettings: unknown): string {
  const auth = getOidcAuthRecord(rawSettings);
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        issuer: normalizedUrlBinding(auth.oidcIssuer),
        tokenUrl: normalizedUrlBinding(auth.oidcTokenUrl),
        clientId: typeof auth.oidcClientId === "string" ? auth.oidcClientId.trim() : "",
      }),
      "utf8",
    )
    .digest("hex");
}

export function assertOidcClientSecretBindingUpdate(input: {
  currentSettings: unknown;
  nextSettings: unknown;
  currentSecret: unknown;
  nextSecret?: unknown;
  clearSecret?: boolean;
}): void {
  const bindingChanged =
    getOidcClientSecretBinding(input.currentSettings) !==
    getOidcClientSecretBinding(input.nextSettings);
  const suppliedSecret =
    typeof input.nextSecret === "string" &&
    input.nextSecret.trim().length > 0 &&
    !isSecretPreservePlaceholder(input.nextSecret);
  if (
    bindingChanged &&
    hasPersistedCredential(input.currentSecret) &&
    !suppliedSecret &&
    input.clearSecret !== true
  ) {
    throw new Error(
      "Re-enter or explicitly clear the OIDC client secret when issuer, token URL, or client ID changes",
    );
  }
}

export function areInsecureOidcTestProvidersAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.NODE_ENV === "test" && env.ALLOW_INSECURE_OIDC_TEST_PROVIDER === "true";
}

function parseEndpoint(value: string | null, label: string): URL {
  if (!value) throw new Error(`${label} is required`);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} is invalid`);
  }
  if (parsed.username || parsed.password || parsed.hash) {
    throw new Error(`${label} must not include credentials or a fragment`);
  }
  return parsed;
}

function trustedEndpointOrigins(env: NodeJS.ProcessEnv): Set<string> {
  const origins = new Set<string>();
  for (const rawValue of (env.OIDC_TRUSTED_ENDPOINT_ORIGINS ?? "").split(",")) {
    const value = rawValue.trim();
    if (!value) continue;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("OIDC_TRUSTED_ENDPOINT_ORIGINS contains an invalid URL");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      throw new Error("OIDC_TRUSTED_ENDPOINT_ORIGINS must contain HTTPS origins only");
    }
    origins.add(parsed.origin);
  }
  return origins;
}

export function validateOidcEndpointConfiguration(
  settings: OidcEndpointSettings,
  env: NodeJS.ProcessEnv = process.env,
): ValidatedOidcEndpoints {
  const issuer = parseEndpoint(settings.oidcIssuer, "OIDC issuer");
  const authorization = parseEndpoint(settings.oidcAuthorizationUrl, "OIDC authorization URL");
  const token = parseEndpoint(settings.oidcTokenUrl, "OIDC token URL");
  const jwks = parseEndpoint(settings.oidcJwksUrl, "OIDC JWKS URL");
  const allowInsecureTestProvider = areInsecureOidcTestProvidersAllowed(env);

  for (const [label, endpoint] of [
    ["OIDC issuer", issuer],
    ["OIDC authorization URL", authorization],
    ["OIDC token URL", token],
    ["OIDC JWKS URL", jwks],
  ] as const) {
    if (endpoint.protocol !== "https:" && !allowInsecureTestProvider) {
      throw new Error(`${label} must use HTTPS`);
    }
    if (endpoint.protocol !== "https:" && endpoint.protocol !== "http:") {
      throw new Error(`${label} uses an unsupported protocol`);
    }
  }

  const trustedOrigins = trustedEndpointOrigins(env);
  for (const [label, endpoint] of [
    ["OIDC authorization URL", authorization],
    ["OIDC token URL", token],
    ["OIDC JWKS URL", jwks],
  ] as const) {
    if (endpoint.origin !== issuer.origin && !trustedOrigins.has(endpoint.origin)) {
      throw new Error(`${label} must share the issuer origin or use an explicitly trusted origin`);
    }
  }

  return { issuer, authorization, token, jwks };
}
