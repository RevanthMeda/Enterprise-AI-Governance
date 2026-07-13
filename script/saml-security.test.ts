import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { CacheItem, CacheProvider } from "@node-saml/node-saml";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.SESSION_SECRET ??= "saml-security-test-session-secret";

const {
  areInsecureSamlTestFixturesAllowed,
  assertSamlValidationMode,
  assertStrictSamlProfileSecurity,
  createStrictSamlClient,
} = await import("../server/services/ssoService");

class CapturingCacheProvider implements CacheProvider {
  readonly values = new Map<string, string>();

  async saveAsync(key: string, value: string): Promise<CacheItem> {
    this.values.set(key, value);
    return { value, createdAt: Date.now() };
  }

  async getAsync(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async removeAsync(key: string | null): Promise<string | null> {
    if (!key) return null;
    const value = this.values.get(key) ?? null;
    this.values.delete(key);
    return value;
  }
}

function makeStrictProfile(input: {
  nowMs: number;
  issuer?: string;
  audience?: string;
  responseTo?: string;
  recipient?: string;
  includeConditionTimes?: boolean;
}): Record<string, unknown> {
  const issuer = input.issuer ?? "https://idp.example.com/metadata";
  const audience = input.audience ?? "urn:example:sp";
  const responseTo = input.responseTo ?? "_request-123";
  const recipient = input.recipient ?? "https://app.example.com/api/auth/sso/callback";
  const conditionAttributes = input.includeConditionTimes === false
    ? {}
    : {
        NotBefore: new Date(input.nowMs - 30_000).toISOString(),
        NotOnOrAfter: new Date(input.nowMs + 120_000).toISOString(),
      };

  return {
    issuer,
    inResponseTo: responseTo,
    getAssertion: () => ({
      Assertion: {
        $: {
          IssueInstant: new Date(input.nowMs - 15_000).toISOString(),
        },
        Conditions: [
          {
            $: conditionAttributes,
            AudienceRestriction: [{ Audience: [{ _: audience }] }],
          },
        ],
        Subject: [
          {
            SubjectConfirmation: [
              {
                $: { Method: "urn:oasis:names:tc:SAML:2.0:cm:bearer" },
                SubjectConfirmationData: [
                  {
                    $: {
                      InResponseTo: responseTo,
                      Recipient: recipient,
                      NotOnOrAfter: new Date(input.nowMs + 120_000).toISOString(),
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    }),
  };
}

test("unsigned SAML fixtures require both test mode and the explicit fixture flag", () => {
  assert.equal(
    areInsecureSamlTestFixturesAllowed({
      NODE_ENV: "test",
      ALLOW_INSECURE_SAML_TEST_FIXTURES: "true",
    }),
    true,
  );
  assert.equal(
    areInsecureSamlTestFixturesAllowed({
      NODE_ENV: "development",
      ALLOW_INSECURE_SAML_TEST_FIXTURES: "true",
    }),
    false,
  );
  assert.equal(
    areInsecureSamlTestFixturesAllowed({
      NODE_ENV: "production",
      ALLOW_INSECURE_SAML_TEST_FIXTURES: "true",
    }),
    false,
  );
  assert.equal(areInsecureSamlTestFixturesAllowed({ NODE_ENV: "test" }), false);
  assert.throws(
    () => assertSamlValidationMode(false, { NODE_ENV: "development" }),
    /strict saml validation is required/i,
  );
  assert.equal(
    assertSamlValidationMode(false, {
      NODE_ENV: "test",
      ALLOW_INSECURE_SAML_TEST_FIXTURES: "true",
    }),
    "insecure_test_fixture",
  );
  assert.equal(assertSamlValidationMode(true, { NODE_ENV: "production" }), "strict");
});

test("strict SAML creates a real AuthnRequest and records its correlation ID", async () => {
  const cacheProvider = new CapturingCacheProvider();
  const saml = createStrictSamlClient({
    callbackUrl: "https://app.example.com/api/auth/sso/callback",
    spIssuer: "urn:example:sp",
    idpCert: "test-only-placeholder-certificate",
    entryPoint: "https://idp.example.com/saml/sso",
    idpIssuer: "https://idp.example.com/metadata",
    cacheProvider,
  });

  const redirect = new URL(await saml.getAuthorizeUrlAsync("relay-state-123", undefined, {}));
  const encodedRequest = redirect.searchParams.get("SAMLRequest");
  assert.ok(encodedRequest, "strict start must send SAMLRequest");
  assert.equal(redirect.searchParams.get("RelayState"), "relay-state-123");

  const requestXml = inflateRawSync(Buffer.from(encodedRequest, "base64")).toString("utf8");
  assert.match(requestXml, /<samlp:AuthnRequest\b/);
  assert.match(requestXml, /AssertionConsumerServiceURL="https:\/\/app\.example\.com\/api\/auth\/sso\/callback"/);
  assert.match(requestXml, /<saml:Issuer[^>]*>urn:example:sp<\/saml:Issuer>/);
  const requestId = requestXml.match(/\bID="([^"]+)"/)?.[1];
  assert.ok(requestId, "AuthnRequest must have an ID");
  assert.ok(cacheProvider.values.has(requestId), "AuthnRequest ID must be persisted for InResponseTo validation");
});

test("strict profile checks require issuer, correlation, audience, timing, and recipient", () => {
  const nowMs = Date.parse("2026-07-13T12:00:00.000Z");
  const expected = {
    idpIssuer: "https://idp.example.com/metadata",
    spAudience: "urn:example:sp",
    callbackUrl: "https://app.example.com/api/auth/sso/callback",
    expectedInResponseTo: "_request-123",
    nowMs,
  };

  assert.doesNotThrow(() => assertStrictSamlProfileSecurity(makeStrictProfile({ nowMs }), expected));
  assert.throws(
    () => assertStrictSamlProfileSecurity(makeStrictProfile({ nowMs, issuer: "https://evil.test/idp" }), expected),
    /issuer mismatch/i,
  );
  assert.throws(
    () => assertStrictSamlProfileSecurity(makeStrictProfile({ nowMs, audience: "urn:wrong:sp" }), expected),
    /audience mismatch/i,
  );
  assert.throws(
    () => assertStrictSamlProfileSecurity(makeStrictProfile({ nowMs, responseTo: "_wrong-request" }), expected),
    /correlation failed/i,
  );
  assert.throws(
    () => assertStrictSamlProfileSecurity(makeStrictProfile({ nowMs, recipient: "https://evil.test/callback" }), expected),
    /recipient mismatch/i,
  );
  assert.throws(
    () => assertStrictSamlProfileSecurity(makeStrictProfile({ nowMs, includeConditionTimes: false }), expected),
    /conditions notbefore is required/i,
  );
});

test("production source uses one-time database CAS and mandatory SAML signatures", () => {
  const serviceSource = fs.readFileSync(path.resolve("server/services/ssoService.ts"), "utf8");
  const authRouteSource = fs.readFileSync(path.resolve("server/routes/auth.ts"), "utf8");
  const settingsRouteSource = fs.readFileSync(path.resolve("server/routes/settings.ts"), "utf8");
  const settingsPageSource = fs.readFileSync(path.resolve("client/src/pages/settings.tsx"), "utf8");
  const schemaSource = fs.readFileSync(path.resolve("shared/schema.ts"), "utf8");

  for (const marker of [
    "ValidateInResponseTo.always",
    "wantAssertionsSigned: true",
    "wantAuthnResponseSigned: true",
    "isNull(samlAuthnRequests.consumedAt)",
    "gt(samlAuthnRequests.expiresAt, now)",
    "relayStateHash",
    ".set({ consumedAt: now })",
  ]) {
    assert.ok(serviceSource.includes(marker), `missing strict SAML guard: ${marker}`);
  }
  assert.ok(schemaSource.includes('pgTable("saml_authn_requests"'));
  assert.ok(schemaSource.includes('requestIdHash: text("request_id_hash").primaryKey()'));
  assert.ok(
    authRouteSource.includes("!ssoService.areInsecureSamlTestFixturesAllowed()"),
    "mock SAML callback must use the explicit fixture gate",
  );
  assert.ok(
    settingsRouteSource.includes("!settings.strictSamlValidation && !areInsecureSamlTestFixturesAllowed()"),
    "organization settings must reject insecure SAML outside explicit test fixtures",
  );
  assert.ok(
    settingsRouteSource.includes("settings.strictSamlValidation && !settings.idpIssuer"),
    "strict SAML settings must require the expected IdP issuer",
  );
  assert.ok(
    settingsPageSource.includes('strictSamlValidation: authMode === "saml" ? true : strictSamlValidation'),
    "the settings client must always submit strict SAML validation",
  );
  assert.ok(
    authRouteSource.includes("res.redirect(303, buildSsoSuccessRedirect(completed.next))"),
    "browser SSO callbacks must return users to the application",
  );
});
