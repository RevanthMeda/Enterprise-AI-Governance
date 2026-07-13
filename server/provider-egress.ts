import { createHash, createHmac } from "node:crypto";
import {
  safeOutboundFetch,
  validateOutboundUrlPolicy,
  type SafeOutboundRequestInit,
  type SafeOutboundResponse,
} from "./safe-outbound-http";
import type { ResolvedProviderConfig } from "./services/upstreamProviderVaultService";

const DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS = 30_000;
const MAX_UPSTREAM_RESPONSE_BYTES = 5 * 1024 * 1024;

export type GatewayOutboundFetch = (
  input: string | URL,
  init?: SafeOutboundRequestInit,
) => Promise<SafeOutboundResponse>;

function getUpstreamRequestTimeoutMs() {
  const parsed = Number(process.env.CONTROL_TOWER_UPSTREAM_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS;
  }
  return Math.min(DEFAULT_UPSTREAM_REQUEST_TIMEOUT_MS, Math.max(5_000, parsed));
}

export function buildProviderHeaders(config: ResolvedProviderConfig) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...config.headers,
  };

  if (config.protocol === "openai") {
    headers.authorization = `Bearer ${config.apiKey}`;
  } else if (config.protocol === "azure_openai") {
    headers["api-key"] = config.apiKey;
  } else if (config.protocol === "anthropic") {
    headers["x-api-key"] = config.apiKey;
  } else if (config.protocol === "vertex_ai") {
    headers.authorization = `Bearer ${config.apiKey}`;
  } else if (config.protocol === "gemini") {
    headers["x-goog-api-key"] = config.apiKey;
  }

  return headers;
}

export function resolveProviderTargetUrl(config: ResolvedProviderConfig, pathOrUrl: string) {
  const baseUrl = validateOutboundUrlPolicy(config.baseUrl, true);
  let targetUrl: URL;
  try {
    targetUrl = new URL(pathOrUrl);
  } catch {
    const base = baseUrl.toString().replace(/\/$/, "");
    const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    targetUrl = new URL(`${base}${path}`);
  }

  const validatedTarget = validateOutboundUrlPolicy(targetUrl, true);
  if (validatedTarget.origin !== baseUrl.origin) {
    throw new Error("Provider request target must remain on the configured origin");
  }
  return validatedTarget;
}

export async function providerJsonRequest(
  config: ResolvedProviderConfig,
  pathOrUrl: string,
  body: Record<string, unknown>,
  outboundFetch: GatewayOutboundFetch = safeOutboundFetch,
) {
  return outboundFetch(resolveProviderTargetUrl(config, pathOrUrl), {
    method: "POST",
    timeoutMs: getUpstreamRequestTimeoutMs(),
    maxResponseBytes: MAX_UPSTREAM_RESPONSE_BYTES,
    headers: buildProviderHeaders(config),
    body: JSON.stringify(body),
  });
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: Buffer | string, value: string) {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function buildAwsQueryString(url: URL) {
  return Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export async function bedrockJsonRequest(
  config: ResolvedProviderConfig,
  pathOrUrl: string,
  body: Record<string, unknown>,
  outboundFetch: GatewayOutboundFetch = safeOutboundFetch,
) {
  if (!config.accessKeyId || !config.secretAccessKey || !config.region) {
    throw new Error("bedrock credentials and region are required");
  }

  const url = resolveProviderTargetUrl(config, pathOrUrl);
  const bodyText = JSON.stringify(body);
  const payloadHash = sha256Hex(bodyText);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: url.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...config.headers,
  };

  if (config.sessionToken) {
    headers["x-amz-security-token"] = config.sessionToken;
  }

  const sortedHeaderEntries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), value.trim()] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const canonicalHeaders = sortedHeaderEntries.map(([key, value]) => `${key}:${value}\n`).join("");
  const signedHeaders = sortedHeaderEntries.map(([key]) => key).join(";");
  const canonicalRequest = [
    "POST",
    url.pathname,
    buildAwsQueryString(url),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${config.region}/bedrock/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = hmacSha256(
    hmacSha256(
      hmacSha256(hmacSha256(`AWS4${config.secretAccessKey}`, dateStamp), config.region),
      "bedrock",
    ),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");
  headers.authorization =
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return outboundFetch(url, {
    method: "POST",
    timeoutMs: getUpstreamRequestTimeoutMs(),
    maxResponseBytes: MAX_UPSTREAM_RESPONSE_BYTES,
    headers,
    body: bodyText,
  });
}
