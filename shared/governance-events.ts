export type GovernanceEventSeverity = "info" | "warning" | "critical";

export type GovernanceEventFeedItem = {
  id: string;
  eventType: string;
  title: string;
  summary: string;
  severity: GovernanceEventSeverity;
  source: "incident" | "workflow" | "policy" | "automation";
  entityType: string;
  entityId: string | null;
  href: string | null;
  createdAt: string;
};

export type GovernanceEventStatus = {
  webhookConfigured: boolean;
  backgroundJobsEnabled: boolean;
  destinationLabel: string | null;
  connectorCount: number;
  destinationLabels: string[];
  recentDeliveryFailures: number;
};

export type GovernanceEventFeedResponse = {
  status: GovernanceEventStatus;
  events: GovernanceEventFeedItem[];
};

export type AutomationActionPreview = {
  key: string;
  title: string;
  summary: string;
  severity: "critical" | "high" | "medium";
  targetCount: number;
};

export type GovernanceAutomationSummaryResponse = {
  actions: AutomationActionPreview[];
  totals: {
    openCriticalIncidents: number;
    breachedIncidents: number;
    staleWorkflows: number;
  };
  runMode?: "manual" | "assistive" | "auto";
};

export type GovernanceAutomationRunResponse = {
  ok: true;
  notificationsCreated: number;
  emittedEvents: number;
  actionsRun: AutomationActionPreview[];
};
