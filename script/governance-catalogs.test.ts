import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeAuthoritativeFacts,
  mergeSourceReferences,
  normalizeApprovedSourceCatalog,
} from "../shared/governance-catalogs";

test("retrieve approved sources prefers authority-aligned catalog entries", () => {
  const refs = mergeSourceReferences({
    promptText: "Give me official guidance wording from the Central Bank of Ireland about mortgage arrears.",
    systemCatalog: [
      {
        label: "Central Bank of Ireland Mortgage Arrears Code",
        authority: "Central Bank of Ireland",
        citation: "Code of Conduct on Mortgage Arrears",
      },
      {
        label: "Internal servicing style guide",
        tags: ["servicing"],
      },
    ],
  });

  assert.equal(refs.length > 0, true);
  assert.equal(refs[0]?.includes("Central Bank of Ireland Mortgage Arrears Code"), true);
});

test("normalize approved source catalog drops malformed entries", () => {
  const normalized = normalizeApprovedSourceCatalog([
    { label: "Valid source", authority: "FCA" },
    { authority: "Missing label" },
    "Simple fallback source",
  ]);

  assert.deepEqual(normalized.map((entry) => entry.label), ["Valid source", "Simple fallback source"]);
});

test("merge authoritative facts prefers explicit over workflow over system", () => {
  const merged = mergeAuthoritativeFacts({
    systemCatalog: [
      { key: "documentsReceived", value: false, source: "System" },
      { key: "status", value: "Docs requested", source: "System" },
    ],
    workflowCatalog: [
      { key: "documentsReceived", value: true, source: "Workflow" },
    ],
    explicitFacts: {
      documentsReceived: {
        value: false,
        source: "Turn override",
      },
    },
  });

  assert.equal(merged.documentsReceived?.value, false);
  assert.equal(merged.documentsReceived?.source, "Turn override");
  assert.equal(merged.status?.value, "Docs requested");
});
