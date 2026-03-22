import test from "node:test";
import assert from "node:assert/strict";
import { deriveLawPackGovernanceRequirements } from "../shared/law-packs";

test("global baseline keeps tier 1 routing and seven-year retention", () => {
  const requirements = deriveLawPackGovernanceRequirements(["global_baseline"]);

  assert.equal(requirements.minimumDecisionTier, "tier_1");
  assert.equal(requirements.committeeType, "technical_team");
  assert.equal(requirements.minimumRetentionYears, 7);
  assert.deepEqual(requirements.requiredApproverRoles, ["technical_team"]);
});

test("EU finance law packs elevate routing, reviewers, and retention", () => {
  const requirements = deriveLawPackGovernanceRequirements([
    "global_baseline",
    "eu_core",
    "eu_finance",
  ]);

  assert.equal(requirements.minimumDecisionTier, "tier_2");
  assert.equal(requirements.committeeType, "operations_committee");
  assert.equal(requirements.minimumRetentionYears, 10);
  assert.ok(requirements.requiredApproverRoles.includes("operations_committee"));
  assert.ok(requirements.requiredApproverRoles.includes("compliance_lead"));
  assert.ok(requirements.requiredApproverRoles.includes("ciso"));
  assert.ok(requirements.preferredReviewerRoles.includes("cro"));
  assert.ok(
    requirements.guidanceNotes.some((note) => note.includes("Financial-services law packs")),
  );
});

test("India finance law packs preserve resilience and accountability overlays", () => {
  const requirements = deriveLawPackGovernanceRequirements([
    "global_baseline",
    "india_core",
    "india_finance",
  ]);

  assert.equal(requirements.minimumDecisionTier, "tier_2");
  assert.equal(requirements.committeeType, "operations_committee");
  assert.ok(requirements.requiredApproverRoles.includes("ciso"));
  assert.ok(
    requirements.guidanceNotes.some((note) => note.includes("India-facing systems")),
  );
  assert.ok(
    requirements.guidanceNotes.some((note) => note.includes("Operational-resilience overlays")),
  );
});
