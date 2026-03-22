import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAnalyticsReportPlanId,
  sanitizeAnalyticsReportBuilderConfig,
} from "../shared/analytics-report-builder";

test("analytics report builder falls back to defaults when plans are missing", () => {
  const result = sanitizeAnalyticsReportBuilderConfig(null);
  assert.ok(result.plans.length >= 3);
  assert.equal(result.defaultPlanId, result.plans[0]?.id ?? null);
});

test("analytics report builder keeps only valid plans and sections", () => {
  const result = sanitizeAnalyticsReportBuilderConfig({
    defaultPlanId: "bad",
    plans: [
      {
        id: "board-pack",
        name: "Board pack",
        description: "Monthly board report",
        presetId: "executive_snapshot",
        format: "pdf",
        cadence: "monthly",
        sections: ["summary", "highlights", "trends", "unknown"],
      },
      {
        id: "",
        name: "",
        presetId: "executive_snapshot",
        format: "pdf",
        cadence: "monthly",
        sections: [],
      },
    ],
  });

  assert.equal(result.plans.length, 1);
  assert.equal(result.defaultPlanId, "board-pack");
  assert.deepEqual(result.plans[0].sections, ["summary", "highlights", "trends"]);
});

test("report plan ids are normalized for safe persistence", () => {
  assert.equal(buildAnalyticsReportPlanId("Board / Monthly Pack"), "board-monthly-pack");
});
