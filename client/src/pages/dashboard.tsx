import { useQuery } from "@tanstack/react-query";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { AiSystem, ApprovalWorkflow, SystemControl } from "@shared/schema";

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
          Risk Distribution
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
          Compliance Status
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
          Recent Approval Workflows
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
          Recently Added Systems
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

export default function Dashboard() {
  const { data: systems = [], isLoading: loadingSystems } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
  });

  const { data: workflows = [], isLoading: loadingWorkflows } = useQuery<ApprovalWorkflow[]>({
    queryKey: ["/api/approval-workflows"],
  });

  const { data: systemControls = [], isLoading: loadingControls } = useQuery<SystemControl[]>({
    queryKey: ["/api/system-controls"],
  });

  const { data: trends } = useQuery<TrendData>({
    queryKey: ["/api/dashboard/trends"],
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
  const complianceRate = systemControls.length > 0
    ? Math.round(
        (systemControls.filter((c) => c.status === "verified" || c.status === "implemented").length /
          systemControls.length) *
          100
      )
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-dashboard">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Control Tower</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Enterprise AI governance overview
        </p>
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
        <RiskDistribution systems={systems} />
        <ComplianceOverview controls={systemControls} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentSystems systems={systems} />
        <RecentWorkflows workflows={workflows} />
      </div>

      {trends && (
        <>
          <div>
            <h2 className="text-base font-semibold tracking-tight mb-1" data-testid="heading-trends">Trend Analytics</h2>
            <p className="text-xs text-muted-foreground">12-week operational trends across the platform</p>
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
