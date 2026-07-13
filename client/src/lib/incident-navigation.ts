export type IncidentQueueScope = "active" | "all" | "resolved";

type IncidentNavigationCandidate = {
  id: string;
  status: string;
};

export function buildIncidentHref(incidentId: string | null | undefined): string {
  const normalizedIncidentId = typeof incidentId === "string" ? incidentId.trim() : "";
  return normalizedIncidentId
    ? `/incidents?incidentId=${encodeURIComponent(normalizedIncidentId)}`
    : "/incidents";
}

export function resolveIncidentDeepLink(
  requestedIncidentId: string | null | undefined,
  incidents: readonly IncidentNavigationCandidate[],
): { incidentId: string; queueScope: IncidentQueueScope } | null {
  if (!requestedIncidentId) {
    return null;
  }

  const incident = incidents.find((candidate) => candidate.id === requestedIncidentId);
  if (!incident) {
    return null;
  }

  const queueScope: IncidentQueueScope =
    incident.status === "open" || incident.status === "contained"
      ? "active"
      : incident.status === "resolved" || incident.status === "postmortem"
        ? "resolved"
        : "all";

  return { incidentId: incident.id, queueScope };
}

export function resolveVisibleIncidentId(
  selectedIncidentId: string | null | undefined,
  visibleIncidentIds: readonly string[],
): string | null {
  if (selectedIncidentId && visibleIncidentIds.includes(selectedIncidentId)) {
    return selectedIncidentId;
  }

  return visibleIncidentIds[0] ?? null;
}
