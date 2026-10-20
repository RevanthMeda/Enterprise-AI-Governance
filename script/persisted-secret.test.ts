import test from "node:test";
import assert from "node:assert/strict";
import {
  PersistedSecretError,
  encryptPersistedSecret,
  hasPersistedCredential,
  integrationSecretPurpose,
  isPersistedSecretEnvelope,
  mergePersistedSecret,
  resolvePersistedSecret,
} from "../server/persisted-secret";

const VAULT_SECRET = "unit-test-vault-secret-that-is-long-and-stable";
const ORG_ID = "org-123";
const PURPOSE = integrationSecretPurpose.jiraApiToken(ORG_ID);
const OPTIONS = { vaultSecret: VAULT_SECRET };

test("AES-256-GCM envelopes are versioned, randomized, and purpose-bound", () => {
  const first = encryptPersistedSecret("jira-token-value", PURPOSE, OPTIONS);
  const second = encryptPersistedSecret("jira-token-value", PURPOSE, OPTIONS);

  assert.match(first, /^aict:secret:v1:/);
  assert.notEqual(first, second);
  assert.equal(isPersistedSecretEnvelope(first), true);
  assert.deepEqual(resolvePersistedSecret(first, PURPOSE, OPTIONS), {
    plaintext: "jira-token-value",
    isLegacyPlaintext: false,
  });

  assert.throws(
    () =>
      resolvePersistedSecret(
        first,
        integrationSecretPurpose.threatFeedAuthToken(ORG_ID),
        OPTIONS,
      ),
    PersistedSecretError,
  );
});

test("ciphertext, tag, and version tampering fail with a sanitized error", () => {
  const envelope = encryptPersistedSecret("do-not-expose-this", PURPOSE, OPTIONS);
  const variants = [
    envelope.replace(/.$/, envelope.endsWith("A") ? "B" : "A"),
    envelope.replace(":v1:", ":v2:"),
    `${envelope}:extra`,
  ];

  for (const value of variants) {
    assert.throws(
      () => resolvePersistedSecret(value, PURPOSE, OPTIONS),
      (error) => {
        assert.ok(error instanceof PersistedSecretError);
        assert.doesNotMatch(error.message, /do-not-expose|org-123|aict:secret/i);
        return true;
      },
    );
  }
});

test("legacy plaintext remains executable and is migrated when a patch preserves it", () => {
  const legacy = resolvePersistedSecret("legacy-api-token", PURPOSE, OPTIONS);
  assert.deepEqual(legacy, { plaintext: "legacy-api-token", isLegacyPlaintext: true });

  const migrated = mergePersistedSecret({
    currentValue: "legacy-api-token",
    nextValue: "",
    purpose: PURPOSE,
    options: OPTIONS,
  });
  assert.ok(migrated);
  assert.equal(isPersistedSecretEnvelope(migrated), true);
  assert.equal(resolvePersistedSecret(migrated, PURPOSE, OPTIONS).plaintext, "legacy-api-token");
});

test("blank and masked updates preserve, replacements rotate, and explicit clear removes", () => {
  const current = encryptPersistedSecret("current-token", PURPOSE, OPTIONS);
  for (const nextValue of [undefined, null, "", "   ", "********", "••••••••"]) {
    assert.equal(
      mergePersistedSecret({ currentValue: current, nextValue, purpose: PURPOSE, options: OPTIONS }),
      current,
    );
  }

  const replacement = mergePersistedSecret({
    currentValue: current,
    nextValue: "replacement-token",
    purpose: PURPOSE,
    options: OPTIONS,
  });
  assert.ok(replacement);
  assert.notEqual(replacement, current);
  assert.equal(resolvePersistedSecret(replacement, PURPOSE, OPTIONS).plaintext, "replacement-token");

  assert.equal(
    mergePersistedSecret({
      currentValue: current,
      nextValue: "ignored",
      clear: true,
      purpose: PURPOSE,
      options: OPTIONS,
    }),
    null,
  );
});

test("credential state is boolean-only and encryption requires the dedicated vault secret", () => {
  assert.equal(hasPersistedCredential(null), false);
  assert.equal(hasPersistedCredential(""), false);
  assert.equal(hasPersistedCredential("legacy-secret"), true);
  assert.equal(hasPersistedCredential(encryptPersistedSecret("secret", PURPOSE, OPTIONS)), true);

  assert.throws(
    () => encryptPersistedSecret("secret", PURPOSE, { vaultSecret: "" }),
    /CONTROL_TOWER_VAULT_SECRET must be configured/,
  );
});


test("existing v1 envelopes remain readable with explicit GCM tag length", () => {
  // Captured from the pre-hardening implementation using synthetic test data.
  const previousEnvelope = "aict:secret:v1:aW50ZWdyYXRpb246amlyYTphcGktdG9rZW46b3JnYW5pemF0aW9uOm9yZy0xMjM:1qiaBlC0o8jsaiA0:hw7DZgeH0gued_ogkvx81g:IoAm36mp5qaPbaWXId9yPuYPprB9";
  assert.equal(resolvePersistedSecret(previousEnvelope, PURPOSE, OPTIONS).plaintext, "compatibility-fixture");
});

test("GCM envelopes require a full 16-byte authentication tag", () => {
  const envelope = encryptPersistedSecret("tag-length-test", PURPOSE, OPTIONS);
  const parts = envelope.split(":");
  const tag = Buffer.from(parts[5], "base64url");
  assert.equal(tag.length, 16);
  for (const length of [0, 4, 8, 12, 13, 14, 15, 17]) {
    const modified = [...parts];
    modified[5] = (length < 16 ? tag.subarray(0, length) : Buffer.concat([tag, Buffer.from([0])])).toString("base64url");
    assert.throws(() => resolvePersistedSecret(modified.join(":"), PURPOSE, OPTIONS), PersistedSecretError);
  }
});
