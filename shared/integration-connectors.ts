import type { GovernanceEventSeverity } from "./governance-events";

export const integrationConnectorTypes = [
  "generic_webhook",
  "slack",
  "teams",
  "servicenow",
  "github",
  "datadog",
] as const;
export type IntegrationConnectorType = (typeof integrationConnectorTypes)[number];

export const integrationConnectorSeverityFloors = ["info", "warning", "critical"] as const;
export type IntegrationConnectorSeverityFloor = (typeof integrationConnectorSeverityFloors)[number];

export type IntegrationConnectorConfig = {
  id: string;
  label: string;
  type: IntegrationConnectorType;
  enabled: boolean;
  webhookUrl: string | null;
  authToken: string | null;
  eventFilters: string[];
  severityFloor: IntegrationConnectorSeverityFloor;
};

export const integrationConnectorTypeLabels: Record<IntegrationConnectorType, string> = {
  generic_webhook: "Generic webhook",
  slack: "Slack",
  teams: "Microsoft Teams",
  servicenow: "ServiceNow",
  github: "GitHub / GitHub Enterprise",
  datadog: "Datadog",
};

export const integrationConnectorTypeDescriptions: Record<IntegrationConnectorType, string> = {
  generic_webhook: "Route governance events to any HTTPS endpoint.",
  slack: "Post governed event payloads into Slack workflows or incoming webhooks.",
  teams: "Send governance alerts into Microsoft Teams channels or flows.",
  servicenow: "Push incident-style governance events into ITSM workflows.",
  github: "Create downstream automation hooks for engineering and review flows.",
  datadog: "Forward governance signals into security and observability pipelines.",
};

export function sanitizeIntegrationConnectors(input: unknown): IntegrationConnectorConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .flatMap((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }
      const record = entry as Record<string, unknown>;
      const type =
        typeof record.type === "string" && (integrationConnectorTypes as readonly string[]).includes(record.type)
          ? (record.type as IntegrationConnectorType)
          : null;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const id = typeof record.id === "string" && record.id.trim() ? record.id.trim() : `connector-${index + 1}`;
      if (!type || !label) {
        return [];
      }
      const webhookUrl =
        typeof record.webhookUrl === "string" && record.webhookUrl.trim() ? record.webhookUrl.trim() : null;
      const authToken =
        typeof record.authToken === "string" && record.authToken.trim() ? record.authToken.trim() : null;
      const eventFilters = Array.isArray(record.eventFilters)
        ? Array.from(
            new Set(
              record.eventFilters.filter(
                (filter): filter is string => typeof filter === "string" && filter.trim().length > 0,
              ),
            ),
          ).slice(0, 12)
        : [];
      const severityFloor =
        typeof record.severityFloor === "string" &&
        (integrationConnectorSeverityFloors as readonly string[]).includes(record.severityFloor)
          ? (record.severityFloor as IntegrationConnectorSeverityFloor)
          : "warning";
      return [
        {
          id,
          label,
          type,
          enabled: record.enabled === true,
          webhookUrl,
          authToken,
          eventFilters,
          severityFloor,
        } satisfies IntegrationConnectorConfig,
      ];
    })
    .slice(0, 12);
}

export function connectorMatchesEvent(
  connector: IntegrationConnectorConfig,
  eventType: string,
  severity: GovernanceEventSeverity,
) {
  const severityRank: Record<GovernanceEventSeverity, number> = {
    info: 0,
    warning: 1,
    critical: 2,
  };

  if ((severityRank[severity] ?? 0) < (severityRank[connector.severityFloor] ?? 0)) {
    return false;
  }

  if (connector.eventFilters.length === 0) {
    return true;
  }

  const normalizedEventType = eventType.trim().toLowerCase();
  return connector.eventFilters.some((filter) => {
    const normalized = filter.trim().toLowerCase();
    return normalized.length > 0 && (normalizedEventType === normalized || normalizedEventType.startsWith(`${normalized}.`));
  });
}
