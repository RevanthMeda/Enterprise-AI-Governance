import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Clock,
  Server,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Bell,
  ClipboardCheck,
  Activity,
  Eye,
  ChevronRight,
  AlertCircle,
  Folder,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import type { AiSystem, ApprovalWorkflow, SystemControl, AuditLog } from "@shared/schema";

interface ActivityData {
  summary: {
    mySystemsCount: number;
    pendingReviewCount: number;
    myControlsCount: number;
    overdueControlsCount: number;
    unreadNotificationsCount: number;
    controlsInProgressCount: number;
    controlsNotStartedCount: number;
    highRiskSystemsCount: number;
    evidenceMissingCount: number;
    tasksDueThisWeekCount: number;
  };
  pendingMyReview: ApprovalWorkflow[];
  mySystems: AiSystem[];
  overdueControls: SystemControl[];
  controlsInProgress: SystemControl[];
  tasksDueThisWeek: SystemControl[];
  recentlyChangedHighRisk: AiSystem[];
  systemsWithoutEvidence: AiSystem[];
  approvalBottlenecks: ApprovalWorkflow[];
  controlGaps: SystemControl[];
  myRequestedWorkflows: ApprovalWorkflow[];
  recentActivity: AuditLog[];
  userRole: string;
}

function SummaryCard({ title, value, icon: Icon, color, subtitle, onClick, testId }: {
  title: string;
  value: number;
  icon: any;
  color: string;
  subtitle?: string;
  onClick?: () => void;
  testId: string;
}) {
  return (
    <Card
      className={onClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
      onClick={onClick}
      data-testid={testId}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-1">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">{title}</span>
            <span className="text-2xl font-bold tracking-tight" data-testid={`${testId}-value`}>{value}</span>
            {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
          </div>
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const statusStyles: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

const riskColors: Record<string, string> = {
  unacceptable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  limited: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  minimal: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const controlStatusStyles: Record<string, string> = {
  not_started: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  implemented: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  verified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
};

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: "Administrator",
    cro: "Chief Risk Officer",
    ciso: "Chief Information Security Officer",
    compliance_lead: "Compliance Lead",
    reviewer: "Reviewer",
    system_owner: "System Owner",
    auditor: "Auditor",
  };
  return labels[role] || role;
}

function getRoleDescription(role: string): string {
  const descriptions: Record<string, string> = {
    admin: "Full platform oversight — risk posture, approval bottlenecks, compliance gaps",
    cro: "Enterprise risk posture, overdue high-risk items, approval throughput",
    ciso: "Security posture, control gaps, evidence coverage, high-risk systems",
    compliance_lead: "Control implementation gaps, evidence coverage, framework compliance",
    reviewer: "Assigned approvals, pending assessments, workflow queue",
    system_owner: "Owned systems, evidence requests, control implementation status",
    auditor: "Recent changes, activity slices, compliance evidence",
  };
  return descriptions[role] || "Your personal activity overview";
}

export default function MyActivity() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<ActivityData>({
    queryKey: ["/api/activity-dashboard"],
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-md" />
          <Skeleton className="h-64 rounded-md" />
        </div>
      </div>
    );
  }

  const { summary, userRole } = data;
  const isExecutive = ["admin", "cro", "ciso"].includes(userRole);
  const isComplianceLead = userRole === "compliance_lead";
  const isReviewer = userRole === "reviewer";

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-my-activity">
      <div>
        <h1 className="text-xl font-bold tracking-tight" data-testid="heading-my-activity">
          My Activity
        </h1>
        <div className="flex items-center gap-2 mt-0.5">
          <Badge variant="outline" className="text-[10px]" data-testid="badge-role">
            {getRoleLabel(userRole)}
          </Badge>
          <span className="text-xs text-muted-foreground">{getRoleDescription(userRole)}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Pending Reviews"
          value={summary.pendingReviewCount}
          icon={Clock}
          color="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300"
          subtitle="Awaiting your review"
          onClick={() => navigate("/approvals")}
          testId="stat-pending-reviews"
        />
        <SummaryCard
          title="My Systems"
          value={summary.mySystemsCount}
          icon={Server}
          color="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          subtitle="Systems you own"
          onClick={() => navigate("/registry")}
          testId="stat-my-systems"
        />
        <SummaryCard
          title="Overdue Controls"
          value={summary.overdueControlsCount}
          icon={AlertCircle}
          color={summary.overdueControlsCount > 0 ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"}
          subtitle={summary.overdueControlsCount > 0 ? "Require immediate attention" : "All on track"}
          testId="stat-overdue-controls"
        />
        <SummaryCard
          title="Unread Notifications"
          value={summary.unreadNotificationsCount}
          icon={Bell}
          color="bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
          subtitle="New activity"
          testId="stat-unread-notifications"
        />
      </div>

      {summary.overdueControlsCount > 0 && (
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/10" data-testid="card-overdue-alert">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-300">
                  {summary.overdueControlsCount} overdue control{summary.overdueControlsCount !== 1 ? "s" : ""} require attention
                </p>
                <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">
                  These controls have passed their due date without reaching verified or implemented status.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.pendingMyReview.length > 0 && (
          <Card data-testid="card-pending-reviews">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Approvals Awaiting My Review
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.pendingMyReview.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pendingMyReview.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate("/approvals")}
                  data-testid={`review-item-${wf.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{wf.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      by {wf.requestedBy} · {wf.priority} priority
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[wf.status]}`}>
                      {wf.status.replace("_", " ")}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.mySystems.length > 0 && (
          <Card data-testid="card-my-systems">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                My Systems
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.mySystems.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.mySystems.map((sys) => (
                <div
                  key={sys.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/systems/${sys.id}`)}
                  data-testid={`my-system-${sys.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{sys.name}</span>
                    <span className="text-[10px] text-muted-foreground">{sys.department} · {sys.status}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[sys.riskLevel]}`}>
                      {sys.riskLevel}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.controlsInProgress.length > 0 && (
          <Card data-testid="card-controls-in-progress">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                Controls In Progress
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.controlsInProgress.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.controlsInProgress.map((ctrl) => (
                <div
                  key={ctrl.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5"
                  data-testid={`control-progress-${ctrl.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">Control {ctrl.controlId}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {ctrl.assignee ? `Assigned to ${ctrl.assignee}` : "Unassigned"}
                      {ctrl.dueDate && ` · Due ${new Date(ctrl.dueDate).toLocaleDateString()}`}
                    </span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${controlStatusStyles[ctrl.status]}`}>
                    {ctrl.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.overdueControls.length > 0 && (
          <Card data-testid="card-overdue-controls">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                Overdue Controls
                <Badge variant="destructive" className="text-[10px] ml-auto">{data.overdueControls.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.overdueControls.map((ctrl) => (
                <div
                  key={ctrl.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-red-50 dark:bg-red-950/20 p-2.5"
                  data-testid={`overdue-control-${ctrl.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">Control {ctrl.controlId}</span>
                    <span className="text-[10px] text-red-600 dark:text-red-400">
                      Due {ctrl.dueDate ? new Date(ctrl.dueDate).toLocaleDateString() : "N/A"}
                      {ctrl.assignee && ` · ${ctrl.assignee}`}
                    </span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${controlStatusStyles[ctrl.status]}`}>
                    {ctrl.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {data.tasksDueThisWeek.length > 0 && (
          <Card data-testid="card-tasks-due-this-week">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                Tasks Due This Week
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.tasksDueThisWeek.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.tasksDueThisWeek.map((ctrl) => (
                <div
                  key={ctrl.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-blue-50 dark:bg-blue-950/20 p-2.5"
                  data-testid={`task-due-${ctrl.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">Control {ctrl.controlId}</span>
                    <span className="text-[10px] text-blue-600 dark:text-blue-400">
                      Due {ctrl.dueDate ? new Date(ctrl.dueDate).toLocaleDateString() : "N/A"}
                      {ctrl.assignee && ` · ${ctrl.assignee}`}
                    </span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${controlStatusStyles[ctrl.status]}`}>
                    {ctrl.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(isExecutive || isComplianceLead) && data.recentlyChangedHighRisk.length > 0 && (
          <Card data-testid="card-high-risk-changes">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-orange-500" />
                Recently Changed High-Risk Systems
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.recentlyChangedHighRisk.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.recentlyChangedHighRisk.map((sys) => (
                <div
                  key={sys.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/systems/${sys.id}`)}
                  data-testid={`high-risk-item-${sys.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{sys.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      Updated {sys.updatedAt ? new Date(sys.updatedAt).toLocaleDateString() : ""} · {sys.owner}
                    </span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[sys.riskLevel]}`}>
                    {sys.riskLevel}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(isExecutive) && data.approvalBottlenecks.length > 0 && (
          <Card data-testid="card-approval-bottlenecks">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                Approval Bottlenecks
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.approvalBottlenecks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.approvalBottlenecks.map((wf) => {
                const daysOld = wf.createdAt ? Math.floor((Date.now() - new Date(wf.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 0;
                return (
                  <div
                    key={wf.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-yellow-50 dark:bg-yellow-950/20 p-2.5 cursor-pointer hover:bg-yellow-100/50 dark:hover:bg-yellow-950/30 transition-colors"
                    onClick={() => navigate("/approvals")}
                    data-testid={`bottleneck-${wf.id}`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium truncate">{wf.title}</span>
                      <span className="text-[10px] text-yellow-700 dark:text-yellow-400">
                        Pending {daysOld} days · {wf.reviewer || "Unassigned"}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] shrink-0">{wf.priority}</Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {data.systemsWithoutEvidence.length > 0 && (
          <Card data-testid="card-missing-evidence">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Folder className="h-4 w-4 text-muted-foreground" />
                Systems Missing Evidence
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.systemsWithoutEvidence.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.systemsWithoutEvidence.map((sys) => (
                <div
                  key={sys.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/systems/${sys.id}`)}
                  data-testid={`no-evidence-${sys.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{sys.name}</span>
                    <span className="text-[10px] text-muted-foreground">{sys.department}</span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[sys.riskLevel]}`}>
                    {sys.riskLevel}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {(isExecutive || isComplianceLead) && data.controlGaps.length > 0 && (
          <Card data-testid="card-control-gaps">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                Control Gaps (Not Started)
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.controlGaps.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.controlGaps.slice(0, 8).map((ctrl) => (
                <div
                  key={ctrl.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5"
                  data-testid={`control-gap-${ctrl.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">Control {ctrl.controlId}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {ctrl.assignee || "Unassigned"}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px]">not started</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-recent-activity">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              My Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">No recent activity</p>
              </div>
            ) : (
              <div className="space-y-2">
                {data.recentActivity.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-2 rounded-md bg-muted/30 p-2.5"
                    data-testid={`activity-item-${log.id}`}
                  >
                    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                      <Activity className="h-3 w-3 text-primary" />
                    </div>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-xs font-medium">{log.action.replace("_", " ")} — {log.entityType.replace("_", " ")}</span>
                      <span className="text-[10px] text-muted-foreground truncate">{log.details}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {data.myRequestedWorkflows.length > 0 && (
          <Card data-testid="card-my-requests">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                My Submitted Requests
                <Badge variant="secondary" className="text-[10px] ml-auto">{data.myRequestedWorkflows.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.myRequestedWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate("/approvals")}
                  data-testid={`my-request-${wf.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs font-medium truncate">{wf.title}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {wf.reviewer ? `Reviewer: ${wf.reviewer}` : "No reviewer assigned"}
                    </span>
                  </div>
                  <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[wf.status]}`}>
                    {wf.status.replace("_", " ")}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
