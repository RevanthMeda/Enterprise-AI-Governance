export const dashboardViewIds = ["operations", "reviewer", "executive", "custom"] as const;
export type DashboardViewId = (typeof dashboardViewIds)[number];

export const dashboardWidgetIds = [
  "watchlist",
  "operatorPath",
  "stats",
  "health",
  "actionBoard",
  "riskMix",
  "controlCoverage",
  "recentSystems",
  "recentWorkflows",
  "setupGuide",
  "trends",
] as const;
export type DashboardWidgetId = (typeof dashboardWidgetIds)[number];

export const notificationPreferenceTypes = [
  "approval_assigned",
  "control_overdue",
  "workflow_status_changed",
  "evidence_requested",
  "high_risk_created",
  "system_modified",
  "automation_action",
] as const;
export type NotificationPreferenceType = (typeof notificationPreferenceTypes)[number];

export const notificationFeedModes = ["stream", "digest"] as const;
export type NotificationFeedMode = (typeof notificationFeedModes)[number];

export const accessibilityFontScales = ["default", "large", "xl"] as const;
export type AccessibilityFontScale = (typeof accessibilityFontScales)[number];

export const workspaceLocaleOptions = ["en-GB", "en-US", "fr-FR", "de-DE", "es-ES"] as const;
export type WorkspaceLocale = (typeof workspaceLocaleOptions)[number];

export type AccessibilityPreferenceState = {
  highContrast: boolean;
  reducedMotion: boolean;
  fontScale: AccessibilityFontScale;
};

export type NotificationPreferenceState = {
  priorityOnly: boolean;
  mutedTypes: NotificationPreferenceType[];
  feedMode: NotificationFeedMode;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferenceState = {
  priorityOnly: false,
  mutedTypes: [],
  feedMode: "stream",
};

export const DEFAULT_ACCESSIBILITY_PREFERENCES: AccessibilityPreferenceState = {
  highContrast: false,
  reducedMotion: false,
  fontScale: "default",
};

export const DEFAULT_WORKSPACE_LOCALE: WorkspaceLocale = "en-GB";

export const PRIORITY_NOTIFICATION_TYPES = new Set<NotificationPreferenceType>([
  "high_risk_created",
  "control_overdue",
  "approval_assigned",
  "evidence_requested",
  "automation_action",
]);

export const DEFAULT_GUIDED_MODE = true;

export const dashboardWidgetMeta: Record<
  DashboardWidgetId,
  {
    label: string;
    description: string;
  }
> = {
  watchlist: {
    label: "Immediate Attention",
    description: "Queue readiness, failed jobs, backlog, and high-scrutiny alerts.",
  },
  operatorPath: {
    label: "Suggested navigation path",
    description: "A guided route through registry, risk, approvals, and runtime operations.",
  },
  stats: {
    label: "Core stats",
    description: "Systems, approvals, compliance rate, and high-risk count at a glance.",
  },
  health: {
    label: "Platform health",
    description: "Readiness, queue pressure, and operational worker posture.",
  },
  actionBoard: {
    label: "Command shortcuts",
    description: "Fast links into review queues, controls, and audit actions.",
  },
  riskMix: {
    label: "Risk mix",
    description: "Portfolio distribution across unacceptable, high, limited, and minimal systems.",
  },
  controlCoverage: {
    label: "Control coverage",
    description: "Verified, implemented, and in-progress framework coverage.",
  },
  recentSystems: {
    label: "Recent systems",
    description: "Newest registered AI systems and current risk posture.",
  },
  recentWorkflows: {
    label: "Recent workflows",
    description: "Latest approval activity and current review state.",
  },
  setupGuide: {
    label: "Launch checklist",
    description: "Step-by-step setup guidance for registry, controls, approvals, and readiness.",
  },
  trends: {
    label: "Trendlines",
    description: "Risk, approvals, audit, and evidence movement over time.",
  },
};

export const dashboardViewPresets: Array<{
  id: Exclude<DashboardViewId, "custom">;
  label: string;
  description: string;
  widgets: DashboardWidgetId[];
}> = [
  {
    id: "operations",
    label: "Operations",
    description: "Balanced coverage for operators managing readiness, queue health, and live governance work.",
    widgets: [
      "watchlist",
      "operatorPath",
      "stats",
      "health",
      "actionBoard",
      "riskMix",
      "controlCoverage",
      "recentSystems",
      "recentWorkflows",
      "setupGuide",
      "trends",
    ],
  },
  {
    id: "reviewer",
    label: "Reviewer",
    description: "Tighter focus on action queues, recent workflow activity, and setup tasks.",
    widgets: [
      "watchlist",
      "stats",
      "health",
      "actionBoard",
      "recentWorkflows",
      "setupGuide",
    ],
  },
  {
    id: "executive",
    label: "Executive",
    description: "High-level posture, portfolio trends, and control/risk summaries for leadership review.",
    widgets: [
      "watchlist",
      "stats",
      "riskMix",
      "controlCoverage",
      "trends",
    ],
  },
];

export const notificationTypeLabels: Record<NotificationPreferenceType, string> = {
  approval_assigned: "Approval assignments",
  control_overdue: "Overdue controls",
  workflow_status_changed: "Workflow status changes",
  evidence_requested: "Evidence requests",
  high_risk_created: "High-risk incidents",
  system_modified: "System updates",
  automation_action: "Automation follow-up",
};

export function resolveDefaultDashboardView(role?: string | null): Exclude<DashboardViewId, "custom"> {
  switch (role) {
    case "reviewer":
      return "reviewer";
    case "owner":
    case "admin":
    case "cro":
    case "ciso":
    case "compliance_lead":
    case "auditor":
      return "executive";
    default:
      return "operations";
  }
}

export function getDashboardPreset(view: DashboardViewId | null | undefined) {
  return dashboardViewPresets.find((preset) => preset.id === view) ?? null;
}

export function sanitizeDashboardWidgets(input: unknown, fallback: DashboardWidgetId[]): DashboardWidgetId[] {
  const filtered = Array.isArray(input)
    ? input.filter((entry): entry is DashboardWidgetId => typeof entry === "string" && (dashboardWidgetIds as readonly string[]).includes(entry))
    : [];
  const deduped = Array.from(new Set(filtered)).slice(0, dashboardWidgetIds.length);
  return deduped.length > 0 ? deduped : fallback;
}

export function sanitizeNotificationPreferences(input: unknown): NotificationPreferenceState {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const mutedTypes = Array.isArray(record.mutedTypes)
    ? Array.from(
        new Set(
          record.mutedTypes.filter(
            (entry): entry is NotificationPreferenceType =>
              typeof entry === "string" && (notificationPreferenceTypes as readonly string[]).includes(entry),
          ),
        ),
      ).slice(0, notificationPreferenceTypes.length)
    : [];

  return {
    priorityOnly: record.priorityOnly === true,
    mutedTypes,
    feedMode:
      typeof record.feedMode === "string" && (notificationFeedModes as readonly string[]).includes(record.feedMode)
        ? (record.feedMode as NotificationFeedMode)
      : DEFAULT_NOTIFICATION_PREFERENCES.feedMode,
  };
}

export function sanitizeAccessibilityPreferences(input: unknown): AccessibilityPreferenceState {
  const record = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    highContrast: record.highContrast === true,
    reducedMotion: record.reducedMotion === true,
    fontScale:
      typeof record.fontScale === "string" && (accessibilityFontScales as readonly string[]).includes(record.fontScale)
        ? (record.fontScale as AccessibilityFontScale)
      : DEFAULT_ACCESSIBILITY_PREFERENCES.fontScale,
  };
}

export function sanitizeWorkspaceLocale(input: unknown): WorkspaceLocale {
  return typeof input === "string" && (workspaceLocaleOptions as readonly string[]).includes(input)
    ? (input as WorkspaceLocale)
    : DEFAULT_WORKSPACE_LOCALE;
}
