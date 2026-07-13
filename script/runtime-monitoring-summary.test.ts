import test from "node:test";
import assert from "node:assert/strict";
import {
  isRuntimeEvaluationTargetAvailable,
  normalizeRuntimeStringArray,
  normalizeRuntimeThresholdLabels,
  resolveRuntimeEvaluationTarget,
  resolveRuntimeMonitoringCounters,
} from "../client/src/lib/runtime-monitoring-summary";

test("runtime incidents use the active incident queue instead of recent telemetry escalations", () => {
  const counters = resolveRuntimeMonitoringCounters(
    { total: 0, thresholdBreaches: 0, blocked: 0, escalatedIncidents: 0, windowDays: 30 },
    { active: 6, open: 5 },
  );

  assert.equal(counters.activeIncidents, 6);
  assert.equal(counters.recentEscalatedIncidents, 0);
});

test("runtime incidents remain compatible with an older summary that only returns open", () => {
  const counters = resolveRuntimeMonitoringCounters(
    { events: 12, breaches: 4, blocked: 2 },
    { open: 7 },
  );

  assert.deepEqual(counters, {
    totalEvents: 12,
    thresholdBreaches: 4,
    blockedEvents: 2,
    activeIncidents: 7,
    recentEscalatedIncidents: 0,
    telemetryWindowDays: 30,
  });
});

test("runtime counters reject invalid and negative values", () => {
  const counters = resolveRuntimeMonitoringCounters(
    { total: -1, thresholdBreaches: "not-a-number", blocked: Number.NaN, windowDays: 0 },
    { active: -4 },
  );

  assert.equal(counters.totalEvents, 0);
  assert.equal(counters.thresholdBreaches, 0);
  assert.equal(counters.blockedEvents, 0);
  assert.equal(counters.activeIncidents, 0);
  assert.equal(counters.telemetryWindowDays, 30);
});

test("runtime evaluation target uses only an explicit request or configured adapter default", () => {
  const available = ["collections", "invoice"];

  assert.equal(resolveRuntimeEvaluationTarget("collections", "invoice", available), "collections");
  assert.equal(resolveRuntimeEvaluationTarget("missing", "invoice", available), "invoice");
  assert.equal(resolveRuntimeEvaluationTarget("missing", "also-missing", available), "");
  assert.equal(resolveRuntimeEvaluationTarget("", "", available), "");
});

test("runtime evaluation target availability clears deleted or old-organization systems", () => {
  const available = ["collections", "invoice"];

  assert.equal(isRuntimeEvaluationTargetAvailable("collections", available), true);
  assert.equal(isRuntimeEvaluationTargetAvailable("deleted-system", available), false);
  assert.equal(isRuntimeEvaluationTargetAvailable("", available), true);
  assert.equal(isRuntimeEvaluationTargetAvailable(null, available), true);
});

test("runtime response string arrays discard malformed elements before formatting", () => {
  assert.deepEqual(
    normalizeRuntimeStringArray([" restricted_prompt ", null, 42, {}, "", "reason_code"]),
    ["restricted_prompt", "reason_code"],
  );
  assert.deepEqual(normalizeRuntimeStringArray({ reasonCode: "not-an-array" }), []);
  assert.deepEqual(normalizeRuntimeStringArray(undefined), []);
});

test("runtime threshold arrays accept supported labels and reject malformed objects", () => {
  assert.deepEqual(
    normalizeRuntimeThresholdLabels([
      " direct_threshold ",
      { type: "typed_threshold" },
      { message: "message threshold" },
      { type: { nested: "unsafe" }, message: 42 },
      null,
    ]),
    ["direct_threshold", "typed_threshold", "message threshold"],
  );
});
