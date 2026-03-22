import assert from "node:assert/strict";
import test from "node:test";
import { buildIncidentResolutionSuggestion } from "../shared/incident-resolution-suggestions";

test("critical governed incidents recommend contain and escalate", () => {
  const suggestion = buildIncidentResolutionSuggestion({
    incidentId: "inc-1",
    title: "Prompt exfiltration",
    category: "security",
    severity: "critical",
    status: "open",
    description: "Prompt exfiltration attempt detected.",
    owner: null,
    playbook: {
      reasonCodes: ["PHISHING"],
      policyCategories: ["GOVERNANCE_TAMPERING"],
      threatIntelligence: {
        matches: [{ title: "Prompt or policy exfiltration attempt" }],
      },
      reviewRelease: { required: true, status: "pending" },
    },
    priority: {
      score: 98,
      level: "urgent",
      reasons: ["Critical severity"],
      breached: true,
      needsAssignment: true,
      active: true,
      ageHours: 12,
      timeToDueHours: -1,
    },
  });

  assert.equal(suggestion.recommendation, "contain_and_escalate");
  assert.equal(suggestion.suggestedStatus, "contained");
  assert.equal(suggestion.shouldAssignOwner, true);
  assert.equal(suggestion.confidence, "high");
});

test("verification gates recommend review before release", () => {
  const suggestion = buildIncidentResolutionSuggestion({
    incidentId: "inc-2",
    title: "Authority wording review",
    category: "compliance",
    severity: "high",
    status: "contained",
    description: "Unsourced regulator wording captured.",
    owner: "Janet Reviewer",
    playbook: {
      reviewRelease: { required: true, status: "pending" },
      sourceAttributionVerifier: { requiresVerification: true },
      factProvenanceVerifier: { requiresReview: true },
    },
    priority: {
      score: 70,
      level: "high",
      reasons: ["Open incident"],
      breached: false,
      needsAssignment: false,
      active: true,
      ageHours: 2,
      timeToDueHours: 3,
    },
  });

  assert.equal(suggestion.recommendation, "review_before_release");
  assert.equal(suggestion.suggestedStatus, null);
  assert.equal(suggestion.shouldEscalate, true);
});

test("contained incidents without blockers are ready for controlled resolution", () => {
  const suggestion = buildIncidentResolutionSuggestion({
    incidentId: "inc-3",
    title: "Reliability drift",
    category: "reliability",
    severity: "medium",
    status: "contained",
    description: "Drift event has been contained and verified.",
    owner: "Case Owner",
    playbook: {
      thresholdBreaches: ["drift_warning"],
    },
    priority: {
      score: 40,
      level: "normal",
      reasons: ["Containment in progress"],
      breached: false,
      needsAssignment: false,
      active: true,
      ageHours: 4,
      timeToDueHours: 10,
    },
  });

  assert.equal(suggestion.recommendation, "resolve_with_follow_up");
  assert.equal(suggestion.suggestedStatus, "resolved");
});
