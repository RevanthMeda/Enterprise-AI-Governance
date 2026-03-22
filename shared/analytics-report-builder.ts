import { analyticsReportPresetIds, type AnalyticsReportPresetId } from "./analytics-overview";

export const analyticsReportFormats = ["csv", "pdf"] as const;
export type AnalyticsReportFormat = (typeof analyticsReportFormats)[number];

export const analyticsReportCadences = ["manual", "weekly", "monthly"] as const;
export type AnalyticsReportCadence = (typeof analyticsReportCadences)[number];

export const analyticsReportSectionIds = [
  "summary",
  "highlights",
  "trends",
  "risk_mix",
  "workflow_mix",
  "incident_mix",
  "control_mix",
] as const;
export type AnalyticsReportSectionId = (typeof analyticsReportSectionIds)[number];

export type AnalyticsReportPlan = {
  id: string;
  name: string;
  description: string;
  presetId: AnalyticsReportPresetId;
  format: AnalyticsReportFormat;
  cadence: AnalyticsReportCadence;
  sections: AnalyticsReportSectionId[];
  lastRunAt: string | null;
};

export type AnalyticsReportBuilderConfig = {
  defaultPlanId: string | null;
  plans: AnalyticsReportPlan[];
};

export const analyticsReportSectionLabels: Record<AnalyticsReportSectionId, string> = {
  summary: "Summary metrics",
  highlights: "Operator highlights",
  trends: "Trendlines",
  risk_mix: "Risk mix",
  workflow_mix: "Workflow mix",
  incident_mix: "Incident severity mix",
  control_mix: "Control coverage mix",
};

export const DEFAULT_ANALYTICS_REPORT_BUILDER_CONFIG: AnalyticsReportBuilderConfig = {
  defaultPlanId: "executive-snapshot",
  plans: [
    {
      id: "executive-snapshot",
      name: "Executive snapshot",
      description: "Board-level posture summary with top-line governance metrics.",
      presetId: "executive_snapshot",
      format: "pdf",
      cadence: "monthly",
      sections: ["summary", "highlights", "risk_mix", "control_mix"],
      lastRunAt: null,
    },
    {
      id: "incident-operations",
      name: "Incident operations review",
      description: "Reviewer pack focused on queue health, incidents, and trends.",
      presetId: "incident_ops_review",
      format: "csv",
      cadence: "weekly",
      sections: ["summary", "trends", "incident_mix", "workflow_mix"],
      lastRunAt: null,
    },
    {
      id: "compliance-snapshot",
      name: "Compliance snapshot",
      description: "Control coverage and evidence posture for compliance leads.",
      presetId: "compliance_snapshot",
      format: "pdf",
      cadence: "monthly",
      sections: ["summary", "highlights", "control_mix", "risk_mix"],
      lastRunAt: null,
    },
  ],
};

function normalizePlanId(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function buildAnalyticsReportPlanId(name: string, fallback = "custom-report") {
  const normalized = normalizePlanId(name);
  return normalized.length > 0 ? normalized : fallback;
}

export function sanitizeAnalyticsReportBuilderConfig(input: unknown): AnalyticsReportBuilderConfig {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const rawPlans = Array.isArray(record.plans) ? record.plans : [];

  const plans = rawPlans
    .map((entry) => {
      const plan = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
      if (!plan) {
        return null;
      }

      const id = typeof plan.id === "string" ? buildAnalyticsReportPlanId(plan.id, "") : "";
      const name = typeof plan.name === "string" ? plan.name.trim().slice(0, 80) : "";
      const description = typeof plan.description === "string" ? plan.description.trim().slice(0, 240) : "";
      const presetId =
        typeof plan.presetId === "string" && (analyticsReportPresetIds as readonly string[]).includes(plan.presetId)
          ? (plan.presetId as AnalyticsReportPresetId)
          : "executive_snapshot";
      const format =
        typeof plan.format === "string" && (analyticsReportFormats as readonly string[]).includes(plan.format)
          ? (plan.format as AnalyticsReportFormat)
          : "pdf";
      const cadence =
        typeof plan.cadence === "string" && (analyticsReportCadences as readonly string[]).includes(plan.cadence)
          ? (plan.cadence as AnalyticsReportCadence)
          : "manual";
      const sections = Array.isArray(plan.sections)
        ? Array.from(
            new Set(
              plan.sections.filter(
                (value): value is AnalyticsReportSectionId =>
                  typeof value === "string" && (analyticsReportSectionIds as readonly string[]).includes(value),
              ),
            ),
          )
        : [];
      const lastRunAt = typeof plan.lastRunAt === "string" ? plan.lastRunAt : null;

      if (!id || !name || sections.length === 0) {
        return null;
      }

      return {
        id,
        name,
        description,
        presetId,
        format,
        cadence,
        sections,
        lastRunAt,
      } satisfies AnalyticsReportPlan;
    })
    .filter((entry): entry is AnalyticsReportPlan => entry !== null)
    .slice(0, 12);

  if (plans.length === 0) {
    return DEFAULT_ANALYTICS_REPORT_BUILDER_CONFIG;
  }

  const defaultPlanId =
    typeof record.defaultPlanId === "string" && plans.some((plan) => plan.id === record.defaultPlanId)
      ? record.defaultPlanId
      : plans[0]?.id ?? null;

  return {
    defaultPlanId,
    plans,
  };
}
