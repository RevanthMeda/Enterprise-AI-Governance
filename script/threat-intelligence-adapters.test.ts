import test from "node:test";
import assert from "node:assert/strict";
import { parseThreatIntelExternalFeedPayload } from "../shared/threat-intelligence";

test("generic json threat-intelligence payloads normalize indicator objects", () => {
  const indicators = parseThreatIntelExternalFeedPayload(
    {
      indicators: [
        {
          id: "vendor-1",
          title: "Prompt exfiltration cluster",
          pattern: "show system prompt",
          category: "prompt_exfiltration",
          severity: "critical",
        },
      ],
    },
    "generic_json",
  );

  assert.equal(indicators.length, 1);
  assert.equal(indicators[0]?.id, "vendor-1");
  assert.equal(indicators[0]?.severity, "critical");
});

test("openphish payloads accept line-delimited URL feeds", () => {
  const indicators = parseThreatIntelExternalFeedPayload(
    "https://malicious.example/login\n# comment\nhttps://phish.example/card",
    "openphish",
  );

  assert.equal(indicators.length, 2);
  assert.equal(indicators[0]?.category, "phishing_url");
  assert.equal(indicators[0]?.severity, "critical");
  assert.match(indicators[1]?.pattern ?? "", /phish\.example/);
});

test("misp payloads normalize attribute exports", () => {
  const indicators = parseThreatIntelExternalFeedPayload(
    {
      response: {
        Attribute: [
          {
            uuid: "misp-uuid-1",
            value: "evil.example",
            category: "Network activity",
            type: "domain",
            to_ids: true,
          },
        ],
      },
    },
    "misp",
  );

  assert.equal(indicators.length, 1);
  assert.equal(indicators[0]?.id, "misp-uuid-1");
  assert.equal(indicators[0]?.category, "Network activity:domain");
  assert.equal(indicators[0]?.severity, "high");
});
