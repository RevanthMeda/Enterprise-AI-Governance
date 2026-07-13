import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Gauge, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { usePageCopy } from "@/lib/page-copy";
import type { GovernanceMaturityResponse } from "@shared/governance-maturity";

const levelLabels: Record<GovernanceMaturityResponse["level"], string> = {
  ad_hoc: "Ad hoc",
  reactive: "Reactive",
  proactive: "Proactive",
  optimized: "Optimized",
  predictive: "Predictive",
};

const levelBadgeTones: Record<GovernanceMaturityResponse["level"], string> = {
  ad_hoc: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
  reactive: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  proactive: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  optimized: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  predictive: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

export default function GovernanceMaturityPage() {
  const pageCopy = usePageCopy();
  const maturityQuery = useQuery<GovernanceMaturityResponse>({
    queryKey: ["/api/governance-maturity"],
  });

  const data = maturityQuery.data;

  if (maturityQuery.isError) {
    return (
      <div className="page-shell">
        <h1 className="text-2xl font-semibold tracking-tight">{pageCopy.governanceMaturity.title}</h1>
        <Alert variant="destructive">
          <AlertTitle>Governance maturity could not be loaded</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>No maturity score is shown because the assessment data is unavailable.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void maturityQuery.refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (maturityQuery.isLoading || !data) {
    return (
      <div className="page-shell">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[420px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="page-shell" data-testid="page-governance-maturity">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{pageCopy.governanceMaturity.title}</h1>
            <Badge className={levelBadgeTones[data.level]}>{levelLabels[data.level]}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {data.headline || pageCopy.governanceMaturity.description}
          </p>
        </div>
        <Card className="min-w-[280px]">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Overall maturity score</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-3xl font-semibold tracking-tight">{data.percent}%</div>
                <div className="text-xs text-muted-foreground">
                  {data.overallScore}/{data.maxScore} weighted points
                </div>
              </div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Gauge className="h-5 w-5" />
              </div>
            </div>
            <Progress value={data.percent} className="h-2" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Strongest domain" value={data.strengths[0] ?? "No strength recorded yet"} icon={Sparkles} />
        <MetricCard label="Primary gap" value={data.gaps[0] ?? "No gap recorded yet"} icon={ArrowRight} />
        <MetricCard label="Assessment time" value={new Date(data.generatedAt).toLocaleString()} icon={TrendingUp} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Domain scorecard</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.domains.map((domain) => (
              <div key={domain.key} className="rounded-xl border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-sm font-semibold">{domain.label}</div>
                    <p className="mt-1 text-sm text-muted-foreground">{domain.summary}</p>
                  </div>
                  <Badge variant="outline">
                    {domain.score}/{domain.maxScore}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  <Progress value={domain.percent} className="h-2" />
                  <div className="text-xs text-muted-foreground">{domain.percent}% maturity in this domain</div>
                </div>
                <div className="mt-3 grid gap-2">
                  {domain.nextActions.map((action) => (
                    <div key={action} className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                      {action}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Program strengths</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.strengths.map((item) => (
                <div key={item} className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-500" />
                    <span>{item}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">Improvement roadmap</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.gaps.map((item) => (
                <div key={item} className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  {item}
                </div>
              ))}
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                This score is computed from live platform posture: inventory quality, control coverage, telemetry guardrails,
                evidence discipline, and identity/operating readiness.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Gauge;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-sm text-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
