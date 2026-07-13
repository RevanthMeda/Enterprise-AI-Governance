import { lookup as dnsLookup } from "node:dns/promises";
import * as http from "node:http";
import * as https from "node:https";
import { isIP } from "node:net";
import { isProductionEnvironment } from "./env";

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export type SafeOutboundHttpErrorCode =
  | "INVALID_URL"
  | "URL_CREDENTIALS"
  | "UNSAFE_PROTOCOL"
  | "INSECURE_PROTOCOL"
  | "UNSAFE_HOST"
  | "DNS_FAILURE"
  | "UNSAFE_ADDRESS"
  | "REDIRECT_NOT_ALLOWED"
  | "TIMEOUT"
  | "CANCELLED"
  | "RESPONSE_TOO_LARGE"
  | "UNSUPPORTED_BODY"
  | "REQUEST_FAILED";

const SAFE_ERROR_MESSAGES: Record<SafeOutboundHttpErrorCode, string> = {
  INVALID_URL: "Outbound URL is invalid",
  URL_CREDENTIALS: "Outbound URL must not include credentials",
  UNSAFE_PROTOCOL: "Outbound URL protocol is not allowed",
  INSECURE_PROTOCOL: "Outbound URL must use HTTPS in production",
  UNSAFE_HOST: "Outbound URL host is not allowed",
  DNS_FAILURE: "Outbound destination could not be resolved",
  UNSAFE_ADDRESS: "Outbound destination resolves to a disallowed network",
  REDIRECT_NOT_ALLOWED: "Outbound redirects are not allowed",
  TIMEOUT: "Outbound request timed out",
  CANCELLED: "Outbound request was cancelled",
  RESPONSE_TOO_LARGE: "Outbound response exceeded the allowed size",
  UNSUPPORTED_BODY: "Outbound request body type is not supported",
  REQUEST_FAILED: "Outbound request failed",
};

export class SafeOutboundHttpError extends Error {
  readonly code: SafeOutboundHttpErrorCode;

  constructor(code: SafeOutboundHttpErrorCode) {
    super(SAFE_ERROR_MESSAGES[code]);
    this.name = "SafeOutboundHttpError";
    this.code = code;
  }
}

export function getSanitizedOutboundErrorMessage(error: unknown, fallback: string): string {
  return error instanceof SafeOutboundHttpError ? error.message : fallback;
}

export type OutboundResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type OutboundResolver = (hostname: string) => Promise<readonly OutboundResolvedAddress[]>;

type SafeOutboundBody = string | Uint8Array | ArrayBuffer | URLSearchParams;

export type SafeOutboundRequestInit = {
  method?: string;
  headers?: HeadersInit;
  body?: SafeOutboundBody | null;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type OutboundTransportResponse = {
  status: number;
  statusText?: string;
  headers?: HeadersInit;
  body: AsyncIterable<Uint8Array | string>;
  destroy?: () => void;
};

export type OutboundTransport = (input: {
  url: URL;
  address: OutboundResolvedAddress;
  method: string;
  headers: Headers;
  body: Buffer | null;
  signal: AbortSignal;
}) => Promise<OutboundTransportResponse>;

export type SafeOutboundHttpClientDependencies = {
  resolver?: OutboundResolver;
  transport?: OutboundTransport;
  isProduction?: () => boolean;
};

export class SafeOutboundResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly #body: Buffer;

  constructor(input: { status: number; statusText?: string; headers?: HeadersInit; body: Buffer }) {
    this.status = input.status;
    this.statusText = input.statusText ?? "";
    this.headers = new Headers(input.headers);
    this.ok = input.status >= 200 && input.status < 300;
    this.#body = input.body;
  }

  async text(): Promise<string> {
    return this.#body.toString("utf8");
  }

  async json(): Promise<any> {
    return JSON.parse(await this.text());
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".localdomain",
  ".internal",
  ".home.arpa",
  ".lan",
  ".test",
  ".example",
  ".invalid",
  ".onion",
  ".alt",
];

const BLOCKED_IPV4_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.31.196.0", 24],
  ["192.52.193.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["192.175.48.0", 24],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const BLOCKED_IPV6_CIDRS: ReadonlyArray<readonly [string, number]> = [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
];

function parseIpv4(address: string): bigint | null {
  if (isIP(address) !== 4) return null;
  return address
    .split(".")
    .reduce((value, part) => (value << 8n) + BigInt(Number(part)), 0n);
}

function parseIpv6(address: string): bigint | null {
  const normalized = address.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (isIP(normalized) !== 6) return null;

  let expanded = normalized;
  const ipv4TailMatch = expanded.match(/(?:^|:)(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4TailMatch) {
    const ipv4 = parseIpv4(ipv4TailMatch[1]);
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    expanded = `${expanded.slice(0, -ipv4TailMatch[1].length)}${high}:${low}`;
  }

  const halves = expanded.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || (halves.length === 2 && missing < 1)) return null;

  const groups = halves.length === 2 ? [...left, ...Array(missing).fill("0"), ...right] : left;
  if (groups.length !== 8) return null;
  return groups.reduce((value, group) => (value << 16n) + BigInt(`0x${group || "0"}`), 0n);
}

function isInCidr(address: bigint, base: bigint, totalBits: number, prefixLength: number): boolean {
  const shift = BigInt(totalBits - prefixLength);
  return address >> shift === base >> shift;
}

function isPublicIpv4(address: string): boolean {
  const parsed = parseIpv4(address);
  if (parsed === null) return false;
  return !BLOCKED_IPV4_CIDRS.some(([base, prefix]) => {
    const parsedBase = parseIpv4(base)!;
    return isInCidr(parsed, parsedBase, 32, prefix);
  });
}

function isPublicIpv6(address: string): boolean {
  const parsed = parseIpv6(address);
  const globalUnicastBase = parseIpv6("2000::")!;
  if (parsed === null || !isInCidr(parsed, globalUnicastBase, 128, 3)) return false;
  return !BLOCKED_IPV6_CIDRS.some(([base, prefix]) => {
    const parsedBase = parseIpv6(base)!;
    return isInCidr(parsed, parsedBase, 128, prefix);
  });
}

export function isPublicOutboundAddress(address: string): boolean {
  const normalized = address.replace(/^\[/, "").replace(/\]$/, "");
  const family = isIP(normalized);
  return family === 4 ? isPublicIpv4(normalized) : family === 6 ? isPublicIpv6(normalized) : false;
}

function normalizeHostname(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.+$/, "");
}

function isBlockedHostname(hostname: string): boolean {
  if (!hostname || hostname.length > 253 || hostname.includes("%")) return true;
  if (isIP(hostname)) return false;
  if (!hostname.includes(".")) return true;
  if (BLOCKED_HOSTS.has(hostname)) return true;
  return BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function validateOutboundUrlPolicy(input: string | URL, requireHttps: boolean): URL {
  let url: URL;
  try {
    url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  } catch {
    throw new SafeOutboundHttpError("INVALID_URL");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SafeOutboundHttpError("UNSAFE_PROTOCOL");
  }
  if (requireHttps && url.protocol !== "https:") {
    throw new SafeOutboundHttpError("INSECURE_PROTOCOL");
  }
  if (url.username || url.password) {
    throw new SafeOutboundHttpError("URL_CREDENTIALS");
  }

  const hostname = normalizeHostname(url.hostname);
  if (isBlockedHostname(hostname)) {
    throw new SafeOutboundHttpError("UNSAFE_HOST");
  }
  if (isIP(hostname) && !isPublicOutboundAddress(hostname)) {
    throw new SafeOutboundHttpError("UNSAFE_ADDRESS");
  }

  url.hash = "";
  return url;
}

async function defaultResolver(hostname: string): Promise<readonly OutboundResolvedAddress[]> {
  const result = await dnsLookup(hostname, { all: true, verbatim: true });
  return result.flatMap((entry) => {
    const family = isIP(entry.address);
    return family === 4 || family === 6
      ? [{ address: entry.address, family } satisfies OutboundResolvedAddress]
      : [];
  });
}

async function resolveSafeAddress(
  url: URL,
  resolver: OutboundResolver,
  signal: AbortSignal,
): Promise<OutboundResolvedAddress> {
  const hostname = normalizeHostname(url.hostname);
  let addresses: readonly OutboundResolvedAddress[];
  try {
    addresses = await raceWithSignal(resolver(hostname), signal);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new SafeOutboundHttpError("DNS_FAILURE");
  }

  if (addresses.length === 0) {
    throw new SafeOutboundHttpError("DNS_FAILURE");
  }

  const normalized = addresses.map((entry) => {
    const address = entry.address.replace(/^\[/, "").replace(/\]$/, "");
    const detectedFamily = isIP(address);
    if ((detectedFamily !== 4 && detectedFamily !== 6) || detectedFamily !== entry.family) {
      throw new SafeOutboundHttpError("DNS_FAILURE");
    }
    return { address, family: detectedFamily } satisfies OutboundResolvedAddress;
  });

  if (normalized.some((entry) => !isPublicOutboundAddress(entry.address))) {
    throw new SafeOutboundHttpError("UNSAFE_ADDRESS");
  }

  return normalized[0];
}

function bodyToBuffer(body: SafeOutboundBody | null | undefined): Buffer | null {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  throw new SafeOutboundHttpError("UNSUPPORTED_BODY");
}

function headersToNodeHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(headers.entries());
}

function nodeHeadersToHeaders(headers: http.IncomingHttpHeaders): Headers {
  const normalized = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) normalized.append(name, item);
    } else if (typeof value === "string") {
      normalized.append(name, value);
    }
  }
  return normalized;
}

const nativeTransport: OutboundTransport = async (input) =>
  new Promise<OutboundTransportResponse>((resolve, reject) => {
    const requestFn = input.url.protocol === "https:" ? https.request : http.request;
    const request = requestFn(
      input.url,
      {
        method: input.method,
        headers: headersToNodeHeaders(input.headers),
        signal: input.signal,
        agent: false,
        family: input.address.family,
        lookup: (_hostname, _options, callback) => {
          callback(null, input.address.address, input.address.family);
        },
      },
      (response) => {
        resolve({
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? "",
          headers: nodeHeadersToHeaders(response.headers),
          body: response,
          destroy: () => response.destroy(),
        });
      },
    );

    request.once("error", reject);
    request.end(input.body ?? undefined);
  });

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || (value ?? 0) <= 0) return fallback;
  return Math.min(value!, maximum);
}

function raceWithSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error("aborted"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error("aborted"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function collectResponseBody(
  response: OutboundTransportResponse,
  maxResponseBytes: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const headers = new Headers(response.headers);
  const contentLength = headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxResponseBytes) {
    response.destroy?.();
    throw new SafeOutboundHttpError("RESPONSE_TOO_LARGE");
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const abortResponse = () => response.destroy?.();
  signal.addEventListener("abort", abortResponse, { once: true });
  try {
    for await (const rawChunk of response.body) {
      if (signal.aborted) throw signal.reason ?? new Error("aborted");
      const chunk = typeof rawChunk === "string" ? Buffer.from(rawChunk) : Buffer.from(rawChunk);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxResponseBytes) {
        response.destroy?.();
        throw new SafeOutboundHttpError("RESPONSE_TOO_LARGE");
      }
      chunks.push(chunk);
    }
  } finally {
    signal.removeEventListener("abort", abortResponse);
  }
  return Buffer.concat(chunks, totalBytes);
}

export function createSafeOutboundHttpClient(dependencies: SafeOutboundHttpClientDependencies = {}) {
  const resolver = dependencies.resolver ?? defaultResolver;
  const transport = dependencies.transport ?? nativeTransport;
  const getIsProduction = dependencies.isProduction ?? (() => isProductionEnvironment());

  return async function safeOutboundRequest(
    input: string | URL,
    init: SafeOutboundRequestInit = {},
  ): Promise<SafeOutboundResponse> {
    const timeoutMs = boundedInteger(init.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    const maxResponseBytes = boundedInteger(
      init.maxResponseBytes,
      DEFAULT_MAX_RESPONSE_BYTES,
      MAX_RESPONSE_BYTES,
    );
    const controller = new AbortController();
    let timedOut = false;
    const relayAbort = () => controller.abort(init.signal?.reason);
    if (init.signal?.aborted) {
      relayAbort();
    } else {
      init.signal?.addEventListener("abort", relayAbort, { once: true });
    }
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timer.unref?.();

    try {
      const url = validateOutboundUrlPolicy(input, getIsProduction());
      const address = await resolveSafeAddress(url, resolver, controller.signal);
      const headers = new Headers(init.headers);
      if (!headers.has("accept-encoding")) headers.set("accept-encoding", "identity");
      const transportResponse = await raceWithSignal(
        transport({
          url,
          address,
          method: (init.method ?? "GET").toUpperCase(),
          headers,
          body: bodyToBuffer(init.body),
          signal: controller.signal,
        }),
        controller.signal,
      );

      if (transportResponse.status >= 300 && transportResponse.status < 400) {
        transportResponse.destroy?.();
        throw new SafeOutboundHttpError("REDIRECT_NOT_ALLOWED");
      }

      const body = await raceWithSignal(
        collectResponseBody(transportResponse, maxResponseBytes, controller.signal),
        controller.signal,
      );
      return new SafeOutboundResponse({
        status: transportResponse.status,
        statusText: transportResponse.statusText,
        headers: transportResponse.headers,
        body,
      });
    } catch (error) {
      if (timedOut) throw new SafeOutboundHttpError("TIMEOUT");
      if (init.signal?.aborted) throw new SafeOutboundHttpError("CANCELLED");
      if (error instanceof SafeOutboundHttpError) throw error;
      throw new SafeOutboundHttpError("REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", relayAbort);
    }
  };
}

export const safeOutboundFetch = createSafeOutboundHttpClient();
