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
    key: "risk",
    title: "Open risk",
    href: "/risk",
    description: "Run assessments, review risk history, and re-score systems as posture changes.",
    accessKey: "canAccessRisk",
  },
  {
    key: "compliance",
    title: "Open compliance",
    href: "/compliance",
    description: "Review framework coverage, control status, and compliance readiness.",
    accessKey: "canAccessCompliance",
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
    key: "activity",
    title: "Open my activity",
    href: "/activity",
    description: "Review assigned reviews, bottlenecks, and recently submitted work.",
  },
  {
    key: "account-security",
    title: "Open account security",
    href: "/account-security",
    description: "Manage MFA, password security, and account-level safeguards.",
  },
  {
    key: "evidence",
    title: "Open evidence",
    href: "/exit-readiness",
    description: "Review diligence evidence, export readiness, and assurance artifacts.",
    accessKey: "canAccessExitReadiness",
  },
  {
    key: "portfolio",
    title: "Open portfolio control",
    href: "/portfolio-control",
    description: "Review multi-organization posture and portfolio-level policy defaults.",
    accessKey: "canAccessPortfolioControl",
  },
  {
    key: "calendar",
    title: "Open compliance calendar",
    href: "/calendar",
    description: "Track upcoming deadlines, reviews, and compliance milestones.",
    accessKey: "canAccessCalendar",
  },
  {
    key: "bulk-controls",
    title: "Open bulk controls",
    href: "/bulk-controls",
    description: "Apply governed control updates across multiple systems.",
    accessKey: "canAccessBulkControls",
  },
  {
    key: "telemetry-policy",
    title: "Open telemetry policy",
    href: "/telemetry-policy",
    description: "Tune thresholds, response behavior, and guided templates.",
    accessKey: "canAccessTelemetryPolicy",
  },
  {
    key: "telemetry-adapter",
    title: "Open telemetry adapter",
    href: "/telemetry-adapter",
    description: "Configure SDK ingestion, rotate keys, and test runtime evaluation.",
    accessKey: "canAccessTelemetryAdapter",
  },
  {
    key: "integrations",
    title: "Open integrations",
    href: "/integrations",
    description: "Manage Jira, event routing, threat intelligence, and automation hooks.",
    accessKey: "canAccessIntegrations",
  },
  {
    key: "settings",
    title: "Open settings",
    href: "/settings",
    description: "Manage access, identity, governance, and operator workspace preferences.",
    accessKey: "canAccessSettings",
  },
  {
    key: "retention-control",
    title: "Open retention control",
    href: "/retention-control",
    description: "Inspect retention deadlines, archive state, and legal hold posture.",
    accessKey: "canAccessRetentionControl",
  },
  {
    key: "billing",
    title: "Open billing",
    href: "/billing",
    description: "Review subscription status, seats, and billing controls.",
    accessKey: "canAccessBilling",
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
    key: "risk",
    title: "Risk guide",
    prefixes: ["/risk"],
    summary: "Risk is where teams assess AI systems, capture reasoning, and keep scores aligned with operational evidence.",
    tips: [
      "Use reassessment when a system changes materially instead of editing old assessment records.",
      "Compare risk history with runtime incidents before approving a higher-risk deployment.",
    ],
    quickLinks: [
      { label: "Open registry", href: "/registry", accessKey: "canAccessRegistry" },
      { label: "Open compliance", href: "/compliance", accessKey: "canAccessCompliance" },
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
    ],
  },
  {
    key: "compliance",
    title: "Compliance guide",
    prefixes: ["/compliance"],
    summary: "Compliance is the operating view for framework coverage, control status, and evidence readiness.",
    tips: [
      "Use the completion badge as a triage signal, then open the underlying controls before escalating gaps.",
      "Pair compliance status with evidence uploads so reviewers can verify claims without separate follow-up.",
    ],
    quickLinks: [
      { label: "Open evidence", href: "/exit-readiness", accessKey: "canAccessExitReadiness" },
      { label: "Open compliance calendar", href: "/calendar", accessKey: "canAccessCalendar" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
    ],
  },
  {
    key: "calendar",
    title: "Compliance calendar guide",
    prefixes: ["/calendar"],
    summary: "Use the calendar to track time-bound compliance work before it becomes overdue operational pressure.",
    tips: [
      "Filter deadlines by owner or framework when a review cycle starts to look crowded.",
      "Escalate missed dates through approvals or incidents only when the compliance owner cannot resolve them directly.",
    ],
    quickLinks: [
      { label: "Open compliance", href: "/compliance", accessKey: "canAccessCompliance" },
      { label: "Open approvals", href: "/approvals", accessKey: "canAccessApprovals" },
      { label: "Open my activity", href: "/activity" },
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
    key: "decision-trace",
    title: "Decision trace guide",
    prefixes: ["/decision-trace"],
    summary: "Decision traces show sealed model decisions, reviewer actions, and policy context in one audit path.",
    tips: [
      "Use traces to answer why a runtime decision happened before opening broader incident analysis.",
      "Keep trace exports tied to the system and framework context so evidence stays reviewer-ready.",
    ],
    quickLinks: [
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
      { label: "Open evidence", href: "/exit-readiness", accessKey: "canAccessExitReadiness" },
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
    ],
  },
  {
    key: "audit",
    title: "Audit log guide",
    prefixes: ["/audit"],
    summary: "Audit log is the searchable record of admin actions, workflow movement, telemetry events, and evidence changes.",
    tips: [
      "Use bulk export only after selecting the exact rows needed for the review packet.",
      "Filter by target type before searching names when the event volume is high.",
    ],
    quickLinks: [
      { label: "Open decision traces", href: "/decision-trace", accessKey: "canAccessDecisionTrace" },
      { label: "Open settings activity", href: "/settings?tab=activity", accessKey: "canAccessSettings" },
      { label: "Open evidence", href: "/exit-readiness", accessKey: "canAccessExitReadiness" },
    ],
  },
  {
    key: "activity",
    title: "My activity guide",
    prefixes: ["/activity", "/my-activity"],
    summary: "My Activity focuses each operator on assigned reviews, bottlenecks, and submitted work that needs follow-through.",
    tips: [
      "Start with bottlenecks before reviewing submitted work because queue pressure usually blocks other teams.",
      "Use this page as the personal operating view instead of scanning every approval and incident list.",
    ],
    quickLinks: [
      { label: "Open approvals", href: "/approvals", accessKey: "canAccessApprovals" },
      { label: "Open incidents", href: "/incidents", accessKey: "canAccessIncidents" },
      { label: "Open dashboard", href: "/dashboard" },
    ],
  },
  {
    key: "account-security",
    title: "Account security guide",
    prefixes: ["/account-security"],
    summary: "Account Security is the user-owned surface for MFA, passwords, and session safeguards.",
    tips: [
      "Keep account-level security separate from tenant access changes, which belong in Settings.",
      "Use MFA status as the first check before investigating suspicious account activity.",
    ],
    quickLinks: [
      { label: "Open settings", href: "/settings", accessKey: "canAccessSettings" },
      { label: "Open my activity", href: "/activity" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
    ],
  },
  {
    key: "evidence",
    title: "Evidence guide",
    prefixes: ["/exit-readiness"],
    summary: "Evidence collects the artifacts, expiry signals, and export-ready proof needed for diligence and audit.",
    tips: [
      "Add category, tags, and expiry dates when uploading evidence so reviewers can triage without reopening files.",
      "Treat expired or soon-expiring evidence as operational work, not just documentation hygiene.",
    ],
    quickLinks: [
      { label: "Open compliance", href: "/compliance", accessKey: "canAccessCompliance" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
      { label: "Open system registry", href: "/registry", accessKey: "canAccessRegistry" },
    ],
  },
  {
    key: "portfolio",
    title: "Portfolio control guide",
    prefixes: ["/portfolio-control"],
    summary: "Portfolio Control is for owners and admins managing posture and policy defaults across multiple organizations.",
    tips: [
      "Review organizations with local policy overrides before changing portfolio defaults.",
      "Use portfolio roll-up as a governance steering view rather than as a replacement for tenant-level detail.",
    ],
    quickLinks: [
      { label: "Open analytics", href: "/analytics", accessKey: "canAccessAnalytics" },
      { label: "Open telemetry policy", href: "/telemetry-policy", accessKey: "canAccessTelemetryPolicy" },
      { label: "Open settings", href: "/settings", accessKey: "canAccessSettings" },
    ],
  },
  {
    key: "bulk-controls",
    title: "Bulk controls guide",
    prefixes: ["/bulk-controls"],
    summary: "Bulk Controls is for applying controlled changes across multiple systems without editing each record manually.",
    tips: [
      "Preview the affected systems before applying a bulk update.",
      "Use bulk actions for consistent policy cleanup, not for one-off exceptions that should stay system-specific.",
    ],
    quickLinks: [
      { label: "Open registry", href: "/registry", accessKey: "canAccessRegistry" },
      { label: "Open compliance", href: "/compliance", accessKey: "canAccessCompliance" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
    ],
  },
  {
    key: "telemetry-adapter",
    title: "Telemetry adapter guide",
    prefixes: ["/telemetry-adapter"],
    summary: "Telemetry Adapter connects applications and SDK clients to governed runtime evaluation.",
    tips: [
      "Rotate keys when onboarding a new application environment instead of reusing old secrets.",
      "Run allow, warn, and block examples after policy changes to confirm the adapter is wired correctly.",
    ],
    quickLinks: [
      { label: "Open telemetry policy", href: "/telemetry-policy", accessKey: "canAccessTelemetryPolicy" },
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
      { label: "Connect AI application", href: "/registry/connect", accessKey: "canAccessRegistry" },
    ],
  },
  {
    key: "telemetry-policy",
    title: "Telemetry policy guide",
    prefixes: ["/telemetry-policy"],
    summary: "Telemetry Policy controls runtime thresholds, escalation behavior, and scoped exceptions.",
    tips: [
      "Use the draft preview before saving threshold changes so tighter and looser moves are visible.",
      "Prefer system-level overrides only when organization defaults are too broad for the specific workflow.",
    ],
    quickLinks: [
      { label: "Open runtime monitoring", href: "/runtime-monitoring", accessKey: "canAccessRuntimeMonitoring" },
      { label: "Open telemetry adapter", href: "/telemetry-adapter", accessKey: "canAccessTelemetryAdapter" },
      { label: "Open portfolio control", href: "/portfolio-control", accessKey: "canAccessPortfolioControl" },
    ],
  },
  {
    key: "retention-control",
    title: "Retention control guide",
    prefixes: ["/retention-control"],
    summary: "Retention Control tracks decision-record lifecycle, legal holds, and archive readiness.",
    tips: [
      "Check legal hold status before archiving decision evidence.",
      "Use retention deadlines alongside audit exports when preparing review packets.",
    ],
    quickLinks: [
      { label: "Open evidence", href: "/exit-readiness", accessKey: "canAccessExitReadiness" },
      { label: "Open audit log", href: "/audit", accessKey: "canAccessAuditLog" },
      { label: "Open settings", href: "/settings", accessKey: "canAccessSettings" },
    ],
  },
  {
    key: "integrations",
    title: "Integrations guide",
    prefixes: ["/integrations"],
    summary: "Integrations manages external systems such as Jira, event streams, threat intelligence, and remediation hooks.",
    tips: [
      "Verify connector configuration before enabling automation rules that create external work.",
      "Keep high-risk workflow automation specific so low-risk approvals do not create unnecessary tickets.",
    ],
    quickLinks: [
      { label: "Open approvals", href: "/approvals", accessKey: "canAccessApprovals" },
      { label: "Open telemetry adapter", href: "/telemetry-adapter", accessKey: "canAccessTelemetryAdapter" },
      { label: "Open settings", href: "/settings", accessKey: "canAccessSettings" },
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
  {
    key: "billing",
    title: "Billing guide",
    prefixes: ["/billing"],
    summary: "Billing is the admin-owned surface for plan status, seats, usage, and commercial readiness.",
    tips: [
      "Check seat and usage signals before changing subscription assumptions.",
      "Keep billing review separate from governance configuration unless plan limits block rollout.",
    ],
    quickLinks: [
      { label: "Open settings", href: "/settings", accessKey: "canAccessSettings" },
      { label: "Open analytics", href: "/analytics", accessKey: "canAccessAnalytics" },
      { label: "Open public site", href: "/welcome" },
    ],
  },
  {
    key: "api-docs",
    title: "API docs guide",
    prefixes: ["/api-docs"],
    summary: "API Docs is the reference surface for platform and identity endpoints used by implementation teams.",
    tips: [
      "Use API Docs with Telemetry Adapter when wiring SDK ingestion or runtime evaluation.",
      "Share endpoint documentation from this page instead of copying stale snippets into tickets.",
    ],
    quickLinks: [
      { label: "Open telemetry adapter", href: "/telemetry-adapter", accessKey: "canAccessTelemetryAdapter" },
      { label: "Open integrations", href: "/integrations", accessKey: "canAccessIntegrations" },
      { label: "Open trust center", href: "/trust-center" },
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
