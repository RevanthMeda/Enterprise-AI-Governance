export const governanceAutomationRunModes = ["manual", "assistive", "auto"] as const;
export type GovernanceAutomationRunMode = (typeof governanceAutomationRunModes)[number];

export const governanceAutomationRuleKeys = [
  "incident-owner-notify",
  "incident-sla-escalation",
  "workflow-reviewer-reminder",
] as const;
export type GovernanceAutomationRuleKey = (typeof governanceAutomationRuleKeys)[number];

export type GovernanceAutomationRuleConfig = {
  key: GovernanceAutomationRuleKey;
  enabled: boolean;
  minSeverity: "critical" | "high" | "medium";
  staleDays: number;
  description: string;
};

export type GovernanceAutomationConfig = {
  runMode: GovernanceAutomationRunMode;
  rules: GovernanceAutomationRuleConfig[];
};

export const DEFAULT_GOVERNANCE_AUTOMATION_CONFIG: GovernanceAutomationConfig = {
  runMode: "assistive",
  rules: [
    {
      key: "incident-owner-notify",
      enabled: true,
      minSeverity: "high",
      staleDays: 0,
      description: "Notify the assigned or inferred owner when high-severity incidents stay open.",
    },
    {
      key: "incident-sla-escalation",
      enabled: true,
      minSeverity: "high",
      staleDays: 0,
      description: "Escalate incidents that have breached their containment target.",
    },
    {
      key: "workflow-reviewer-reminder",
      enabled: true,
      minSeverity: "medium",
      staleDays: 3,
      description: "Remind reviewers when workflows remain pending or in review for several days.",
    },
  ],
};

export const governanceAutomationRuleLabels: Record<GovernanceAutomationRuleKey, string> = {
  "incident-owner-notify": "Incident owner notify",
  "incident-sla-escalation": "Incident SLA escalation",
  "workflow-reviewer-reminder": "Workflow reviewer reminder",
};

export function sanitizeGovernanceAutomationConfig(input: unknown): GovernanceAutomationConfig {
  const record = input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
  const rawRules = Array.isArray(record.rules) ? record.rules : [];

  const rules = rawRules
    .map((entry) => {
      const rule = entry && typeof entry === "object" && !Array.isArray(entry) ? (entry as Record<string, unknown>) : null;
      if (!rule) {
        return null;
      }

      const key =
        typeof rule.key === "string" && (governanceAutomationRuleKeys as readonly string[]).includes(rule.key)
          ? (rule.key as GovernanceAutomationRuleKey)
          : null;
      if (!key) {
        return null;
      }

      const minSeverity =
        rule.minSeverity === "critical" || rule.minSeverity === "high" || rule.minSeverity === "medium"
          ? rule.minSeverity
          : "high";
      const staleDays =
        typeof rule.staleDays === "number" && Number.isFinite(rule.staleDays)
          ? Math.max(0, Math.min(30, Math.round(rule.staleDays)))
          : 0;
      const description =
        typeof rule.description === "string" && rule.description.trim().length > 0
          ? rule.description.trim().slice(0, 200)
          : DEFAULT_GOVERNANCE_AUTOMATION_CONFIG.rules.find((candidate) => candidate.key === key)?.description ?? "";

      return {
        key,
        enabled: rule.enabled !== false,
        minSeverity,
        staleDays,
        description,
      } satisfies GovernanceAutomationRuleConfig;
    })
    .filter((entry): entry is GovernanceAutomationRuleConfig => entry !== null);

  const mergedRules = governanceAutomationRuleKeys.map(
    (key) => rules.find((rule) => rule.key === key) ?? DEFAULT_GOVERNANCE_AUTOMATION_CONFIG.rules.find((rule) => rule.key === key)!,
  );

  return {
    runMode:
      typeof record.runMode === "string" && (governanceAutomationRunModes as readonly string[]).includes(record.runMode)
        ? (record.runMode as GovernanceAutomationRunMode)
        : DEFAULT_GOVERNANCE_AUTOMATION_CONFIG.runMode,
    rules: mergedRules,
  };
}
