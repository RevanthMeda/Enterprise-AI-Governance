import test from "node:test";
import assert from "node:assert/strict";
import { deriveTelemetryPolicyAssistFromIntent } from "../server/services/telemetryPolicyAdvisorService";

const basePolicy = {
  shadowModeLabel: "stricter-preview",
  restrictedPromptPatterns: [],
};

test("policy advisor turns stricter customer-support intent into a blocking patch", async () => {
  const result = deriveTelemetryPolicyAssistFromIntent({
    policy: basePolicy,
    riskLevel: "high",
    purpose: "Customer support assistant",
    intent:
      "For this customer support system, block PII and prompt injection attempts, notify on warnings, and test stricter rules in shadow mode first.",
    resolvePresetId: ({ riskLevel }) => (riskLevel === "high" ? "high_scrutiny" : "balanced"),
  });

  assert.ok(result.matchedIntents.includes("stricter_runtime"));
  assert.ok(result.matchedIntents.includes("pii_protection"));
  assert.ok(result.matchedIntents.includes("safety_guardrails"));
  assert.ok(result.matchedIntents.includes("warning_notifications"));
  assert.ok(result.matchedIntents.includes("shadow_preview"));
  assert.equal(result.suggestedPatch.blockOnPii, true);
  assert.equal(result.suggestedPatch.notifyOnWarning, true);
  assert.equal(result.suggestedPatch.shadowModeEnabled, true);
});

test("policy advisor recognizes monitor-only wording and warns about weaker posture", async () => {
  const result = deriveTelemetryPolicyAssistFromIntent({
    policy: basePolicy,
    riskLevel: "limited",
    purpose: "Internal analytics",
    intent: "Keep this in monitor only mode and do not block yet.",
    resolvePresetId: () => "balanced",
  });

  assert.ok(result.matchedIntents.includes("monitor_only"));
  assert.equal(result.suggestedPatch.enforceBlocking, false);
  assert.ok(result.warnings.length > 0);
});
