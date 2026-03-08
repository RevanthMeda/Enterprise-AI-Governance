const rawApiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() ?? "";
const apiBaseUrl = rawApiBaseUrl.replace(/\/+$/, "");

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function rewriteSameOriginAbsoluteApiUrl(input: string): string {
  if (!apiBaseUrl || typeof window === "undefined") {
    return input;
  }

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return input;
  }

  if (parsed.origin !== window.location.origin || !isApiPath(parsed.pathname)) {
    return input;
  }

  return `${apiBaseUrl}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function resolveApiUrl(input: string): string {
  if (!apiBaseUrl) {
    return input;
  }

  if (isApiPath(input)) {
    return `${apiBaseUrl}${input}`;
  }

  return rewriteSameOriginAbsoluteApiUrl(input);
}

