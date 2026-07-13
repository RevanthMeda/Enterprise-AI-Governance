export const incidentPriorityLevels = ["urgent", "high", "normal", "monitor"] as const;
export type IncidentPriorityLevel = (typeof incidentPriorityLevels)[number];

export type IncidentPrioritySnapshot = {
  score: number;
  level: IncidentPriorityLevel;
  reasons: string[];
  breached: boolean;
  needsAssignment: boolean;
  active: boolean;
  ageHours: number;
  timeToDueHours: number | null;
};

export type IncidentPriorityInput = {
  category: string;
  severity: string;
  status: string;
  owner?: string | null;
  dueAt?: string | Date | null;
  detectedAt?: string | Date | null;
  playbook?: unknown;
};

export type IncidentPrioritySummary = {
  active: number;
  urgent: number;
  highPriority: number;
  normalPriority: number;
  monitor: number;
  unassignedActive: number;
};

function getObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function toDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function roundHours(value: number) {
  return Math.round(value * 10) / 10;
}

export function evaluateIncidentPriority(input: IncidentPriorityInput, now = new Date()): IncidentPrioritySnapshot {
  let score = 0;
  const reasons: string[] = [];
  const active = input.status === "open" || input.status === "contained";
  const needsAssignment = active && !(input.owner && input.owner.trim());
  const dueAt = toDate(input.dueAt);
  const detectedAt = toDate(input.detectedAt);
  const timeToDueHours = dueAt ? (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
  const breached = active && timeToDueHours !== null && timeToDueHours < 0;
  const ageHours = detectedAt ? Math.max(0, (now.getTime() - detectedAt.getTime()) / (1000 * 60 * 60)) : 0;
  const playbook = getObjectRecord(input.playbook);
  const policyCategories = getStringArray(playbook?.policyCategories);
  const reasonCodes = getStringArray(playbook?.reasonCodes);

  switch (input.severity) {
    case "critical":
      score += 70;
      reasons.push("Critical severity");
      break;
    case "high":
      score += 55;
      reasons.push("High severity");
      break;
    case "medium":
      score += 35;
      reasons.push("Medium severity");
      break;
    default:
      score += 18;
      reasons.push("Low severity");
      break;
  }

  if (input.status === "open") {
    score += 14;
    reasons.push("Open incident");
  } else if (input.status === "contained") {
    score += 8;
    reasons.push("Containment in progress");
  } else if (input.status === "resolved") {
    score += 3;
  }

  if (breached) {
    score += 28;
    reasons.push("Containment SLA breached");
  } else if (active && timeToDueHours !== null && timeToDueHours <= 4) {
    score += 16;
    reasons.push("Containment due within 4 hours");
  }

  if (needsAssignment) {
    score += 12;
    reasons.push("No owner assigned");
  }

  if (active && ageHours >= 24) {
    score += 10;
    reasons.push("Open longer than 24 hours");
  } else if (active && ageHours >= 8) {
    score += 6;
    reasons.push("Open longer than 8 hours");
  }

  if (
    policyCategories.some((category) => category === "GOVERNANCE_TAMPERING" || category === "CROSS_CUSTOMER_PII") ||
    reasonCodes.some((code) => code === "PHISHING" || code === "AML_OVERRIDE" || code === "REGULATOR_FABRICATION")
  ) {
    score += 12;
    reasons.push("Sensitive governance policy class");
  }

  let level: IncidentPriorityLevel = "monitor";
  if (score >= 95) {
    level = "urgent";
  } else if (score >= 65) {
    level = "high";
  } else if (score >= 35) {
    level = "normal";
  }

  return {
    score,
    level,
    reasons: reasons.slice(0, 4),
    breached,
    needsAssignment,
    active,
    ageHours: roundHours(ageHours),
    timeToDueHours: timeToDueHours === null ? null : roundHours(timeToDueHours),
  };
}

export function summarizeIncidentPriorities(
  incidents: IncidentPriorityInput[],
  now = new Date(),
): IncidentPrioritySummary {
  return incidents.reduce<IncidentPrioritySummary>(
    (summary, incident) => {
      const priority = evaluateIncidentPriority(incident, now);
      if (priority.active) summary.active += 1;
      if (priority.level === "urgent") summary.urgent += 1;
      if (priority.level === "high") summary.highPriority += 1;
      if (priority.level === "normal") summary.normalPriority += 1;
      if (priority.level === "monitor") summary.monitor += 1;
      if (priority.needsAssignment) summary.unassignedActive += 1;
      return summary;
    },
    {
      active: 0,
      urgent: 0,
      highPriority: 0,
      normalPriority: 0,
      monitor: 0,
      unassignedActive: 0,
    },
  );
}
