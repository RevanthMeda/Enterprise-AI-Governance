import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeGovernanceAutomationConfig } from "../shared/governance-automation-builder";

test("governance automation config restores defaults when unset", () => {
  const result = sanitizeGovernanceAutomationConfig(null);
  assert.equal(result.rules.length, 3);
  assert.equal(result.runMode, "assistive");
});

test("governance automation config clamps stale days and preserves known rules", () => {
  const result = sanitizeGovernanceAutomationConfig({
    runMode: "auto",
    rules: [
      {
        key: "workflow-reviewer-reminder",
        enabled: true,
        minSeverity: "medium",
        staleDays: 99,
        description: "Custom workflow reminder",
      },
    ],
  });

  const workflowRule = result.rules.find((rule) => rule.key === "workflow-reviewer-reminder");
  assert.equal(result.runMode, "auto");
  assert.equal(workflowRule?.staleDays, 30);
  assert.ok(result.rules.some((rule) => rule.key === "incident-owner-notify"));
});
