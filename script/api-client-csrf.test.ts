import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  apiFetch,
  captureCsrfTokenFromResponse,
  clearCsrfToken,
  getCsrfToken,
} from "../client/src/lib/api-client";

const originalFetch = globalThis.fetch;
const projectRoot = path.resolve(import.meta.dirname, "..");

test.afterEach(() => {
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
