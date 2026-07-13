import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateIncidentPriority,
  summarizeIncidentPriorities,
} from "../shared/incident-prioritization";

test("scores breached critical incidents with no owner as urgent", () => {
  const result = evaluateIncidentPriority(
    {
      category: "security",
      severity: "critical",
      status: "open",
      owner: null,
      detectedAt: "2026-03-20T08:00:00.000Z",
      dueAt: "2026-03-20T12:00:00.000Z",
      playbook: {
        policyCategories: ["GOVERNANCE_TAMPERING"],
      },
    },
    new Date("2026-03-22T08:00:00.000Z"),
  );

  assert.equal(result.level, "urgent");
  assert.equal(result.breached, true);
  assert.equal(result.needsAssignment, true);
  assert.ok(result.score >= 95);
});

test("keeps low-severity resolved incidents in monitor priority", () => {
  const result = evaluateIncidentPriority(
    {
      category: "reliability",
      severity: "low",
      status: "resolved",
      owner: "Queue owner",
      detectedAt: "2026-03-22T06:00:00.000Z",
      dueAt: "2026-03-23T06:00:00.000Z",
    },
    new Date("2026-03-22T08:00:00.000Z"),
  );

  assert.equal(result.level, "monitor");
  assert.equal(result.breached, false);
  assert.equal(result.needsAssignment, false);
});

test("summarizes incident queues into urgent and unassigned buckets", () => {
  const summary = summarizeIncidentPriorities(
    [
      {
        category: "privacy",
        severity: "high",
        status: "open",
        owner: null,
        detectedAt: "2026-03-22T00:00:00.000Z",
        dueAt: "2026-03-22T03:00:00.000Z",
      },
      {
        category: "safety",
        severity: "medium",
        status: "contained",
        owner: "Reviewer One",
        detectedAt: "2026-03-22T06:00:00.000Z",
        dueAt: "2026-03-23T06:00:00.000Z",
      },
      {
        category: "reliability",
        severity: "low",
        status: "resolved",
        owner: "Reviewer Two",
        detectedAt: "2026-03-22T06:00:00.000Z",
      },
    ],
    new Date("2026-03-22T08:00:00.000Z"),
  );

  assert.equal(summary.unassignedActive, 1);
  assert.equal(summary.active, 2);
  assert.ok(summary.urgent + summary.highPriority + summary.normalPriority + summary.monitor === 3);
});
