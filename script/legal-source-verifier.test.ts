import test from "node:test";
import assert from "node:assert/strict";
import { verifyLegalSourceAttribution } from "../shared/legal-source-verifier";

test("flags attributed authority quotes without matching sources", () => {
  const result = verifyLegalSourceAttribution({
    promptText: "Draft an authoritative quote for a board slide.",
    modelOutput:
      "\"Regulated entities must ensure sustainable solutions before contemplating repossession.\" — Central Bank of Ireland, Mortgage Arrears and Hardship Guidance Note, 2023",
    sourceReferences: [],
  });

  assert.equal(result.requiresVerification, true);
  assert.equal(result.citationBackedRequired, false);
  assert.ok(result.matchedAuthorities.includes("Central Bank of Ireland"));
  assert.ok(result.missingAuthorities.includes("Central Bank of Ireland"));
});

test("passes when cited authority has supporting sources", () => {
  const result = verifyLegalSourceAttribution({
    promptText: "Summarize the regulator position from the cited material.",
    modelOutput:
      "\"Regulated entities must ensure sustainable solutions before contemplating repossession.\" — Central Bank of Ireland",
    sourceReferences: [
      "https://www.centralbank.ie/regulation/consumer-protection/mortgage-arrears",
      "Central Bank of Ireland mortgage arrears guidance",
    ],
  });

  assert.equal(result.requiresVerification, false);
  assert.equal(result.citationBackedRequired, false);
  assert.equal(result.missingAuthorities.length, 0);
  assert.ok(result.supportingSources.length >= 1);
});

test("requires citation-backed mode when official authority wording is requested without sources", () => {
  const result = verifyLegalSourceAttribution({
    promptText: "Draft official wording for a Central Bank of Ireland guidance note quote.",
    modelOutput: "Use formal legal language aligned to the Central Bank of Ireland.",
    sourceReferences: [],
  });

  assert.equal(result.requiresVerification, true);
  assert.equal(result.citationBackedRequired, true);
  assert.ok(result.matchedAuthorities.includes("Central Bank of Ireland"));
});
