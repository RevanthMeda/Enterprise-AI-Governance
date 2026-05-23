import type { AppAccess } from "@/lib/permissions";

type AccessKey = keyof AppAccess;

export type WorkspaceRouteGuide = {
  key: string;
  title: string;
  prefixes: string[];
  summary: string;
  tips: string[];
  quickLinks: Array<{
    label: string;
    href: string;
    accessKey?: AccessKey;
  }>;
};

export type WorkspaceCommandAction = {
  key: string;
  title: string;
  href: string;
  description: string;
  accessKey?: AccessKey;
};

export const workspaceCommandActions: WorkspaceCommandAction[] = [
  {
    key: "dashboard",
    title: "Open dashboard",
    href: "/dashboard",
    description: "Start from the control plane overview and immediate watchlist.",
  },
  {
    key: "knowledge-center",
    title: "Open knowledge center",
    href: "/knowledge-center",
    description: "Review documentation paths, role-based training tracks, and certification guidance.",
  },
  {
    key: "analytics",
    title: "Open analytics",
    href: "/analytics",
    description: "Review operational trends, executive metrics, and exportable governance reports.",
    accessKey: "canAccessAnalytics",
  },
  {
    key: "governance-maturity",
    title: "Open governance maturity",
    href: "/governance-maturity",
    description: "Review the live maturity scorecard across inventory, controls, runtime, evidence, and operations.",
    accessKey: "canAccessAnalytics",
  },
  {
    key: "registry",
    title: "Open AI registry",
    href: "/registry",
    description: "Register systems, review owners, and inspect risk posture.",
    accessKey: "canAccessRegistry",
  },
  {
    key: "runtime",
    title: "Open runtime monitoring",
    href: "/runtime-monitoring",
    description: "Review telemetry decisions, incidents, and governed traffic.",
    accessKey: "canAccessRuntimeMonitoring",
  },
  {
    key: "incidents",
    title: "Open incidents",
    href: "/incidents",
    description: "Triage active incidents, assignment, and containment work.",
    accessKey: "canAccessIncidents",
  },
  {
    key: "approvals",
    title: "Open approvals",
    href: "/approvals",
    description: "Review pending workflows, routing, and reviewer queues.",
    accessKey: "canAccessApprovals",
  },
  {
    key: "decision-trace",
    title: "Open decision traces",
    href: "/decision-trace",
    description: "Inspect sealed records, overrides, and explainability evidence.",
    accessKey: "canAccessDecisionTrace",
  },
  {
    key: "audit",
    title: "Open audit log",
    href: "/audit",
    description: "Search admin, workflow, telemetry, and evidence activity.",
    accessKey: "canAccessAuditLog",
  },
  {
    key: "telemetry-policy",
    title: "Open telemetry policy",
    href: "/telemetry-policy",
    description: "Tune thresholds, response behavior, and guided templates.",
    accessKey: "canAccessTelemetryPolicy",
  },
  {
    key: "settings",
    title: "Open settings",
    href: "/settings",
    description: "Manage access, identity, governance, and operator workspace preferences.",
    accessKey: "canAccessSettings",
  },
  {
    key: "api-docs",
    title: "Open API docs",
    href: "/api-docs",
    description: "Review integration and platform endpoint documentation.",
  },
];

export const workspaceRouteGuides: WorkspaceRouteGuide[] = [
  {
    key: "dashboard",
    title: "Dashboard guide",
    prefixes: ["/", "/dashboard"],
    summary: "Use the dashboard to orient the team quickly: watchlist first, then workload, then trendlines.",
    tips: [
      "If guided mode is enabled, the launch checklist is the fastest way to move a new tenant into steady state.",
      "Saved views let reviewers and executives see different dashboard layouts without changing policy.",
    ],
    quickLinks: [
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
      { label: "Review approvals", href: "/approvals", accessKey: "canAccessApprovals" },
      { label: "Adjust workspace preferences", href: "/settings?tab=governance", accessKey: "canAccessSettings" },
    ],
  },
  {
    key: "knowledge-center",
    title: "Knowledge center guide",
    prefixes: ["/knowledge-center"],
    summary: "Use the knowledge center to onboard new operators faster and show that Control Grid includes enablement, not only governance controls.",
    tips: [
      "The role-based tracks are the fastest way to show reviewers and compliance leads where they should live inside the product.",
      "Pair the certification cards with governance maturity when buyers ask how teams should operationalize the platform.",
    ],
    quickLinks: [
      { label: "Open governance maturity", href: "/governance-maturity", accessKey: "canAccessAnalytics" },
      { label: "Open settings", href: "/settings?tab=governance", accessKey: "canAccessSettings" },
      { label: "Open analytics", href: "/analytics", accessKey: "canAccessAnalytics" },
    ],
  },
  {
    key: "analytics",
    title: "Analytics guide",
    prefixes: ["/analytics"],
    summary: "Analytics is the executive and reviewer reporting surface for posture, trends, and exportable governance summaries.",
    tips: [
      "Use the preset exports when you need a board-ready snapshot without rebuilding the same metrics every week.",
      "Incident, workflow, and control charts are most useful together because queue pressure often explains posture drift.",
    ],
    quickLinks: [
      { label: "Open governance maturity", href: "/governance-maturity", accessKey: "canAccessAnalytics" },
      { label: "Open incidents", href: "/incidents", accessKey: "canAccessIncidents" },
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
    ],
  },
  {
    key: "governance-maturity",
    title: "Governance maturity guide",
    prefixes: ["/governance-maturity"],
    summary: "Use this page to explain overall governance maturity with live platform evidence instead of a static slide narrative.",
    tips: [
      "The score is strongest when inventory quality, control coverage, telemetry posture, and SSO operations all move together.",
      "Use the lowest-scoring domain as the next operating priority instead of treating the headline score as the whole story.",
    ],
    quickLinks: [
      { label: "Open analytics", href: "/analytics", accessKey: "canAccessAnalytics" },
      { label: "Open telemetry policy", href: "/telemetry-policy", accessKey: "canAccessTelemetryPolicy" },
      { label: "Open settings", href: "/settings?tab=governance", accessKey: "canAccessSettings" },
    ],
  },
  {
    key: "registry",
    title: "Registry guide",
    prefixes: ["/registry", "/systems/"],
    summary: "The registry is the canonical system inventory. Owners, vendors, legal profile, and runtime context should stay current here.",
    tips: [
      "Use the connect flow when onboarding a new application so templates and guided fields reduce misconfiguration.",
      "System detail is where risk history and legal-profile drift become visible to operators.",
    ],
    quickLinks: [
      { label: "Connect a new AI application", href: "/registry/connect", accessKey: "canAccessRegistry" },
      { label: "Run a risk assessment", href: "/risk", accessKey: "canAccessRisk" },
      { label: "Open compliance", href: "/compliance", accessKey: "canAccessCompliance" },
    ],
  },
  {
    key: "runtime",
    title: "Runtime monitoring guide",
    prefixes: ["/runtime-monitoring"],
    summary: "Runtime Monitoring is for governed traffic, threshold decisions, critic evidence, and incident creation.",
    tips: [
      "Use reason codes and decision summaries together before escalating noisy traffic.",
      "If incident volume spikes, review telemetry policy presets before loosening rules manually.",
    ],
    quickLinks: [
      { label: "Open incidents", href: "/incidents", accessKey: "canAccessIncidents" },
      { label: "Tune telemetry policy", href: "/telemetry-policy", accessKey: "canAccessTelemetryPolicy" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
    ],
  },
  {
    key: "incidents",
    title: "Incident response guide",
    prefixes: ["/incidents"],
    summary: "Use Incidents to contain, assign, and document governance failures with enough evidence for reviewers and audit.",
    tips: [
      "Search and assignment filters are the fastest way to reduce queue noise after a heavy red-team run.",
      "Containment notes, post-incident review, and regulatory notification status should be kept on one incident record.",
    ],
    quickLinks: [
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
      { label: "Review audit trail", href: "/audit", accessKey: "canAccessAuditLog" },
      { label: "My activity", href: "/activity" },
    ],
  },
  {
    key: "approvals",
    title: "Approvals guide",
    prefixes: ["/approvals"],
    summary: "Approvals are the reviewer-owned queue for routing, evidence-backed sign-off, and committee decisions.",
    tips: [
      "Reviewer bottlenecks usually surface here before they show up in executive dashboards.",
      "Use workflow legal profiles and law packs when approvals differ by jurisdiction or operational surface.",
    ],
    quickLinks: [
      { label: "Open decision traces", href: "/decision-trace", accessKey: "canAccessDecisionTrace" },
      { label: "Open evidence", href: "/exit-readiness", accessKey: "canAccessExitReadiness" },
      { label: "Open dashboard", href: "/dashboard" },
    ],
  },
  {
    key: "settings",
    title: "Settings guide",
    prefixes: ["/settings"],
    summary: "Settings is admin-owned configuration: identity, access, workspace preferences, and tenant operations.",
    tips: [
      "Use the governance tab for workspace defaults before changing telemetry policy or user routing.",
      "Identity and access changes affect the whole tenant, so keep them separate from workflow review actions.",
    ],
    quickLinks: [
      { label: "Telemetry policy", href: "/telemetry-policy", accessKey: "canAccessTelemetryPolicy" },
      { label: "Integrations", href: "/integrations", accessKey: "canAccessIntegrations" },
      { label: "Account security", href: "/account-security" },
    ],
  },
];

export function getVisibleWorkspaceActions(access: AppAccess) {
  return workspaceCommandActions.filter((action) => !action.accessKey || access[action.accessKey]);
}

export function getWorkspaceGuideForPath(path: string) {
  return (
    workspaceRouteGuides.find((guide) =>
      guide.prefixes.some((prefix) => (prefix === "/" ? path === "/" || path === "/dashboard" : path.startsWith(prefix))),
    ) ?? workspaceRouteGuides[0]
  );
}
