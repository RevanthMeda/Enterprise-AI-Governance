import { resolveApiUrl } from "./api-url";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_BOOTSTRAP_PATH = "/api/auth/user";
const CSRF_ERROR_CODE = "CSRF_TOKEN_INVALID";
const CSRF_ERROR_MESSAGE = "Invalid CSRF token";
const AUTHENTICATION_REQUIRED_ERROR_CODE = "AUTHENTICATION_REQUIRED";
const SESSION_EXPIRED_ERROR_CODE = "SESSION_EXPIRED";
const AUTHENTICATION_REQUIRED_MESSAGE = "Authentication required";
const SESSION_EXPIRED_MESSAGE = "Session expired. Please sign in again.";
const SESSION_UNAUTHORIZED_EXEMPT_PATHS = new Set([
  "/api/auth/user",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/sso/metadata",
  "/api/auth/sso/start",
  "/api/auth/sso/callback",
  "/api/auth/sso/exchange",
  "/api/auth/sso/mock-callback",
  "/api/auth/oidc/start",
  "/api/auth/oidc/callback",
  "/api/auth/oidc/mock-callback",
]);
const CSRF_BOOTSTRAP_EXEMPT_MUTATION_PATHS = new Set([
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/sso/exchange",
]);

let csrfToken: string | null = null;
let csrfBootstrapPromise: Promise<void> | null = null;
let sessionUnauthorizedHandler: SessionUnauthorizedHandler | null = null;

export type SessionUnauthorizedReason = "authentication-required" | "session-expired";

export type SessionUnauthorizedDetails = {
  requestPath: string;
  reason: SessionUnauthorizedReason;
};

export type SessionUnauthorizedHandler = (details: SessionUnauthorizedDetails) => void;

export function setSessionUnauthorizedHandler(handler: SessionUnauthorizedHandler): () => void {
  sessionUnauthorizedHandler = handler;
  return () => {
    if (sessionUnauthorizedHandler === handler) {
      sessionUnauthorizedHandler = null;
    }
  };
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export function clearCsrfToken(): void {
  csrfToken = null;
  csrfBootstrapPromise = null;
}

export function captureCsrfTokenFromResponse(
  response: Response,
  credentials: RequestCredentials,
): void {
  if (credentials !== "include") {
    return;
  }
  const nextToken = response.headers.get("x-csrf-token");
  if (nextToken) {
    csrfToken = nextToken;
  }
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

async function waitForBootstrap(
  promise: Promise<void>,
  signal?: AbortSignal | null,
): Promise<void> {
  if (!signal) {
    await promise;
    return;
  }
  if (signal.aborted) {
    throw abortError();
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

async function bootstrapCsrfToken(signal?: AbortSignal | null): Promise<void> {
  if (csrfToken) {
    return;
  }

  if (!csrfBootstrapPromise) {
    csrfBootstrapPromise = fetch(resolveApiUrl(CSRF_BOOTSTRAP_PATH), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    })
      .then((response) => {
        captureCsrfTokenFromResponse(response, "include");
      })
      .finally(() => {
        csrfBootstrapPromise = null;
      });
  }

  await waitForBootstrap(csrfBootstrapPromise, signal);
}

async function isInvalidCsrfResponse(response: Response): Promise<boolean> {
  if (response.status !== 403) {
    return false;
  }

  const errorCode = response.headers.get("x-error-code");
  if (errorCode !== null) {
    return errorCode === CSRF_ERROR_CODE;
  }

  try {
    const payload = (await response.clone().json()) as { message?: unknown };
    return payload?.message === CSRF_ERROR_MESSAGE;
  } catch {
    return false;
  }
}

function getRequestPath(input: string | URL): string {
  const resolved = resolveApiUrl(input.toString());
  try {
    return new URL(resolved, "http://localhost").pathname;
  } catch {
    return input.toString();
  }
}

async function getSessionUnauthorizedReason(
  input: string | URL,
  response: Response,
): Promise<SessionUnauthorizedReason | null> {
  if (response.status !== 401 || SESSION_UNAUTHORIZED_EXEMPT_PATHS.has(getRequestPath(input))) {
    return null;
  }

  const errorCode = response.headers.get("x-error-code");
  if (errorCode === SESSION_EXPIRED_ERROR_CODE) {
    return "session-expired";
  }
  if (errorCode === AUTHENTICATION_REQUIRED_ERROR_CODE) {
    return "authentication-required";
  }
  if (errorCode !== null) {
    return null;
  }

  try {
    const payload = (await response.clone().json()) as { message?: unknown };
    if (payload?.message === SESSION_EXPIRED_MESSAGE) {
      return "session-expired";
    }
    if (payload?.message === AUTHENTICATION_REQUIRED_MESSAGE) {
      return "authentication-required";
    }
  } catch {
    // A non-JSON 401 is not a trusted session-expiry signal.
  }
  return null;
}

async function notifySessionUnauthorized(input: string | URL, response: Response): Promise<void> {
  const reason = await getSessionUnauthorizedReason(input, response);
  if (!reason) {
    return;
  }

  clearCsrfToken();
  sessionUnauthorizedHandler?.({
    requestPath: getRequestPath(input),
    reason,
  });
}

function buildCredentialedInit(
  method: string,
  init: RequestInit,
  attachCsrfToken: boolean,
): RequestInit {
  const headers = new Headers(init.headers);
  if (attachCsrfToken && !SAFE_METHODS.has(method) && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  return {
    ...init,
    method,
    headers,
    credentials: "include",
  };
}

export async function apiFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const isMutation = !SAFE_METHODS.has(method);
  const isCsrfBootstrapExemptMutation =
    isMutation && CSRF_BOOTSTRAP_EXEMPT_MUTATION_PATHS.has(getRequestPath(input));

  if (isMutation && !isCsrfBootstrapExemptMutation && !csrfToken) {
    await bootstrapCsrfToken(init.signal);
  }

  const send = async () => {
    const tokenUsed = isCsrfBootstrapExemptMutation ? null : csrfToken;
    const response = await fetch(
      resolveApiUrl(input.toString()),
      buildCredentialedInit(method, init, !isCsrfBootstrapExemptMutation),
    );
    captureCsrfTokenFromResponse(response, "include");
    return { response, tokenUsed };
  };

  const firstAttempt = await send();
  if (
    !isMutation
    || isCsrfBootstrapExemptMutation
    || !(await isInvalidCsrfResponse(firstAttempt.response))
  ) {
    await notifySessionUnauthorized(input, firstAttempt.response);
    return firstAttempt.response;
  }

  if (csrfToken === firstAttempt.tokenUsed) {
    csrfToken = null;
  }
  if (!csrfToken) {
    await bootstrapCsrfToken(init.signal);
  }

  const retryResponse = (await send()).response;
  await notifySessionUnauthorized(input, retryResponse);
  return retryResponse;
}

export async function throwIfResponseNotOk(response: Response): Promise<void> {
  if (!response.ok) {
    const text = (await response.text()) || response.statusText;
    throw new Error(`${response.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
  init: RequestInit = {},
): Promise<Response> {
  const hasBody = data !== undefined;
  const headers = new Headers(init.headers);
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(url, {
    ...init,
    method,
    headers,
    body: hasBody ? JSON.stringify(data) : init.body,
  });

  await throwIfResponseNotOk(response);
  return response;
}
