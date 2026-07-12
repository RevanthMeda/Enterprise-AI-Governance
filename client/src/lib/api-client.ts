import { resolveApiUrl } from "./api-url";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_BOOTSTRAP_PATH = "/api/auth/user";
const CSRF_ERROR_CODE = "CSRF_TOKEN_INVALID";
const CSRF_ERROR_MESSAGE = "Invalid CSRF token";

let csrfToken: string | null = null;
let csrfBootstrapPromise: Promise<void> | null = null;

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

function buildCredentialedInit(method: string, init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  if (!SAFE_METHODS.has(method) && csrfToken) {
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

  if (isMutation && !csrfToken) {
    await bootstrapCsrfToken(init.signal);
  }

  const send = async () => {
    const tokenUsed = csrfToken;
    const response = await fetch(resolveApiUrl(input.toString()), buildCredentialedInit(method, init));
    captureCsrfTokenFromResponse(response, "include");
    return { response, tokenUsed };
  };

  const firstAttempt = await send();
  if (!isMutation || !(await isInvalidCsrfResponse(firstAttempt.response))) {
    return firstAttempt.response;
  }

  if (csrfToken === firstAttempt.tokenUsed) {
    csrfToken = null;
  }
  if (!csrfToken) {
    await bootstrapCsrfToken(init.signal);
  }

  return (await send()).response;
}

export async function throwIfResponseNotOk(response: Response): Promise<void> {
  if (!response.ok) {
    const text = (await response.text()) || response.statusText;
    throw new Error(`${response.status}: ${text}`);
  }
}

export async function apiRequest(method: string, url: string, data?: unknown): Promise<Response> {
  const hasBody = data !== undefined;
  const response = await apiFetch(url, {
    method,
    headers: hasBody ? { "Content-Type": "application/json" } : undefined,
    body: hasBody ? JSON.stringify(data) : undefined,
  });

  await throwIfResponseNotOk(response);
  return response;
}
