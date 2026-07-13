import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertCredentialOriginPreserved,
  normalizeCredentialOrigin,
} from "../server/credential-origin";

test("preserved credentials cannot be rebound to a different origin", () => {
  assert.equal(normalizeCredentialOrigin("https://jira.example.test/path"), "https://jira.example.test");
  assert.doesNotThrow(() =>
    assertCredentialOriginPreserved({
      label: "Connector",
      currentUrl: "https://hooks.example.test/v1",
      nextUrl: "https://hooks.example.test/v2",
      hasCurrentCredential: true,
    }),
  );
  assert.throws(
    () =>
      assertCredentialOriginPreserved({
        label: "Connector",
        currentUrl: "https://hooks.example.test/v1",
        nextUrl: "https://attacker.example.test/collect",
        hasCurrentCredential: true,
      }),
    /must be re-entered or cleared/i,
  );
  assert.doesNotThrow(() =>
    assertCredentialOriginPreserved({
      label: "Connector",
      currentUrl: "https://hooks.example.test/v1",
      nextUrl: "https://attacker.example.test/collect",
      hasCurrentCredential: true,
      replacementCredential: "caller-supplied-new-secret",
    }),
  );
});

test("all configurable integration services enforce destination binding", async () => {
  for (const relativePath of [
    "../server/services/jiraService.ts",
    "../server/services/integrationConnectorService.ts",
    "../server/services/threatIntelligenceService.ts",
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /assertCredentialOriginPreserved/);
  }

  const threatSource = await readFile(
    new URL("../server/services/threatIntelligenceService.ts", import.meta.url),
    "utf8",
  );
  assert.match(threatSource, /const feedToken = configuredFeedUrl \? configuredToken : environmentToken/);
  assert.doesNotMatch(threatSource, /configuredToken \?\? normalizeOptionalString\(process\.env\.THREAT_INTEL_FEED_TOKEN\)/);
});
