import { buildIncidentResolutionSuggestion, type IncidentResolutionSuggestionResponse } from "@shared/incident-resolution-suggestions";
import { evaluateIncidentPriority } from "@shared/incident-prioritization";
import { incidentService } from "./incidentService";

export class IncidentResolutionSuggestionService {
  async getForIncident(
    organizationId: string,
    incidentId: string,
  ): Promise<IncidentResolutionSuggestionResponse | null> {
    const incident = await incidentService.getForOrg(organizationId, incidentId);
    if (!incident) {
      return null;
    }

    return buildIncidentResolutionSuggestion({
      incidentId: incident.id,
      title: incident.title,
      category: incident.category,
      severity: incident.severity,
      status: incident.status,
      description: incident.description,
      owner: incident.owner,
      escalatedTo: incident.escalatedTo,
      dueAt: incident.dueAt,
      detectedAt: incident.detectedAt,
      playbook: incident.playbook,
      priority: evaluateIncidentPriority(incident),
    });
  }
}

export const incidentResolutionSuggestionService = new IncidentResolutionSuggestionService();
