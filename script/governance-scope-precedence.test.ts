import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffectiveGovernanceScope } from "../shared/governance-scope";

const system = {
  id: "sys-1",
  name: "Collections Hardship Assistant",
  department: "Customer Operations",
  purpose: "Mortgage hardship support",
  legalProfile: "eu",
  lawPackIds: ["global_baseline", "eu_core", "eu_finance"],
};

test("agent workflow override wins over workflow and system defaults", () => {
  const result = resolveEffectiveGovernanceScope({
    system,
    workflow: {
      legalProfile: "uk",
      lawPackIds: ["global_baseline", "uk_core"],
    },
    agentWorkflowProfile: {
      legalProfile: "india",
      lawPackIds: ["global_baseline", "india_core", "india_finance"],
    },
    agentSystemProfile: {
      legalProfile: "us",
      lawPackIds: ["global_baseline", "us_core"],
    },
  });

  assert.equal(result.source, "agent_workflow");
  assert.deepEqual(result.lawPackIdsApplied, ["global_baseline", "india_core", "india_finance"]);
  assert.equal(result.legalProfileApplied, "india");
});

test("agent system override beats inherited system scope when workflow has no explicit packs", () => {
  const result = resolveEffectiveGovernanceScope({
    system,
    workflow: {},
    agentSystemProfile: {
      legalProfile: "us",
      lawPackIds: ["global_baseline", "us_core", "us_finance"],
    },
  });

  assert.equal(result.source, "agent_system");
  assert.deepEqual(result.lawPackIdsApplied, ["global_baseline", "us_core", "us_finance"]);
  assert.equal(result.legalProfileApplied, "us");
});

test("workflow override applies when no agent override exists", () => {
  const result = resolveEffectiveGovernanceScope({
    system,
    workflow: {
      legalProfile: "uk",
      lawPackIds: ["global_baseline", "uk_core", "uk_finance"],
    },
  });

  assert.equal(result.source, "workflow");
  assert.deepEqual(result.lawPackIdsApplied, ["global_baseline", "uk_core", "uk_finance"]);
  assert.equal(result.legalProfileApplied, "uk");
});
