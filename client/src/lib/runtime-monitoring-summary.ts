type RuntimeTelemetrySummary = {
  total?: unknown;
  events?: unknown;
  thresholdBreaches?: unknown;
  breaches?: unknown;
  blocked?: unknown;
  escalatedEvents30d?: unknown;
  escalatedIncidents?: unknown;
  windowDays?: unknown;
};

type RuntimeIncidentSummary = {
  active?: unknown;
  open?: unknown;
};

function toCounter(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.floor(numeric) : 0;
}

export function normalizeRuntimeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function normalizeRuntimeThresholdLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const normalized = entry.trim();
      return normalized ? [normalized] : [];
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const candidate = entry as Record<string, unknown>;
    const label = typeof candidate.type === "string"
      ? candidate.type.trim()
      : typeof candidate.message === "string"
        ? candidate.message.trim()
        : "";
    return label ? [label] : [];
  });
}

export function resolveRuntimeMonitoringCounters(
  telemetrySummary: RuntimeTelemetrySummary | null | undefined,
  incidentSummary: RuntimeIncidentSummary | null | undefined,
) {
  const telemetry = telemetrySummary ?? {};
  const incidents = incidentSummary ?? {};

  return {
    totalEvents: toCounter(telemetry.total ?? telemetry.events),
    thresholdBreaches: toCounter(telemetry.thresholdBreaches ?? telemetry.breaches),
    blockedEvents: toCounter(telemetry.blocked),
    activeIncidents: toCounter(incidents.active ?? incidents.open),
    recentEscalatedIncidents: toCounter(telemetry.escalatedEvents30d ?? telemetry.escalatedIncidents),
    telemetryWindowDays: toCounter(telemetry.windowDays) || 30,
  };
}

export function resolveRuntimeEvaluationTarget(
  requestedSystemId: string | null | undefined,
  adapterDefaultSystemId: string | null | undefined,
  availableSystemIds: readonly string[],
): string {
  if (requestedSystemId && availableSystemIds.includes(requestedSystemId)) {
    return requestedSystemId;
  }

  if (adapterDefaultSystemId && availableSystemIds.includes(adapterDefaultSystemId)) {
    return adapterDefaultSystemId;
  }

  return "";
}

export function isRuntimeEvaluationTargetAvailable(
  selectedSystemId: string | null | undefined,
  availableSystemIds: readonly string[],
): boolean {
  return !selectedSystemId || availableSystemIds.includes(selectedSystemId);
}
