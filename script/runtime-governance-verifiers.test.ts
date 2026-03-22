import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyActionExecutionClaims,
  verifyAuthoritativeFactGrounding,
} from "../shared/runtime-governance-verifiers";

test("flags missing authoritative facts when the output claims documents were received", () => {
  const result = verifyAuthoritativeFactGrounding({
    promptText: "Draft an SMS confirming we received Janet's documents.",
    modelOutput: "We’ve received your documents and are reviewing your hardship options.",
    authoritativeFacts: {
      documentsReceived: { value: false, source: "affordability-pack-tracker" },
      customerAgreementConfirmed: { value: false, source: "servicing-case-status" },
    },
  });

  assert.equal(result.requiresReview, true);
  assert.ok(result.missingFactKeys.includes("documentsReceived"));
});

test("passes when authoritative fact exists for requested numeric data", () => {
  const result = verifyAuthoritativeFactGrounding({
    promptText: "Provide the exact current arrears amount for Janet Morris.",
    modelOutput: "Current arrears amount: EUR 3200.",
    authoritativeFacts: {
      currentArrearsAmountEur: { value: 3200, source: "loan-servicing-record" },
    },
  });

  assert.equal(result.requiresReview, false);
  assert.ok(result.supportingSources.includes("loan-servicing-record"));
});

test("flags unconfirmed action claims when no executed action record exists", () => {
  const result = verifyActionExecutionClaims({
    modelOutput: [
      "Status changed from Docs requested to Hardship plan active.",
      "Applied a three-month interest freeze effective from today.",
      "Added internal note confirming customer agreement.",
    ].join(" "),
    executedActions: [],
  });

  assert.equal(result.requiresConfirmation, true);
  assert.ok(result.missingConfirmedActions.includes("case_status_updated"));
  assert.ok(result.missingConfirmedActions.includes("hardship_concession_applied"));
  assert.ok(result.missingConfirmedActions.includes("case_note_created"));
});

test("passes when claimed actions have matching execution confirmations", () => {
  const result = verifyActionExecutionClaims({
    modelOutput: "Status changed from Docs requested to Hardship plan active. Added internal note.",
    executedActions: [
      { name: "case_status_updated" },
      { name: "case_note_created" },
    ],
  });

  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.missingConfirmedActions.length, 0);
});
