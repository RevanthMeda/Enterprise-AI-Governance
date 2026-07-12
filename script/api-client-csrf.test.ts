import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  apiFetch,
  apiRequest,
  captureCsrfTokenFromResponse,
  clearCsrfToken,
  getCsrfToken,
  setSessionUnauthorizedHandler,
  type SessionUnauthorizedDetails,
} from "../client/src/lib/api-client";

const originalFetch = globalThis.fetch;
const projectRoot = path.resolve(import.meta.dirname, "..");
let removeSessionUnauthorizedHandler: (() => void) | null = null;

test.afterEach(() => {
  removeSessionUnauthorizedHandler?.();
  removeSessionUnauthorizedHandler = null;
  clearCsrfToken();
  globalThis.fetch = originalFetch;
});

test("deployment profiles keep production same-origin and Firebase explicit", () => {
  const productionEnv = fs.readFileSync(path.join(projectRoot, "client/.env.production"), "utf8");
  const firebaseEnv = fs.readFileSync(path.join(projectRoot, "client/.env.firebase"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };

  assert.match(productionEnv, /^VITE_API_BASE_URL=\s*$/m);
  assert.match(
    firebaseEnv,
    /^VITE_API_BASE_URL=https:\/\/enterprise-ai-governance\.onrender\.com\s*$/m,
  );
  assert.match(packageJson.scripts?.["build:firebase"] ?? "", /vite build --mode firebase/);
});

test("mutation requests bootstrap CSRF and always include credentials", async () => {
  const calls: Array<{ input: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: input.toString(), init });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "Not authenticated" }), {
        status: 401,
        headers: { "X-CSRF-Token": "bootstrap-token" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const response = await apiFetch("/api/ai-systems", { method: "POST", body: "{}" });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].input, "/api/auth/user");
  assert.equal(calls[0].init?.credentials, "include");
  assert.equal(calls[1].init?.credentials, "include");
  assert.equal(new Headers(calls[1].init?.headers).get("x-csrf-token"), "bootstrap-token");
  assert.equal(getCsrfToken(), "bootstrap-token");
});

test("apiRequest preserves caller cancellation for protected queries", async () => {
  const controller = new AbortController();
  let requestInit: RequestInit | undefined;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestInit = init;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await apiRequest("GET", "/api/incidents", undefined, {
    signal: controller.signal,
    headers: { "X-Test-Request": "preserved" },
  });

  assert.equal(requestInit?.signal, controller.signal);
  assert.equal(requestInit?.credentials, "include");
  assert.equal(new Headers(requestInit?.headers).get("x-test-request"), "preserved");
});

test("password recovery mutations do not bootstrap or attach session CSRF state", async () => {
  for (const [path, preloadToken] of [
    ["/api/auth/forgot-password", false],
    ["/api/auth/reset-password", true],
  ] as const) {
    clearCsrfToken();
    if (preloadToken) {
      captureCsrfTokenFromResponse(
        new Response(null, { headers: { "X-CSRF-Token": "existing-session-token" } }),
        "include",
      );
    }
    const calls: Array<{ input: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ input: input.toString(), init });
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await apiRequest("POST", path, { identifier: "user@example.test" });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].input, path);
    assert.equal(new Headers(calls[0].init?.headers).get("x-csrf-token"), null);
  }
});

test("an abort signal cancels a mutation CSRF bootstrap", async () => {
  const controller = new AbortController();
  let resolveBootstrap!: (response: Response) => void;
  globalThis.fetch = (async () => new Promise<Response>((resolve) => {
    resolveBootstrap = resolve;
  })) as typeof fetch;

  const request = apiFetch("/api/auth/login", {
    method: "POST",
    signal: controller.signal,
  });
  controller.abort();

  await assert.rejects(request, { name: "AbortError" });
  resolveBootstrap(new Response(null, { headers: { "X-CSRF-Token": "late-token" } }));
});

test("concurrent signaled and unsignaled mutations share one CSRF bootstrap", async () => {
  const controller = new AbortController();
  let bootstrapCalls = 0;
  let mutationCalls = 0;
  let resolveBootstrap!: (response: Response) => void;
  globalThis.fetch = (async (input: string | URL | Request) => {
    if (input.toString() === "/api/auth/user") {
      bootstrapCalls += 1;
      return new Promise<Response>((resolve) => {
        resolveBootstrap = resolve;
      });
    }
    mutationCalls += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const first = apiFetch("/api/ai-systems", { method: "POST" });
  const second = apiFetch("/api/ai-systems", {
    method: "POST",
    signal: controller.signal,
  });
  resolveBootstrap(new Response(null, { headers: { "X-CSRF-Token": "shared-token" } }));

  const [firstResponse, secondResponse] = await Promise.all([first, second]);
  assert.equal(firstResponse.status, 204);
  assert.equal(secondResponse.status, 204);
  assert.equal(bootstrapCalls, 1);
  assert.equal(mutationCalls, 2);
});

test("responses from uncredentialed API-key calls cannot replace session CSRF state", () => {
  captureCsrfTokenFromResponse(
    new Response(null, { headers: { "X-CSRF-Token": "session-token" } }),
    "include",
  );
  captureCsrfTokenFromResponse(
    new Response(null, { headers: { "X-CSRF-Token": "anonymous-token" } }),
    "omit",
  );

  assert.equal(getCsrfToken(), "session-token");
});

test("exact CSRF error code retries once with the response token", async () => {
  captureCsrfTokenFromResponse(new Response(null, { headers: { "X-CSRF-Token": "stale-token" } }), "include");
  const requestTokens: Array<string | null> = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    requestTokens.push(new Headers(init?.headers).get("x-csrf-token"));
    if (requestTokens.length === 1) {
      return new Response(JSON.stringify({ message: "Invalid CSRF token" }), {
        status: 403,
        headers: {
          "X-CSRF-Token": "fresh-token",
          "X-Error-Code": "CSRF_TOKEN_INVALID",
        },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;

  const response = await apiFetch("/api/ai-systems", { method: "POST" });

  assert.equal(response.status, 200);
  assert.deepEqual(requestTokens, ["stale-token", "fresh-token"]);
});

test("exact legacy response body retries when the error-code header is absent", async () => {
  captureCsrfTokenFromResponse(new Response(null, { headers: { "X-CSRF-Token": "old-token" } }), "include");
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(JSON.stringify({ message: "Invalid CSRF token" }), {
        status: 403,
        headers: { "X-CSRF-Token": "replacement-token" },
      });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const response = await apiFetch("/api/evidence/1", { method: "DELETE" });

  assert.equal(response.status, 204);
  assert.equal(callCount, 2);
});

test("an invalid response without a replacement token bootstraps before retrying", async () => {
  captureCsrfTokenFromResponse(new Response(null, { headers: { "X-CSRF-Token": "stale-token" } }), "include");
  const calls: Array<{ input: string; token: string | null; credentials?: RequestCredentials }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      input: input.toString(),
      token: new Headers(init?.headers).get("x-csrf-token"),
      credentials: init?.credentials,
    });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ message: "Invalid CSRF token" }), {
        status: 403,
        headers: { "X-Error-Code": "CSRF_TOKEN_INVALID" },
      });
    }
    if (calls.length === 2) {
      return new Response(null, { headers: { "X-CSRF-Token": "bootstrapped-token" } });
    }
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  const response = await apiFetch("/api/ai-systems", { method: "POST" });

  assert.equal(response.status, 204);
  assert.deepEqual(calls, [
    { input: "/api/ai-systems", token: "stale-token", credentials: "include" },
    { input: "/api/auth/user", token: null, credentials: "include" },
    { input: "/api/ai-systems", token: "bootstrapped-token", credentials: "include" },
  ]);
});

test("near-match errors are not retried", async () => {
  captureCsrfTokenFromResponse(new Response(null, { headers: { "X-CSRF-Token": "current-token" } }), "include");
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: "Invalid CSRF token." }), { status: 403 });
  }) as typeof fetch;

  const response = await apiFetch("/api/ai-systems", { method: "POST" });

  assert.equal(response.status, 403);
  assert.equal(callCount, 1);
});

test("an exact CSRF failure is retried no more than once", async () => {
  captureCsrfTokenFromResponse(new Response(null, { headers: { "X-CSRF-Token": "token-1" } }), "include");
  let callCount = 0;
  globalThis.fetch = (async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: "Invalid CSRF token" }), {
      status: 403,
      headers: {
        "X-CSRF-Token": `token-${callCount + 1}`,
        "X-Error-Code": "CSRF_TOKEN_INVALID",
      },
    });
  }) as typeof fetch;

  const response = await apiFetch("/api/ai-systems", { method: "POST" });

  assert.equal(response.status, 403);
  assert.equal(callCount, 2);
});

test("protected authentication failures clear CSRF state and identify the expired session", async () => {
  captureCsrfTokenFromResponse(
    new Response(null, { headers: { "X-CSRF-Token": "authenticated-token" } }),
    "include",
  );
  const notifications: SessionUnauthorizedDetails[] = [];
  removeSessionUnauthorizedHandler = setSessionUnauthorizedHandler((details) => {
    notifications.push(details);
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = input.toString();
    return new Response(JSON.stringify({ message: "Authentication required" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "X-Error-Code": path.includes("telemetry-adapter")
          ? "AUTHENTICATION_REQUIRED"
          : "SESSION_EXPIRED",
      },
    });
  }) as typeof fetch;

  await apiFetch("/api/organization/telemetry-adapter");
  await apiFetch("/api/incidents/summary");
  await apiFetch("/api/auth/switch-organization", { method: "POST" });

  assert.equal(getCsrfToken(), null);
  assert.deepEqual(notifications, [
    {
      requestPath: "/api/organization/telemetry-adapter",
      reason: "authentication-required",
    },
    {
      requestPath: "/api/incidents/summary",
      reason: "session-expired",
    },
    {
      requestPath: "/api/auth/switch-organization",
      reason: "session-expired",
    },
  ]);
});

test("auth endpoints and telemetry-key failures do not expire the browser session", async () => {
  const notifications: SessionUnauthorizedDetails[] = [];
  removeSessionUnauthorizedHandler = setSessionUnauthorizedHandler((details) => {
    notifications.push(details);
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    const path = input.toString();
    if (path.startsWith("/api/auth/")) {
      return new Response(JSON.stringify({ message: "Not authenticated" }), {
        status: 401,
        headers: { "X-Error-Code": "AUTHENTICATION_REQUIRED" },
      });
    }
    return new Response(JSON.stringify({ message: "Invalid telemetry ingest key" }), {
      status: 401,
    });
  }) as typeof fetch;

  await apiFetch("/api/auth/user");
  await apiFetch("/api/auth/login");
  await apiFetch("/api/telemetry/sdk-evaluate");

  assert.deepEqual(notifications, []);
});

test("legacy protected authentication body still expires the stale client session", async () => {
  const notifications: SessionUnauthorizedDetails[] = [];
  removeSessionUnauthorizedHandler = setSessionUnauthorizedHandler((details) => {
    notifications.push(details);
  });
  globalThis.fetch = (async () => new Response(
    JSON.stringify({ message: "Authentication required" }),
    { status: 401, headers: { "Content-Type": "application/json" } },
  )) as typeof fetch;

  await apiFetch("/api/organization/telemetry-adapter");

  assert.deepEqual(notifications, [{
    requestPath: "/api/organization/telemetry-adapter",
    reason: "authentication-required",
  }]);
});
