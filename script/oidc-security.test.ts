import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  areInsecureOidcTestProvidersAllowed,
  assertOidcClientSecretBindingUpdate,
  getOidcClientSecretBinding,
  validateOidcEndpointConfiguration,
} from "../server/services/oidcEndpointSecurity";
import {
  encryptPersistedSecret,
  integrationSecretPurpose,
  resolvePersistedSecret,
} from "../server/persisted-secret";

const secureSettings = {
  oidcIssuer: "https://identity.example.com/tenant-a",
  oidcAuthorizationUrl: "https://identity.example.com/oauth/authorize",
  oidcTokenUrl: "https://identity.example.com/oauth/token",
  oidcJwksUrl: "https://identity.example.com/oauth/keys",
};

test("OIDC endpoints require HTTPS and issuer-origin binding", () => {
  const validated = validateOidcEndpointConfiguration(secureSettings, {
    NODE_ENV: "production",
  });
  assert.equal(validated.token.origin, "https://identity.example.com");

  assert.throws(
    () => validateOidcEndpointConfiguration({
      ...secureSettings,
      oidcTokenUrl: "http://identity.example.com/oauth/token",
    }, { NODE_ENV: "production" }),
    /HTTPS/,
  );
  assert.throws(
    () => validateOidcEndpointConfiguration({
      ...secureSettings,
      oidcTokenUrl: "https://attacker.example/oauth/token",
    }, { NODE_ENV: "production" }),
    /issuer origin|trusted origin/,
  );
});

test("cross-origin OIDC endpoints require an explicit HTTPS origin allowlist", () => {
  const validated = validateOidcEndpointConfiguration({
    ...secureSettings,
    oidcJwksUrl: "https://keys.identity-cdn.example/oauth/keys",
  }, {
    NODE_ENV: "production",
    OIDC_TRUSTED_ENDPOINT_ORIGINS: "https://keys.identity-cdn.example",
  });
  assert.equal(validated.jwks.origin, "https://keys.identity-cdn.example");

  assert.throws(
    () => validateOidcEndpointConfiguration(secureSettings, {
      NODE_ENV: "production",
      OIDC_TRUSTED_ENDPOINT_ORIGINS: "http://keys.identity-cdn.example",
    }),
    /HTTPS origins/,
  );
});

test("insecure OIDC provider escape hatch is test-only", () => {
  assert.equal(areInsecureOidcTestProvidersAllowed({
    NODE_ENV: "production",
    ALLOW_INSECURE_OIDC_TEST_PROVIDER: "true",
  }), false);
  assert.equal(areInsecureOidcTestProvidersAllowed({
    NODE_ENV: "test",
    ALLOW_INSECURE_OIDC_TEST_PROVIDER: "true",
  }), true);

  assert.doesNotThrow(() => validateOidcEndpointConfiguration({
    oidcIssuer: "http://127.0.0.1:9000",
    oidcAuthorizationUrl: "http://127.0.0.1:9000/authorize",
    oidcTokenUrl: "http://127.0.0.1:9000/token",
    oidcJwksUrl: "http://127.0.0.1:9000/keys",
  }, {
    NODE_ENV: "test",
    ALLOW_INSECURE_OIDC_TEST_PROVIDER: "true",
  }));
});

test("OIDC client-secret binding changes with issuer, token destination, or client ID", () => {
  const base = {
    oidcIssuer: secureSettings.oidcIssuer,
    oidcTokenUrl: secureSettings.oidcTokenUrl,
    oidcClientId: "client-a",
  };
  const binding = getOidcClientSecretBinding(base);
  assert.equal(binding, getOidcClientSecretBinding({ ...base }));
  assert.equal(binding, getOidcClientSecretBinding({
    auth: { ...base },
  }));
  assert.notEqual(binding, getOidcClientSecretBinding({
    ...base,
    oidcIssuer: "https://identity.example.com/tenant-b",
  }));
  assert.notEqual(binding, getOidcClientSecretBinding({
    ...base,
    oidcTokenUrl: "https://identity.example.com/oauth/token-v2",
  }));
  assert.notEqual(binding, getOidcClientSecretBinding({
    ...base,
    oidcClientId: "client-b",
  }));

  const changedBinding = getOidcClientSecretBinding({
    ...base,
    oidcTokenUrl: "https://attacker.example/oauth/token",
  });
  const vaultSecret = "test-only-oidc-binding-vault-secret";
  const envelope = encryptPersistedSecret(
    "client-secret-must-not-be-rebound",
    integrationSecretPurpose.oidcClientSecretBound("org-1", binding),
    { vaultSecret },
  );
  assert.throws(
    () => resolvePersistedSecret(
      envelope,
      integrationSecretPurpose.oidcClientSecretBound("org-1", changedBinding),
      { vaultSecret },
    ),
    /could not be processed/,
  );

  assert.throws(
    () => assertOidcClientSecretBindingUpdate({
      currentSettings: base,
      nextSettings: { ...base, oidcTokenUrl: "https://attacker.example/oauth/token" },
      currentSecret: envelope,
    }),
    /Re-enter or explicitly clear/,
  );
  assert.doesNotThrow(() => assertOidcClientSecretBindingUpdate({
    currentSettings: base,
    nextSettings: { ...base, oidcTokenUrl: "https://identity.example.com/oauth/token-v2" },
    currentSecret: envelope,
    nextSecret: "replacement-client-secret",
  }));
  assert.doesNotThrow(() => assertOidcClientSecretBindingUpdate({
    currentSettings: base,
    nextSettings: { ...base, oidcTokenUrl: "https://identity.example.com/oauth/token-v2" },
    currentSecret: envelope,
    clearSecret: true,
  }));
});

test("OIDC callback uses safe pinned token/JWKS transport and local key verification", async () => {
  const ssoSource = await readFile(
    new URL("../server/services/ssoService.ts", import.meta.url),
    "utf8",
  );
  assert.match(ssoSource, /safeOutboundFetch/);
  assert.match(ssoSource, /fetchOidcEndpoint\(oidcEndpoints\.token/);
  assert.match(ssoSource, /fetchOidcEndpoint\(oidcEndpoints\.jwks/);
  assert.match(ssoSource, /createLocalJWKSet/);
  assert.doesNotMatch(ssoSource, /createRemoteJWKSet/);

  const settingsSource = await readFile(
    new URL("../server/routes/settings.ts", import.meta.url),
    "utf8",
  );
  assert.match(settingsSource, /assertOidcClientSecretBindingUpdate\(/);
  assert.match(settingsSource, /bindingSettings: updated/);

  const endpointSecuritySource = await readFile(
    new URL("../server/services/oidcEndpointSecurity.ts", import.meta.url),
    "utf8",
  );
  assert.match(endpointSecuritySource, /Re-enter or explicitly clear the OIDC client secret/);
});
