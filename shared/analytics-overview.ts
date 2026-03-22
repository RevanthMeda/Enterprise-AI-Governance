export const analyticsReportPresetIds = [
  "executive_snapshot",
  "incident_ops_review",
  "compliance_snapshot",
] as const;

export type AnalyticsReportPresetId = (typeof analyticsReportPresetIds)[number];

export type AnalyticsDistributionSlice = {
  label: string;
  value: number;
};

export type AnalyticsTrendPoint = {
  period: string;
  incidentsCreated: number;
  incidentsResolved: number;
  approvalsSubmitted: number;
  approvalsClosed: number;
  evidenceAdded: number;
};

export type AnalyticsOverviewResponse = {
  generatedAt: string;
  summary: {
    totalSystems: number;
    highRiskSystems: number;
    controlCoverageRate: number;
    evidenceCoverageRate: number;
    openIncidents: number;
    breachedIncidents: number;
    avgContainmentHours: number | null;
    avgResolutionHours: number | null;
    pendingWorkflows: number;
    approvalsClosed30d: number;
    decisionTraceCoverageRate: number;
  };
  distributions: {
    riskLevels: AnalyticsDistributionSlice[];
    workflowStatuses: AnalyticsDistributionSlice[];
    incidentSeverities: AnalyticsDistributionSlice[];
    controlStatuses: AnalyticsDistributionSlice[];
  };
  trends: AnalyticsTrendPoint[];
  highlights: string[];
  reportPresets: Array<{
    id: AnalyticsReportPresetId;
    label: string;
    description: string;
  }>;
};
