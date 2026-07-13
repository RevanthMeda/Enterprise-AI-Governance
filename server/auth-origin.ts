import type { Request } from "express";
import { getRuntimeConfig } from "./env";

function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (
      (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
      parsed.username ||
      parsed.password ||
      (parsed.pathname && parsed.pathname !== "/") ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isTrustedBrowserOrigin(input: {
  origin?: string | null;
  requestOrigin: string;
  allowedOrigins: readonly string[];
}): boolean {
  // Non-browser/server-to-server clients normally omit Origin. Browser
  // cross-origin form/fetch requests cannot suppress it.
  if (!input.origin) return true;
  const origin = normalizeOrigin(input.origin);
  if (!origin) return false;
  return origin === normalizeOrigin(input.requestOrigin) || input.allowedOrigins.includes(origin);
}

export function isTrustedAuthRequestOrigin(req: Request): boolean {
  const host = req.get("host");
  if (!host) return false;
  return isTrustedBrowserOrigin({
    origin: req.get("origin"),
    requestOrigin: `${req.protocol}://${host}`,
    allowedOrigins: getRuntimeConfig().allowedCorsOrigins,
  });
}
