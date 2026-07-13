import test from "node:test";
import assert from "node:assert/strict";
import {
  SafeOutboundHttpError,
  createSafeOutboundHttpClient,
  isPublicOutboundAddress,
  validateOutboundUrlPolicy,
  type OutboundResolvedAddress,
  type OutboundTransport,
} from "../server/safe-outbound-http";
import { validateRuntimeEnvironment } from "../server/env";

const PUBLIC_ADDRESS = { address: "93.184.216.34", family: 4 } as const satisfies OutboundResolvedAddress;

async function* responseBody(...chunks: Array<string | Uint8Array>) {
  for (const chunk of chunks) yield chunk;
}

function assertSafeError(error: unknown, code: SafeOutboundHttpError["code"]): boolean {
  assert.ok(error instanceof SafeOutboundHttpError);
  assert.equal(error.code, code);
  return true;
}

test("production URL policy requires HTTPS and rejects credentials or local hosts", () => {
  assert.throws(
    () => validateOutboundUrlPolicy("http://hooks.example.com/event", true),
    (error) => assertSafeError(error, "INSECURE_PROTOCOL"),
  );
  assert.throws(
    () => validateOutboundUrlPolicy("https://user:secret@hooks.example.com/event", true),
    (error) => assertSafeError(error, "URL_CREDENTIALS"),
  );
  assert.throws(
    () => validateOutboundUrlPolicy("https://localhost/event", true),
    (error) => assertSafeError(error, "UNSAFE_HOST"),
  );
  assert.throws(
    () => validateOutboundUrlPolicy("https://metadata.google.internal/computeMetadata/v1", true),
    (error) => assertSafeError(error, "UNSAFE_HOST"),
  );
  assert.throws(
    () => validateOutboundUrlPolicy("https://internal-service.test/event", true),
    (error) => assertSafeError(error, "UNSAFE_HOST"),
  );
  assert.equal(validateOutboundUrlPolicy("http://hooks.example.com/event#ignored", false).hash, "");
});

test("production startup validates every server-configured outbound webhook and feed", () => {
  const baseEnv: NodeJS.ProcessEnv = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://postgres:postgres@db.acme.test:5432/governance",
    SESSION_SECRET: "s".repeat(48),
    PASSWORD_RESET_SECRET: "r".repeat(48),
    CONTROL_TOWER_VAULT_SECRET: "v".repeat(48),
    PUBLIC_APP_URL: "https://governance.acme.test",
    CORS_ALLOWED_ORIGINS: "https://governance.acme.test",
  };

  for (const name of [
    "PASSWORD_RESET_WEBHOOK_URL",
    "INVITE_WEBHOOK_URL",
    "GOVERNANCE_EVENT_WEBHOOK_URL",
    "LEAD_WEBHOOK_URL",
    "MONITORING_WEBHOOK_URL",
    "THREAT_INTEL_FEED_URL",
  ]) {
    assert.throws(
      () => validateRuntimeEnvironment({ ...baseEnv, [name]: "http://hooks.acme.test/event" }),
      new RegExp(`${name} must use https in production`),
    );
  }

  assert.throws(
    () =>
      validateRuntimeEnvironment({
        ...baseEnv,
        LEAD_WEBHOOK_URL: "https://user:secret@hooks.acme.test/event",
      }),
    /LEAD_WEBHOOK_URL must not include URL credentials/,
  );
});

test("only globally routable IPv4 and IPv6 destinations are accepted", () => {
  for (const address of [
    "0.0.0.1",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.168.1.1",
    "192.0.2.10",
    "198.18.0.1",
    "198.51.100.10",
    "203.0.113.10",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::ffff:10.0.0.1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1",
    "3fff::1",
  ]) {
    assert.equal(isPublicOutboundAddress(address), false, address);
  }

  assert.equal(isPublicOutboundAddress("93.184.216.34"), true);
  assert.equal(isPublicOutboundAddress("2606:4700:4700::1111"), true);
});

test("DNS results are validated as a set and the approved address is pinned into transport", async () => {
  const seen: Array<{ url: string; address: OutboundResolvedAddress; acceptEncoding: string | null }> = [];
  const transport: OutboundTransport = async (input) => {
    seen.push({
      url: input.url.toString(),
      address: input.address,
      acceptEncoding: input.headers.get("accept-encoding"),
    });
    return {
      status: 200,
      headers: { "content-type": "application/json" },
      body: responseBody('{"ok":true}'),
    };
  };
  const client = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport,
  });

  const response = await client("https://hooks.example.com/event", { timeoutMs: 500 });
  assert.equal(response.ok, true);
  assert.deepEqual(await response.json(), { ok: true });
  assert.deepEqual(seen, [
    {
      url: "https://hooks.example.com/event",
      address: PUBLIC_ADDRESS,
      acceptEncoding: "identity",
    },
  ]);

  let transportCalled = false;
  const mixedClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS, { address: "10.20.30.40", family: 4 }],
    transport: async () => {
      transportCalled = true;
      return { status: 200, body: responseBody("ok") };
    },
  });
  await assert.rejects(
    mixedClient("https://hooks.example.com/event"),
    (error) => assertSafeError(error, "UNSAFE_ADDRESS"),
  );
  assert.equal(transportCalled, false);
});

test("direct metadata, private, link-local, and reserved IP targets are rejected before connection", async () => {
  const client = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async (hostname) => {
      const family = hostname.includes(":") ? 6 : 4;
      return [{ address: hostname, family } as OutboundResolvedAddress];
    },
    transport: async () => {
      throw new Error("transport must not run");
    },
  });

  for (const url of [
    "https://169.254.169.254/latest/meta-data",
    "https://127.0.0.1/admin",
    "https://10.0.0.8/internal",
    "https://192.0.2.8/reserved",
    "https://[::1]/admin",
  ]) {
    await assert.rejects(client(url), (error) => assertSafeError(error, "UNSAFE_ADDRESS"));
  }
});

test("redirects are disabled so credentials cannot be forwarded to a second destination", async () => {
  let calls = 0;
  let destroyed = false;
  const client = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport: async () => {
      calls += 1;
      return {
        status: 302,
        headers: { location: "https://second.example.net/target" },
        body: responseBody("redirecting"),
        destroy: () => {
          destroyed = true;
        },
      };
    },
  });

  await assert.rejects(
    client("https://hooks.example.com/event", {
      headers: { Authorization: "Bearer must-not-leak" },
    }),
    (error) => assertSafeError(error, "REDIRECT_NOT_ALLOWED"),
  );
  assert.equal(calls, 1);
  assert.equal(destroyed, true);
});

test("declared and streamed oversized responses are stopped at the configured cap", async () => {
  let declaredDestroyed = false;
  const declaredClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport: async () => ({
      status: 200,
      headers: { "content-length": "1000" },
      body: responseBody("unused"),
      destroy: () => {
        declaredDestroyed = true;
      },
    }),
  });
  await assert.rejects(
    declaredClient("https://feeds.example.com/feed", { maxResponseBytes: 10 }),
    (error) => assertSafeError(error, "RESPONSE_TOO_LARGE"),
  );
  assert.equal(declaredDestroyed, true);

  let streamedDestroyed = false;
  const streamedClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport: async () => ({
      status: 200,
      body: responseBody("123456", "789012"),
      destroy: () => {
        streamedDestroyed = true;
      },
    }),
  });
  await assert.rejects(
    streamedClient("https://feeds.example.com/feed", { maxResponseBytes: 10 }),
    (error) => assertSafeError(error, "RESPONSE_TOO_LARGE"),
  );
  assert.equal(streamedDestroyed, true);
});

test("the deadline covers transport work and returns a sanitized timeout", async () => {
  const client = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport: async ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("socket timed out at a secret target")), {
          once: true,
        });
      }),
  });

  await assert.rejects(
    client("https://hooks.example.com/event", { timeoutMs: 10 }),
    (error) => assertSafeError(error, "TIMEOUT"),
  );
});

test("resolver and transport details are never exposed through errors", async () => {
  const dnsClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => {
      throw new Error("ENOTFOUND super-secret.internal");
    },
  });
  await assert.rejects(dnsClient("https://hooks.example.com/event"), (error) => {
    assertSafeError(error, "DNS_FAILURE");
    assert.doesNotMatch((error as Error).message, /secret|internal|hooks\.example/i);
    return true;
  });

  const transportClient = createSafeOutboundHttpClient({
    isProduction: () => true,
    resolver: async () => [PUBLIC_ADDRESS],
    transport: async () => {
      throw new Error("connect ECONNREFUSED https://user:secret@10.0.0.1");
    },
  });
  await assert.rejects(transportClient("https://hooks.example.com/event"), (error) => {
    assertSafeError(error, "REQUEST_FAILED");
    assert.doesNotMatch((error as Error).message, /secret|10\.0\.0\.1|hooks\.example/i);
    return true;
  });
});
