type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

const DEFAULT_RETRIES = Number(process.env.SMOKE_RETRIES || 12);
const DEFAULT_DELAY_MS = Number(process.env.SMOKE_DELAY_MS || 10000);

function normalizeBaseUrl(input: string): string {
  return input.endsWith("/") ? input.slice(0, -1) : input;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { response, text };
}

function cookieFromSetCookie(setCookie: string | null) {
  if (!setCookie) return null;
  const firstCookie = setCookie.split(",")[0] ?? "";
  const pair = firstCookie.split(";")[0] ?? "";
  return pair || null;
}

async function loginAndGetCookie(backend: string, username: string, password: string) {
  const response = await fetch(`${backend}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`login failed with ${response.status}: ${text}`);
  }

  const cookie = cookieFromSetCookie(response.headers.get("set-cookie"));
  if (!cookie) {
    throw new Error("login succeeded but no session cookie was returned");
  }

  return cookie;
}

async function runCheck(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true, detail: "ok" };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : "Unknown failure",
    };
  }
}

async function runCheckWithRetry(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DEFAULT_RETRIES; attempt += 1) {
    try {
      await fn();
      return { name, ok: true, detail: `ok after ${attempt} attempt${attempt === 1 ? "" : "s"}` };
    } catch (error) {
      lastError = error;
      if (attempt < DEFAULT_RETRIES) {
        await sleep(DEFAULT_DELAY_MS);
      }
    }
  }

  return {
    name,
    ok: false,
    detail: lastError instanceof Error ? lastError.message : "Unknown failure",
  };
}

async function main() {
  const frontendBase = process.env.SMOKE_FRONTEND_URL || process.argv[2];
  const backendBase = process.env.SMOKE_BACKEND_URL || process.argv[3];

  if (!frontendBase && !backendBase) {
    throw new Error("Provide SMOKE_FRONTEND_URL and/or SMOKE_BACKEND_URL, or pass them as arguments.");
  }

  const frontend = frontendBase ? normalizeBaseUrl(frontendBase) : null;
  const backend = backendBase ? normalizeBaseUrl(backendBase) : frontend;
  const adminUsername = process.env.SMOKE_ADMIN_USERNAME;
  const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;

  const checks: Promise<CheckResult>[] = [];

  if (backend) {
    checks.push(
      runCheckWithRetry("backend health", async () => {
        const { response, text } = await fetchText(`${backend}/api/health`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        const payload = JSON.parse(text) as { ok?: boolean };
        if (!payload.ok) {
          throw new Error("health payload missing ok=true");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("backend readiness", async () => {
        const { response, text } = await fetchText(`${backend}/api/ready`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        const payload = JSON.parse(text) as { ready?: boolean };
        if (!payload.ready) {
          throw new Error("readiness payload missing ready=true");
        }
      }),
    );

    if (adminUsername && adminPassword) {
      const authenticatedApiChecks = [
        "/api/auth/user",
        "/api/organization/subscription",
        "/api/organization/jira-integration",
        "/api/decision-audits/summary",
        "/api/incidents/summary",
        "/api/telemetry/summary",
        "/api/audit-logs/verify-chain",
      ];

      for (const path of authenticatedApiChecks) {
        checks.push(
          runCheckWithRetry(`authenticated ${path}`, async () => {
            const cookie = await loginAndGetCookie(backend, adminUsername, adminPassword);
            const { response } = await fetchText(`${backend}${path}`, {
              headers: { Cookie: cookie },
            });
            if (!response.ok) {
              throw new Error(`expected 200, received ${response.status}`);
            }
          }),
        );
      }
    }
  }

  if (frontend) {
    checks.push(
      runCheckWithRetry("frontend landing", async () => {
        const { response, text } = await fetchText(`${frontend}/`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("AI CONTROL GRID")) {
          throw new Error("landing response missing expected app marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend login", async () => {
        const { response, text } = await fetchText(`${frontend}/auth/login`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Sign In")) {
          throw new Error("login response missing Sign In marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend reset password", async () => {
        const { response, text } = await fetchText(`${frontend}/auth/reset-password`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Reset password")) {
          throw new Error("reset-password response missing expected marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend api docs", async () => {
        const { response, text } = await fetchText(`${frontend}/api-docs`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("API documentation")) {
          throw new Error("api docs response missing expected marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend trust center", async () => {
        const { response, text } = await fetchText(`${frontend}/trust-center`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Trust Center")) {
          throw new Error("trust center response missing expected marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend redoc identity", async () => {
        const { response, text } = await fetchText(`${frontend}/api-docs/identity.html`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Redoc.init")) {
          throw new Error("identity redoc page missing init marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend redoc platform", async () => {
        const { response, text } = await fetchText(`${frontend}/api-docs/platform.html`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Redoc.init")) {
          throw new Error("platform redoc page missing init marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend thank you alias", async () => {
        const { response, text } = await fetchText(`${frontend}/book-demo/thank-you`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Thanks, your request was received")) {
          throw new Error("thank-you response missing expected marker");
        }
      }),
    );

    checks.push(
      runCheckWithRetry("frontend start-pilot thank you alias", async () => {
        const { response, text } = await fetchText(`${frontend}/start-pilot/thank-you`);
        if (!response.ok) {
          throw new Error(`expected 200, received ${response.status}`);
        }
        if (!text.includes("Thanks, your request was received")) {
          throw new Error("start-pilot thank-you response missing expected marker");
        }
      }),
    );
  }

  const results = await Promise.all(checks);
  const failed = results.filter((result) => !result.ok);

  for (const result of results) {
    console.log(`[${result.ok ? "PASS" : "FAIL"}] ${result.name} - ${result.detail}`);
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
