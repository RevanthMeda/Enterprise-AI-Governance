import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("billing never exposes editable defaults when subscription loading fails", async () => {
  const source = await readFile("client/src/pages/billing.tsx", "utf8");

  assert.match(source, /Subscription details could not be loaded/);
  assert.match(source, /Editing is disabled/);
  assert.match(source, /subscriptionUnavailable \? "—"/);
  assert.match(source, /disabled=\{updateMutation\.isPending \|\| !subscriptionQuery\.data\}/);
});

test("core governance dashboards expose retryable errors instead of false zero states", async () => {
  const expectations = [
    ["client/src/pages/dashboard.tsx", "Dashboard data could not be fully loaded"],
    ["client/src/pages/decision-trace.tsx", "Decision trace data could not be fully loaded"],
    ["client/src/pages/exit-readiness.tsx", "Exit readiness could not be loaded"],
    ["client/src/pages/analytics-center.tsx", "Analytics could not be loaded"],
    ["client/src/pages/governance-maturity.tsx", "Governance maturity could not be loaded"],
    ["client/src/pages/my-activity.tsx", "Activity data could not be loaded"],
    ["client/src/pages/telemetry-policy.tsx", "Telemetry policy could not be loaded"],
  ] as const;

  for (const [file, marker] of expectations) {
    const source = await readFile(file, "utf8");
    assert.match(source, /isError|Error/);
    assert.ok(source.includes(marker), `${file} is missing its explicit error state`);
    assert.match(source, /Retry/);
  }
});

test("new-organization guidance requires a successful summary response", async () => {
  const [decisionTrace, exitReadiness] = await Promise.all([
    readFile("client/src/pages/decision-trace.tsx", "utf8"),
    readFile("client/src/pages/exit-readiness.tsx", "utf8"),
  ]);

  assert.match(decisionTrace, /Boolean\(summaryQuery\.data\).*total === 0/);
  assert.match(exitReadiness, /Boolean\(readiness\).*summary\.workflows === 0/);
});
