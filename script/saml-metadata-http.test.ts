import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import pg from "pg";
import type { SsoOrganization } from "../server/services/ssoService";
import type { RateLimitPolicy } from "../server/services/sharedRateLimitCore";

test("SAML metadata HTTP responses preserve XML boundaries", async (t) => {
  // Never inherit a deployed DB target or use a real database for this fixture.
  const keys = ["NODE_ENV", "DATABASE_URL", "SESSION_SECRET"] as const;
  const previous = keys.map((key) => process.env[key]);
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://127.0.0.1:1/saml_metadata_fixture";
  process.env.SESSION_SECRET = randomBytes(32).toString("hex");
  t.after(() => {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  });

  const noDatabase = () => { throw new Error("metadata fixture must not access PostgreSQL"); };
  const queryGuard = t.mock.method(pg.Pool.prototype, "query", noDatabase);
  const connectGuard = t.mock.method(pg.Pool.prototype, "connect", noDatabase);
  const { ssoService } = await import("../server/services/ssoService");
  const { sharedRateLimitService } = await import("../server/services/sharedRateLimitService");
  const { registerAuthRoutes } = await import("../server/routes/auth");

  const fixtures = new Map<string, SsoOrganization>();
  const resolve = t.mock.method(ssoService, "resolveOrganizationForSso", async (requestedOrg: string) => ({
    organization: fixtures.get(requestedOrg) ?? null,
    availableOrganizationSlugs: [],
  }));
  t.mock.method(sharedRateLimitService, "consume", async (policy: RateLimitPolicy) => ({
    allowed: true, limit: policy.limit, remaining: policy.limit - 1, retryAfterMs: 0,
  }));
  const app = express();
  await registerAuthRoutes(app);
  const server = createServer(app);
  t.after(() => new Promise<void>((done, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : done());
  }));
  await new Promise<void>((done, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", done);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (org?: string) => fetch(
    `${baseUrl}/api/auth/sso/metadata${org === undefined ? "" : `?org=${encodeURIComponent(org)}`}`,
    { signal: AbortSignal.timeout(5_000), redirect: "error" },
  );
  const organization = (slug: string, auth: Record<string, unknown>): SsoOrganization => ({
    id: `synthetic-${slug}`, slug, name: "Synthetic metadata fixture", settings: { auth },
  });

  await t.test("configured entity and callback values cannot create XML elements or attributes", async () => {
    fixtures.set("configured", organization("configured", {
      mode: "saml", strictSamlValidation: true,
      entityId: `urn:metadata:&<Injected/>"'`,
      callbackUrl: `https://metadata.example.test/cb?a=1&b=<Injected/>"'`,
    }));
    const response = await request("configured");
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/samlmetadata\+xml(?:;|$)/i);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.equal(xml.match(/entityID="([^"]*)"/)?.[1], "urn:metadata:&amp;&lt;Injected/&gt;&quot;&apos;");
    assert.equal(xml.match(/Location="([^"]*)"/)?.[1],
      "https://metadata.example.test/cb?a=1&amp;b=&lt;Injected/&gt;&quot;&apos;");
    assert.doesNotMatch(xml, /<Injected\b/);
    assert.match(xml, /WantAssertionsSigned="true"/);
  });

  await t.test("fallback metadata URLs retain encoded organization selectors and the request origin", async () => {
    const slug = "synthetic&<org>\"'";
    fixtures.set(slug, organization(slug, { mode: "saml", strictSamlValidation: true }));
    const response = await request(slug);
    const xml = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /^application\/samlmetadata\+xml(?:;|$)/i);
    assert.equal(xml.match(/entityID="([^"]*)"/)?.[1],
      `${baseUrl}/api/auth/sso/metadata?org=synthetic%26%3Corg%3E%22&apos;`);
    assert.equal(xml.match(/Location="([^"]*)"/)?.[1], `${baseUrl}/api/auth/sso/callback`);
    assert.doesNotMatch(xml, /<org\b/);
  });

  await t.test("a missing organization selector fails before lookup", async () => {
    const before = resolve.mock.callCount();
    const response = await request();
    assert.equal(response.status, 400);
    assert.match(response.headers.get("content-type") ?? "", /^application\/json(?:;|$)/i);
    assert.deepEqual(await response.json(), { message: "org is required" });
    assert.equal(resolve.mock.callCount(), before);
  });

  await t.test("unknown and non-SAML organizations produce JSON errors rather than metadata", async () => {
    fixtures.set("local", organization("local", { mode: "local" }));
    for (const [slug, status, message] of [
      ["missing", 404, "Organization not found"],
      ["local", 400, "Organization is not configured for SAML"],
    ] as const) {
      const response = await request(slug);
      assert.equal(response.status, status);
      assert.match(response.headers.get("content-type") ?? "", /^application\/json(?:;|$)/i);
      assert.deepEqual(await response.json(), { message });
    }
  });

  assert.equal(queryGuard.mock.callCount(), 0);
  assert.equal(connectGuard.mock.callCount(), 0);
});
