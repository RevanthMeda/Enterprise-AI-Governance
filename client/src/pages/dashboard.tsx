import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Server,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  BarChart3,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { AiSystem, ApprovalWorkflow, SystemControl } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth, type AuthOnboardingState, type AuthUser } from "@/hooks/use-auth";
import { getAppAccess } from "@/lib/permissions";

type DashboardAccess = ReturnType<typeof getAppAccess>;
type DashboardAccessKey = keyof DashboardAccess;
type DashboardNavAction = {
  label: string;
  value: number;
  href: string;
  tone: string;
  accessKey: DashboardAccessKey;
};
type SetupTask = {
  id: string;
  label: string;
  summary: string;
  description: string;
  href: string;
  cta: string;
  complete: boolean;
  accessKey?: DashboardAccessKey;
};
type WatchlistAlert = {
  key: string;
  label: string;
  description: string;
  href: string;
  tone: string;
  detectedAt: string | Date | null;
  severity: "critical" | "warning" | "info";
  accessKey?: DashboardAccessKey;
};

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  testId,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  trend?: string;
  testId: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-1">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{title}</span>
            <span className="text-2xl font-bold tracking-tight" data-testid={`${testId}-value`}>{value}</span>
            {subtitle && (
              <span className="text-[11px] text-muted-foreground">{subtitle}</span>
            )}
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-green-600 dark:text-green-400" />
            <span className="text-[11px] text-green-600 dark:text-green-400">{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RiskDistribution({ systems }: { systems: AiSystem[] }) {
  const riskCounts = {
    unacceptable: systems.filter((s) => s.riskLevel === "unacceptable").length,
    high: systems.filter((s) => s.riskLevel === "high").length,
    limited: systems.filter((s) => s.riskLevel === "limited").length,
    minimal: systems.filter((s) => s.riskLevel === "minimal").length,
  };
  const total = systems.length || 1;

  const risks = [
    { level: "Unacceptable", count: riskCounts.unacceptable, color: "bg-red-500 dark:bg-red-400", pct: Math.round((riskCounts.unacceptable / total) * 100) },
    { level: "High", count: riskCounts.high, color: "bg-orange-500 dark:bg-orange-400", pct: Math.round((riskCounts.high / total) * 100) },
    { level: "Limited", count: riskCounts.limited, color: "bg-yellow-500 dark:bg-yellow-400", pct: Math.round((riskCounts.limited / total) * 100) },
    { level: "Minimal", count: riskCounts.minimal, color: "bg-green-500 dark:bg-green-400", pct: Math.round((riskCounts.minimal / total) * 100) },
  ];

  return (
    <Card data-testid="card-risk-distribution">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Risk Mix
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {risks.map((r) => (
          <div key={r.level} className="space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-xs font-medium">{r.level}</span>
              <span className="text-xs text-muted-foreground">{r.count} systems ({r.pct}%)</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all ${r.color}`}
                style={{ width: `${r.pct}%` }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ComplianceOverview({ controls }: { controls: SystemControl[] }) {
  const statusCounts = {
    verified: controls.filter((c) => c.status === "verified").length,
    implemented: controls.filter((c) => c.status === "implemented").length,
    in_progress: controls.filter((c) => c.status === "in_progress").length,
    not_started: controls.filter((c) => c.status === "not_started").length,
  };
  const total = controls.length || 1;
  const complianceRate = Math.round(
    ((statusCounts.verified + statusCounts.implemented) / total) * 100
  );

  return (
    <Card data-testid="card-compliance-overview">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Control Coverage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-3 mb-4">
          <div className="relative flex h-28 w-28 items-center justify-center">
            <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50" cy="50" r="42"
                fill="none" stroke="hsl(var(--muted))" strokeWidth="8"
              />
              <circle
                cx="50" cy="50" r="42"
                fill="none" stroke="hsl(var(--primary))" strokeWidth="8"
                strokeDasharray={`${complianceRate * 2.64} ${264 - complianceRate * 2.64}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className="text-2xl font-bold">{complianceRate}%</span>
              <span className="text-[10px] text-muted-foreground">Compliant</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
            <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
            <span className="text-[11px]">Verified: {statusCounts.verified}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
            <ShieldCheck className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <span className="text-[11px]">Implemented: {statusCounts.implemented}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
            <Clock className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
            <span className="text-[11px]">In Progress: {statusCounts.in_progress}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5">
            <XCircle className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px]">Not Started: {statusCounts.not_started}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RecentWorkflows({ workflows }: { workflows: ApprovalWorkflow[] }) {
  const statusStyles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  };

  return (
    <Card data-testid="card-recent-workflows">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Latest Workflow Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        {workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Activity className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No workflows yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.slice(0, 5).map((wf) => (
              <div
                key={wf.id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5"
                data-testid={`workflow-item-${wf.id}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-medium truncate">{wf.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    by {wf.requestedBy} {wf.createdAt ? `on ${new Date(wf.createdAt).toLocaleDateString()}` : ""}
                  </span>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusStyles[wf.status] || ""}`}>
                  {wf.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentSystems({ systems }: { systems: AiSystem[] }) {
  const riskColors: Record<string, string> = {
    unacceptable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    limited: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
    minimal: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  };

  return (
    <Card data-testid="card-recent-systems">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Newest Registered Systems
        </CardTitle>
      </CardHeader>
      <CardContent>
        {systems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Server className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No systems registered</p>
          </div>
        ) : (
          <div className="space-y-2">
            {systems.slice(0, 5).map((sys) => (
              <div
                key={sys.id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/30 p-2.5"
                data-testid={`system-item-${sys.id}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-medium truncate">{sys.name}</span>
                  <span className="text-[10px] text-muted-foreground">{sys.owner} - {sys.department}</span>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[sys.riskLevel] || ""}`}>
                  {sys.riskLevel}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TrendData {
  riskTrends: { week: string; high: number; limited: number; minimal: number }[];
  approvalTrends: { week: string; submitted: number; approved: number; rejected: number }[];
  auditTrends: { week: string; events: number }[];
  evidenceTrends: { week: string; total: number }[];
}

interface ReadyStatus {
  ok: boolean;
  ready: boolean;
  service: string;
  timestamp: string;
  queue: {
    workerEnabled: boolean;
    pending: number;
    processing: number;
    succeeded: number;
    failed: number;
  };
}

function RiskTrendChart({ data }: { data: TrendData["riskTrends"] }) {
  return (
    <Card data-testid="chart-risk-trends">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Systems by Risk Level
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} className="text-muted-foreground" />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} className="text-muted-foreground" />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="high" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.3} name="High/Unacceptable" />
            <Area type="monotone" dataKey="limited" stackId="1" stroke="#eab308" fill="#eab308" fillOpacity={0.3} name="Limited" />
            <Area type="monotone" dataKey="minimal" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} name="Minimal" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function ApprovalTrendChart({ data }: { data: TrendData["approvalTrends"] }) {
  return (
    <Card data-testid="chart-approval-trends">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Approval Throughput
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="submitted" fill="hsl(var(--primary))" name="Submitted" radius={[2, 2, 0, 0]} />
            <Bar dataKey="approved" fill="#22c55e" name="Approved" radius={[2, 2, 0, 0]} />
            <Bar dataKey="rejected" fill="#ef4444" name="Rejected" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function AuditTrendChart({ data }: { data: TrendData["auditTrends"] }) {
  return (
    <Card data-testid="chart-audit-trends">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Audit Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Line type="monotone" dataKey="events" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} name="Events" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function EvidenceTrendChart({ data }: { data: TrendData["evidenceTrends"] }) {
  return (
    <Card data-testid="chart-evidence-trends">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Evidence Attachments
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Area type="monotone" dataKey="total" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={2} name="Total Files" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-md" />
        <Skeleton className="h-64 rounded-md" />
      </div>
    </div>
  );
}

function OperationalReadiness({ ready }: { ready?: ReadyStatus }) {
  const queue = ready?.queue;
  const queueBacklog = (queue?.pending ?? 0) + (queue?.processing ?? 0) + (queue?.failed ?? 0);
  const queuePressure = Math.min(queueBacklog * 20, 100);

  return (
    <Card data-testid="card-operational-readiness">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          Platform Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={ready?.ready ? "default" : "secondary"}>
            {ready?.ready ? "Platform ready" : "Readiness pending"}
          </Badge>
          <Badge variant={queue?.workerEnabled ? "outline" : "secondary"}>
            {queue?.workerEnabled ? "Queue worker enabled" : "Queue worker disabled"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="text-muted-foreground">Pending jobs</p>
            <p className="mt-1 text-lg font-semibold">{queue?.pending ?? 0}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="text-muted-foreground">Failed jobs</p>
            <p className="mt-1 text-lg font-semibold">{queue?.failed ?? 0}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="text-muted-foreground">Processing</p>
            <p className="mt-1 text-lg font-semibold">{queue?.processing ?? 0}</p>
          </div>
          <div className="rounded-md border border-border/70 bg-muted/30 p-3">
            <p className="text-muted-foreground">Succeeded</p>
            <p className="mt-1 text-lg font-semibold">{queue?.succeeded ?? 0}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Queue pressure</span>
            <span>{queueBacklog === 0 ? "Healthy" : `${queueBacklog} active/failing job${queueBacklog === 1 ? "" : "s"}`}</span>
          </div>
          <Progress value={queuePressure} aria-label="Queue pressure" />
        </div>

        <p className="text-xs text-muted-foreground">
          Use the readiness probe, background job health, and audit trail together before promoting changes or chasing a user-reported failure.
        </p>
      </CardContent>
    </Card>
  );
}

function ActionBoard({
  workflows,
  systems,
  controls,
  access,
}: {
  workflows: ApprovalWorkflow[];
  systems: AiSystem[];
  controls: SystemControl[];
  access: DashboardAccess;
}) {
  const inReview = workflows.filter((workflow) => workflow.status === "in_review").length;
  const rejected = workflows.filter((workflow) => workflow.status === "rejected").length;
  const highRisk = systems.filter((system) => system.riskLevel === "high" || system.riskLevel === "unacceptable").length;
  const notStartedControls = controls.filter((control) => control.status === "not_started").length;

  const actions: DashboardNavAction[] = [
    {
      label: "In review now",
      value: inReview,
      href: "/approvals",
      tone: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      accessKey: "canAccessApprovals",
    },
    {
      label: "High-scrutiny systems",
      value: highRisk,
      href: "/registry",
      tone: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      accessKey: "canAccessRegistry",
    },
    {
      label: "Controls not started",
      value: notStartedControls,
      href: "/compliance",
      tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
      accessKey: "canAccessCompliance",
    },
    {
      label: "Rejected workflows",
      value: rejected,
      href: "/audit",
      tone: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
      accessKey: "canAccessAuditLog",
    },
  ];
  const visibleActions = actions.filter((action) => access[action.accessKey]);

  return (
    <Card data-testid="card-action-board">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          Command Shortcuts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {visibleActions.map((action) => (
          <a
            key={action.label}
            href={action.href}
            className="flex items-center justify-between rounded-md border border-border/70 bg-muted/30 px-3 py-2 transition-colors hover:bg-muted/50"
          >
            <div>
              <p className="text-xs text-muted-foreground">{action.label}</p>
              <p className="text-sm font-medium">Open {action.label.toLowerCase()}</p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${action.tone}`}>
              {action.value}
            </span>
          </a>
        ))}

        <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
          <a href="/activity" className="rounded-md border border-border/70 bg-background px-3 py-2 text-center text-muted-foreground transition-colors hover:text-foreground">
            My activity
          </a>
          <a href="/api-docs" className="rounded-md border border-border/70 bg-background px-3 py-2 text-center text-muted-foreground transition-colors hover:text-foreground">
            API docs
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function SetupGuide({
  systems,
  workflows,
  controls,
  ready,
  onboarding,
  access,
}: {
  systems: AiSystem[];
  workflows: ApprovalWorkflow[];
  controls: SystemControl[];
  ready?: ReadyStatus;
  onboarding: AuthOnboardingState | null;
  access: DashboardAccess;
}) {
  const pendingApprovals = workflows.filter((workflow) => workflow.status === "pending" || workflow.status === "in_review").length;
  const failedJobs = ready?.queue.failed ?? 0;
  const highRiskSystems = systems.filter((system) => system.riskLevel === "high" || system.riskLevel === "unacceptable").length;
  const tasks: SetupTask[] = [
    {
      id: "inventory",
      label: "Stand up system inventory",
      summary: systems.length > 0 ? `${systems.length} systems are already registered.` : "Start with the first AI system record.",
      description: "Get every in-scope AI system into the registry with owner, vendor, and risk context.",
      href: "/registry",
      cta: systems.length > 0 ? "Review registry" : "Register systems",
      complete: systems.length > 0,
      accessKey: "canAccessRegistry",
    },
    {
      id: "controls",
      label: "Map controls and risk posture",
      summary: controls.length > 0 ? `${controls.length} controls are already mapped.` : "Load framework controls and assignments.",
      description: highRiskSystems > 0
        ? `${highRiskSystems} systems are high or unacceptable risk and should stay under enhanced control coverage.`
        : "Start assigning controls and validating coverage before approvals scale.",
      href: "/compliance",
      cta: "Open compliance",
      complete: controls.length > 0,
      accessKey: "canAccessCompliance",
    },
    {
      id: "approvals",
      label: "Triage approval workload",
      summary: pendingApprovals > 0 ? `${pendingApprovals} workflows still need review.` : "No approval backlog right now.",
      description: "Keep approval queues and reviewers under control so governance work does not disappear into inboxes.",
      href: "/approvals",
      cta: "Review approvals",
      complete: pendingApprovals === 0,
      accessKey: "canAccessApprovals",
    },
    {
      id: "readiness",
      label: "Validate runtime readiness",
      summary: ready?.ready ? "Readiness probe is green." : "Investigate readiness before rollout.",
      description: failedJobs > 0
        ? `${failedJobs} background job${failedJobs === 1 ? "" : "s"} failed and should be retried from the activity queue.`
        : "Use readiness, queue health, and smoke checks before promoting changes or onboarding more users.",
      href: failedJobs > 0 ? "/settings?tab=activity#background-job-health" : "/api-docs",
      cta: failedJobs > 0 ? "Open activity queue" : "Review API and probes",
      complete: Boolean(ready?.ready),
      accessKey: failedJobs > 0 ? "canAccessSettings" : undefined,
    },
  ];

  const getResolvedStepIndex = (state: AuthOnboardingState | null) => {
    if (state && Number.isInteger(state.currentStep) && state.currentStep >= 0 && state.currentStep < tasks.length) {
      return state.currentStep;
    }
    const firstIncomplete = tasks.findIndex((task) => !task.complete);
    return firstIncomplete >= 0 ? firstIncomplete : 0;
  };

  const [currentStep, setCurrentStep] = useState(() => {
    return getResolvedStepIndex(onboarding);
  });

  const completed = tasks.filter((task) => task.complete).length;
  const completion = Math.round((completed / tasks.length) * 100);
  const activeTask = tasks[currentStep] ?? tasks[0];
  const completedStepIds = tasks.filter((task) => task.complete).map((task) => task.id);

  useEffect(() => {
    setCurrentStep(getResolvedStepIndex(onboarding));
  }, [onboarding?.currentStep, systems.length, controls.length, pendingApprovals, ready?.ready, failedJobs]);

  const saveOnboardingMutation = useMutation({
    mutationFn: async (nextStep: number) => {
      const res = await apiRequest("POST", "/api/auth/onboarding-state", {
        currentStep: nextStep,
        completedSteps: completedStepIds,
        dismissedAlerts: onboarding?.dismissedAlerts ?? [],
        snoozedAlerts: onboarding?.snoozedAlerts ?? {},
      });
      return (await res.json()) as AuthUser;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
    },
  });

  const moveToStep = (nextStep: number) => {
    if (nextStep < 0 || nextStep >= tasks.length) return;
    setCurrentStep(nextStep);
    saveOnboardingMutation.mutate(nextStep);
  };

  return (
    <Card data-testid="card-setup-guide">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          Launch Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Completion</span>
            <span>{completed}/{tasks.length} complete</span>
          </div>
          <Progress value={completion} aria-label="Program setup completion" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {tasks.map((task, index) => (
            <button
              key={task.label}
              type="button"
              onClick={() => moveToStep(index)}
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                index === currentStep
                  ? "border-primary bg-primary/10"
                  : "border-border/70 bg-muted/30 hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">{task.label}</span>
                <Badge variant={task.complete ? "default" : "secondary"} className="shrink-0">
                  {task.complete ? "Done" : "Open"}
                </Badge>
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-md border border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Step {currentStep + 1} of {tasks.length}</p>
              <h3 className="mt-1 text-base font-semibold">{activeTask.label}</h3>
            </div>
            <Badge variant={activeTask.complete ? "default" : "secondary"}>
              {activeTask.complete ? "Complete" : "Needs action"}
            </Badge>
          </div>
          <p className="mt-3 text-sm font-medium">{activeTask.summary}</p>
          <p className="mt-1 text-sm text-muted-foreground">{activeTask.description}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {!activeTask.accessKey || access[activeTask.accessKey] ? (
              <Button asChild size="sm">
                <a href={activeTask.href}>{activeTask.cta}</a>
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                Admin action required
              </Button>
            )}
            {access.canAccessSettings ? (
              <Button asChild size="sm" variant="outline">
                <a href="/settings">Admin setup</a>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={currentStep === 0}
            onClick={() => moveToStep(Math.max(currentStep - 1, 0))}
          >
            Previous
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={currentStep === tasks.length - 1}
            onClick={() => moveToStep(Math.min(currentStep + 1, tasks.length - 1))}
          >
            Next step
          </Button>
        </div>

        {access.canAccessSettings ? (
          <div className="rounded-md border border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
            Admin-owned setup still lives in <a href="/settings" className="font-medium text-foreground underline underline-offset-4">Settings</a>:
            SAML/OIDC, verified domains, invites, member roles, and background job recovery.
          </div>
        ) : null}
        {saveOnboardingMutation.isSuccess ? (
          <p className="text-xs text-muted-foreground">Progress is saved for your current organization.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function OperationalWatchlist({
  ready,
  workflows,
  systems,
  controls,
  onboarding,
  access,
}: {
  ready?: ReadyStatus;
  workflows: ApprovalWorkflow[];
  systems: AiSystem[];
  controls: SystemControl[];
  onboarding: AuthOnboardingState | null;
  access: DashboardAccess;
}) {
  const latestWorkflowAt = workflows
    .filter((workflow) => workflow.status === "pending" || workflow.status === "in_review")
    .map((workflow) => workflow.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0];
  const latestHighRiskAssessmentAt = systems
    .filter((system) => system.riskLevel === "high" || system.riskLevel === "unacceptable")
    .map((system) => system.lastAssessment)
    .filter(Boolean)
    .sort((a, b) => new Date(String(b)).getTime() - new Date(String(a)).getTime())[0];
  const formatRelativeTime = (value?: string | Date | null) => {
    if (!value) return "Observed recently";
    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) return "Observed recently";
    const minutes = Math.max(Math.round((Date.now() - timestamp) / 60000), 0);
    if (minutes < 1) return "Observed just now";
    if (minutes < 60) return `Observed ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Observed ${hours} hour${hours === 1 ? "" : "s"} ago`;
    const days = Math.round(hours / 24);
    return `Observed ${days} day${days === 1 ? "" : "s"} ago`;
  };

  const pendingApprovals = workflows.filter((workflow) => workflow.status === "pending" || workflow.status === "in_review").length;
  const failedJobs = ready?.queue.failed ?? 0;
  const queuePending = ready?.queue.pending ?? 0;
  const highRiskSystems = systems.filter((system) => system.riskLevel === "high" || system.riskLevel === "unacceptable").length;
  const unstartedControls = controls.filter((control) => control.status === "not_started").length;
  const dismissedAlerts = onboarding?.dismissedAlerts ?? [];
  const snoozedAlerts = onboarding?.snoozedAlerts ?? {};
  const severityOrder = {
    critical: 0,
    warning: 1,
    info: 2,
  } as const;

  const alerts = [
    !ready?.ready
      ? {
          key: "readiness_degraded",
          label: "Readiness degraded",
          description: "The platform is not reporting ready. Check readiness and infrastructure before rollout.",
          href: "/api-docs",
          tone: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
          detectedAt: ready?.timestamp ?? null,
          severity: "critical",
          accessKey: undefined as DashboardAccessKey | undefined,
        }
      : null,
    failedJobs > 0
      ? {
          key: "failed_background_jobs",
          label: "Failed background jobs",
          description: `${failedJobs} queued delivery or monitoring job${failedJobs === 1 ? "" : "s"} need attention in the activity queue.`,
          href: "/settings?tab=activity#background-job-health",
          tone: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
          detectedAt: ready?.timestamp ?? null,
          severity: "critical",
          accessKey: "canAccessSettings" as DashboardAccessKey,
        }
      : null,
    queuePending > 10
      ? {
          key: "queue_backlog",
          label: "Queue backlog building",
          description: `${queuePending} jobs are pending. Check worker throughput before that grows into user-visible delay.`,
          href: "/settings?tab=activity#background-job-health",
          tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
          detectedAt: ready?.timestamp ?? null,
          severity: "warning",
          accessKey: "canAccessSettings" as DashboardAccessKey,
        }
      : null,
    pendingApprovals > 25
      ? {
          key: "approval_backlog",
          label: "Approval backlog",
          description: `${pendingApprovals} workflows are still pending or in review.`,
          href: "/approvals",
          tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
          detectedAt: latestWorkflowAt ?? null,
          severity: "warning",
          accessKey: "canAccessApprovals" as DashboardAccessKey,
        }
      : null,
    highRiskSystems > 0
      ? {
          key: "high_risk_systems",
          label: "High-scrutiny systems in scope",
          description: `${highRiskSystems} systems are marked high or unacceptable risk and should stay under enhanced control review.`,
          href: "/registry",
          tone: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
          detectedAt: latestHighRiskAssessmentAt ?? ready?.timestamp ?? null,
          severity: "info",
          accessKey: "canAccessRegistry" as DashboardAccessKey,
        }
      : null,
    unstartedControls > 50
      ? {
          key: "control_gaps",
          label: "Control coverage gaps",
          description: `${unstartedControls} controls are still not started.`,
          href: "/compliance",
          tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
          detectedAt: ready?.timestamp ?? null,
          severity: "warning",
          accessKey: "canAccessCompliance" as DashboardAccessKey,
        }
      : null,
  ].filter(Boolean) as WatchlistAlert[];

  const visibleAlerts = alerts.filter((alert) => {
    if (dismissedAlerts.includes(alert.key)) return false;
    const snoozedUntil = snoozedAlerts[alert.key];
    return !(snoozedUntil && new Date(snoozedUntil).getTime() > Date.now());
  });
  const sortedAlerts = [...visibleAlerts].sort((a, b) => {
    const severityDelta = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDelta !== 0) return severityDelta;
    const aTime = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
    const bTime = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
    return bTime - aTime;
  });
  const groupedAlerts = [
    {
      key: "critical",
      title: "Critical",
      description: "Address these before onboarding more users or promoting changes.",
      items: sortedAlerts.filter((alert) => alert.severity === "critical"),
    },
    {
      key: "warning",
      title: "Warnings",
      description: "These are not outages yet, but they will turn into operational drag if they accumulate.",
      items: sortedAlerts.filter((alert) => alert.severity === "warning"),
    },
    {
      key: "info",
      title: "Informational",
      description: "Signals that still deserve visibility even when no immediate action is required.",
      items: sortedAlerts.filter((alert) => alert.severity === "info"),
    },
  ].filter((group) => group.items.length > 0);

  const persistWatchlistMutation = useMutation({
    mutationFn: async (next: { dismissedAlerts: string[]; snoozedAlerts: Record<string, string> }) => {
      const res = await apiRequest("POST", "/api/auth/onboarding-state", {
        currentStep: onboarding?.currentStep ?? 0,
        completedSteps: onboarding?.completedSteps ?? [],
        dismissedAlerts: next.dismissedAlerts,
        snoozedAlerts: next.snoozedAlerts,
      });
      return (await res.json()) as AuthUser;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
    },
  });

  const dismissAlert = (key: string) => {
    const nextDismissed = Array.from(new Set([...(onboarding?.dismissedAlerts ?? []), key]));
    persistWatchlistMutation.mutate({
      dismissedAlerts: nextDismissed,
      snoozedAlerts: onboarding?.snoozedAlerts ?? {},
    });
  };

  const snoozeAlert = (key: string) => {
    const nextSnoozed = {
      ...(onboarding?.snoozedAlerts ?? {}),
      [key]: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };
    persistWatchlistMutation.mutate({
      dismissedAlerts: onboarding?.dismissedAlerts ?? [],
      snoozedAlerts: nextSnoozed,
    });
  };

  const clearSuppressedAlerts = () => {
    persistWatchlistMutation.mutate({
      dismissedAlerts: [],
      snoozedAlerts: {},
    });
  };

  const suppressedCount =
    dismissedAlerts.length +
    Object.values(snoozedAlerts).filter((value) => new Date(value).getTime() > Date.now()).length;

  return (
    <Card data-testid="card-operational-watchlist">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          Immediate Attention
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sortedAlerts.length === 0 ? (
          <div className="rounded-md border border-border/70 bg-muted/20 px-4 py-6 text-center">
            <p className="text-sm font-medium">No immediate operational alerts.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Readiness is healthy and there are no queue or workflow thresholds currently breaching the watchlist.
            </p>
          </div>
        ) : (
          groupedAlerts.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{group.title}</p>
                  <p className="text-[11px] text-muted-foreground">{group.description}</p>
                </div>
                <Badge variant="outline">{group.items.length}</Badge>
              </div>
              {group.items.map((alert) => (
                <div
                  key={alert.label}
                  className="rounded-md border border-border/70 bg-muted/30 px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{alert.label}</p>
                      <p className="text-xs text-muted-foreground">{alert.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{formatRelativeTime(alert.detectedAt)}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${alert.tone}`}>
                      {group.title}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!alert.accessKey || access[alert.accessKey] ? (
                      <Button asChild size="sm" variant="outline">
                        <a href={alert.href}>Open</a>
                      </Button>
                    ) : (
                      <Button type="button" size="sm" variant="outline" disabled>
                        Admin action required
                      </Button>
                    )}
                    <Button type="button" size="sm" variant="ghost" onClick={() => snoozeAlert(alert.key)}>
                      Snooze 24h
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => dismissAlert(alert.key)}>
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
              {group.key !== groupedAlerts[groupedAlerts.length - 1]?.key ? (
                <div className="border-b border-dashed border-border/70" />
              ) : null}
            </div>
          ))
        )}
        {persistWatchlistMutation.isSuccess ? (
          <p className="text-xs text-muted-foreground">Watchlist preferences are saved for this organization.</p>
        ) : null}
        {suppressedCount > 0 ? (
          <div className="rounded-md border border-dashed border-border/70 bg-background/70 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {suppressedCount} alert{suppressedCount === 1 ? "" : "s"} hidden by dismiss or snooze rules.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={clearSuppressedAlerts}>
                Reset hidden alerts
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const access = getAppAccess(user);
  const { data: systems = [], isLoading: loadingSystems } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: workflows = [], isLoading: loadingWorkflows } = useQuery<ApprovalWorkflow[]>({
    queryKey: ["/api/approval-workflows"],
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const { data: systemControls = [], isLoading: loadingControls } = useQuery<SystemControl[]>({
    queryKey: ["/api/system-controls"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: trends } = useQuery<TrendData>({
    queryKey: ["/api/dashboard/trends"],
    refetchInterval: 30_000,
    staleTime: 10_000,
  });

  const { data: ready } = useQuery<ReadyStatus>({
    queryKey: ["/api/ready"],
    staleTime: 30_000,
  });

  const isLoading = loadingSystems || loadingWorkflows || loadingControls;

  if (isLoading) return (
    <div className="p-6">
      <DashboardSkeleton />
    </div>
  );

  const activeSystems = systems.filter((s) => s.status === "active").length;
  const pendingApprovals = workflows.filter((w) => w.status === "pending" || w.status === "in_review").length;
  const highRiskSystems = systems.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable").length;
  const failedJobs = ready?.queue.failed ?? 0;
  const pendingJobs = ready?.queue.pending ?? 0;
  const controlsNotStarted = systemControls.filter((c) => c.status === "not_started").length;
  const attentionCount = [
    !ready?.ready,
    failedJobs > 0,
    pendingApprovals > 0,
    highRiskSystems > 0,
    controlsNotStarted > 0,
  ].filter(Boolean).length;
  const complianceRate = systemControls.length > 0
    ? Math.round(
        (systemControls.filter((c) => c.status === "verified" || c.status === "implemented").length /
          systemControls.length) *
          100
      )
    : 0;

  return (
    <div className="page-shell" data-testid="page-dashboard">
      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="overflow-hidden border-border/70 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.12),transparent_45%),linear-gradient(to_bottom,hsl(var(--background)),hsl(var(--muted)/0.18))]">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">AI Control Tower</Badge>
                    <Badge variant={ready?.ready ? "default" : "secondary"}>
                      {ready?.ready ? "Platform ready" : "Readiness degraded"}
                    </Badge>
                    <Badge variant="outline">Queue pending {pendingJobs}</Badge>
                  </div>
                  <h1 className="mt-4 text-3xl font-semibold tracking-tight">Governance operations at a glance</h1>
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                    Keep the homepage focused on what actually needs operator attention: system inventory, approval pressure,
                    control coverage, and platform health.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:w-[320px]">
                  <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Systems in scope</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">{systems.length}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{activeSystems} active right now</p>
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Attention items</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">{attentionCount}</p>
                    <p className="mt-1 text-xs text-muted-foreground">Open issues across health, controls, and approvals</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs text-muted-foreground">High-scrutiny systems</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{highRiskSystems}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs text-muted-foreground">Pending approvals</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{pendingApprovals}</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs text-muted-foreground">Coverage rate</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{complianceRate}%</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <p className="text-xs text-muted-foreground">Failed jobs</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{failedJobs}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {access.canAccessRuntimeMonitoring ? (
                  <Button asChild size="sm">
                    <a href="/runtime-monitoring">Open runtime monitoring</a>
                  </Button>
                ) : null}
                {access.canAccessApprovals ? (
                  <Button asChild size="sm" variant="outline">
                    <a href="/approvals">Review approvals</a>
                  </Button>
                ) : null}
                {access.canAccessRegistry ? (
                  <Button asChild size="sm" variant="outline">
                    <a href="/registry">Open registry</a>
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        <OperationalWatchlist
          ready={ready}
          workflows={workflows}
          systems={systems}
          controls={systemControls}
          onboarding={user?.currentOrganizationOnboarding ?? null}
          access={access}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total AI Systems"
          value={systems.length}
          subtitle={`${activeSystems} active`}
          icon={Server}
          trend="+3 this month"
          testId="stat-total-systems"
        />
        <StatCard
          title="High Risk Systems"
          value={highRiskSystems}
          subtitle="Require enhanced controls"
          icon={AlertTriangle}
          testId="stat-high-risk"
        />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          subtitle="Awaiting review"
          icon={Clock}
          testId="stat-pending-approvals"
        />
        <StatCard
          title="Compliance Rate"
          value={`${complianceRate}%`}
          subtitle="Controls implemented"
          icon={ShieldCheck}
          trend="+5% this quarter"
          testId="stat-compliance-rate"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OperationalReadiness ready={ready} />
        <ActionBoard workflows={workflows} systems={systems} controls={systemControls} access={access} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RiskDistribution systems={systems} />
        <ComplianceOverview controls={systemControls} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentSystems systems={systems} />
        <RecentWorkflows workflows={workflows} />
      </div>

      <div className="grid grid-cols-1 gap-4">
        <SetupGuide
          systems={systems}
          workflows={workflows}
          controls={systemControls}
          ready={ready}
          onboarding={user?.currentOrganizationOnboarding ?? null}
          access={access}
        />
      </div>

      {trends && (
        <>
          <div>
            <h2 className="text-base font-semibold tracking-tight mb-1" data-testid="heading-trends">Platform Trendlines</h2>
            <p className="text-xs text-muted-foreground">12-week movement across risk posture, approvals, audit activity, and evidence volume</p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RiskTrendChart data={trends.riskTrends} />
            <ApprovalTrendChart data={trends.approvalTrends} />
            <AuditTrendChart data={trends.auditTrends} />
            <EvidenceTrendChart data={trends.evidenceTrends} />
          </div>
        </>
      )}
    </div>
  );
}
