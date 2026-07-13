import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, Fingerprint, ShieldAlert, Signal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageCopy } from "@/lib/page-copy";

type ExitReadinessMetric = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  target: string;
  status: "green" | "yellow" | "red";
  detail: string;
};

type ExitReadinessResponse = {
  metrics: ExitReadinessMetric[];
  summary: {
    workflows: number;
    traces: number;
    tracedWorkflows: number;
    openIncidents: number;
    highSeverityIncidents: number;
    telemetryAlerts: number;
    tierBreakdown: {
      tier1: number;
      tier2: number;
      tier3: number;
    };
  };
};

const statusColors: Record<ExitReadinessMetric["status"], string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  yellow: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  red: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

export default function ExitReadinessPage() {
  const pageCopy = usePageCopy();
  const readinessQuery = useQuery<ExitReadinessResponse>({
    queryKey: ["/api/dashboard/exit-readiness"],
  });

  const readiness = readinessQuery.data;
  const isFreshProgram = Boolean(readiness) && readiness!.summary.workflows === 0 && readiness!.summary.traces === 0;
  const summaryValue = (value: number | undefined) => readinessQuery.isError || !readiness ? "—" : (value ?? 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.exitReadiness.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.exitReadiness.description}
          </p>
        </div>
        <Badge variant="outline" className="w-fit">{pageCopy.exitReadiness.badges?.diligenceMode}</Badge>
      </div>

      {readinessQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>Exit readiness could not be loaded</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>Readiness values are shown as unavailable so a request failure is not mistaken for an unstarted program.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void readinessQuery.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {readinessQuery.isLoading
          ? [...Array(6)].map((_, index) => <Skeleton key={index} className="h-36 w-full" />)
          : readiness?.metrics.map((metric) => (
              <Card key={metric.key}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold">{metric.label}</CardTitle>
                    <Badge className={statusColors[metric.status]}>{metric.status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="text-3xl font-semibold tracking-tight">
                    {metric.value === null ? "N/A" : `${metric.value}${metric.unit}`}
                  </div>
                  <div className="text-xs text-muted-foreground">Target: {metric.target}</div>
                  <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {metric.detail}
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {isFreshProgram ? (
        <Card className="border-dashed">
          <CardContent className="p-4 text-sm text-muted-foreground">
            This organization has not logged approval workflows or decision traces yet. Red KPI states here reflect an unstarted program baseline, not a live operational failure.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Evidence coverage snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <SummaryMetric label="Approval workflows" value={summaryValue(readiness?.summary.workflows)} icon={Fingerprint} />
            <SummaryMetric label="Decision traces" value={summaryValue(readiness?.summary.traces)} icon={Signal} />
            <SummaryMetric label="Linked workflow traces" value={summaryValue(readiness?.summary.tracedWorkflows)} icon={ArrowRight} />
            <SummaryMetric label="Open incidents" value={summaryValue(readiness?.summary.openIncidents)} icon={AlertTriangle} />
            <SummaryMetric label="High severity incidents" value={summaryValue(readiness?.summary.highSeverityIncidents)} icon={ShieldAlert} />
            <SummaryMetric label="Telemetry alerts" value={summaryValue(readiness?.summary.telemetryAlerts)} icon={Signal} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Routing posture</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <TierRow label="Tier 1" value={summaryValue(readiness?.summary.tierBreakdown.tier1)} detail="Auto-logged technical-team decisions with low reversibility risk." />
            <TierRow label="Tier 2" value={summaryValue(readiness?.summary.tierBreakdown.tier2)} detail="Operations Committee workflow coverage for customer, PII, or mid-impact decisions." />
            <TierRow label="Tier 3" value={summaryValue(readiness?.summary.tierBreakdown.tier3)} detail="Governance Committee + CEO gated decisions for strategic, irreversible, or high-impact workflows." />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">How these percentages are calculated</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <ExplanationRow
            label="Decision documentation rate"
            detail="Linked workflow traces divided by approval workflows. It rises only when a workflow has a connected decision trace."
          />
          <ExplanationRow
            label="Override rationale capture"
            detail="Overrides with a documented rationale divided by traced decisions with human overrides."
          />
          <ExplanationRow
            label="Outcome tracking"
            detail="Decision traces with a populated 90-day outcome record divided by total decision traces."
          />
          <ExplanationRow
            label="Incident containment"
            detail="Average hours between incident detection and containment for incidents that actually reached containment."
          />
          <ExplanationRow
            label="Telemetry alerts"
            detail="Critical plus warning telemetry outcomes. These are operational signals, not proof that a system is non-compliant."
          />
          <ExplanationRow
            label="Evidence expectation"
            detail="Uploading files alone does not complete governance. Controls, workflows, traces, and incident records all contribute to coverage."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Fingerprint;
}) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  );
}

function TierRow({ label, value, detail }: { label: string; value: number | string; detail: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{label}</div>
        <Badge variant="outline">{value}</Badge>
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}

function ExplanationRow({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-4">
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 text-sm text-muted-foreground">{detail}</div>
    </div>
  );
}
