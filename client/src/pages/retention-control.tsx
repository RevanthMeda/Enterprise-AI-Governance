import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageCopy } from "@/lib/page-copy";

type DecisionAudit = {
  id: string;
  title: string;
  documentationStatus: string;
  retentionUntil: string;
  legalHold: boolean;
  legalHoldReason: string | null;
  archivedAt: string | null;
};

type RetentionSummary = {
  total: number;
  active: number;
  archived: number;
  dueForArchive: number;
  underLegalHold: number;
  workerEnabled: boolean;
};

export default function RetentionControlPage() {
  const pageCopy = usePageCopy();
  const { toast } = useToast();
  const [reasons, setReasons] = useState<Record<string, string>>({});

  const summaryQuery = useQuery<RetentionSummary>({
    queryKey: ["/api/decision-audits/retention-summary"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/decision-audits/retention-summary");
      return response.json();
    },
  });

  const auditsQuery = useQuery<DecisionAudit[]>({
    queryKey: ["/api/decision-audits", "retention"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/decision-audits");
      return response.json();
    },
  });

  const legalHoldMutation = useMutation({
    mutationFn: async ({ auditId, enabled }: { auditId: string; enabled: boolean }) => {
      const response = await apiRequest("POST", `/api/decision-audits/${auditId}/legal-hold`, {
        enabled,
        reason: enabled ? reasons[auditId] ?? "" : null,
      });
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits", "retention"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits/retention-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits/summary"] }),
      ]);
      toast({ title: "Retention control updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update legal hold", description: error.message, variant: "destructive" });
    },
  });

  const enforceMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/decision-audits/retention-enforce");
      return response.json();
    },
    onSuccess: async (payload: { archived: number }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits", "retention"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits/retention-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/decision-audits/summary"] }),
      ]);
      toast({ title: "Retention enforcement completed", description: `${payload.archived} decision traces archived.` });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to run retention enforcement", description: error.message, variant: "destructive" });
    },
  });

  if (summaryQuery.isLoading || auditsQuery.isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const summary = summaryQuery.data ?? {
    total: 0,
    active: 0,
    archived: 0,
    dueForArchive: 0,
    underLegalHold: 0,
    workerEnabled: false,
  };
  const audits = (auditsQuery.data ?? []).slice(0, 25);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{pageCopy.retentionControl.title}</h1>
          <p className="text-sm text-muted-foreground">
            {pageCopy.retentionControl.description}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline">{summary.workerEnabled ? pageCopy.retentionControl.badges?.workerEnabled : pageCopy.retentionControl.badges?.workerDisabled}</Badge>
          <Button onClick={() => enforceMutation.mutate()} disabled={enforceMutation.isPending}>
            {enforceMutation.isPending ? "Archiving..." : "Run retention now"}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Total traces" value={summary.total} />
        <SummaryCard label="Active" value={summary.active} />
        <SummaryCard label="Archived" value={summary.archived} />
        <SummaryCard label="Due for archive" value={summary.dueForArchive} />
        <SummaryCard label="Legal holds" value={summary.underLegalHold} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Recent decision traces</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {audits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decision traces found.</p>
          ) : (
            audits.map((audit) => (
              <div key={audit.id} className="rounded-lg border p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{audit.title}</p>
                      <Badge variant="secondary">{audit.documentationStatus}</Badge>
                      {audit.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
                      {audit.legalHold ? <Badge variant="destructive">Legal hold</Badge> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Retention until {new Date(audit.retentionUntil).toLocaleDateString()}
                    </p>
                    {audit.legalHoldReason ? (
                      <p className="text-sm text-muted-foreground">Hold reason: {audit.legalHoldReason}</p>
                    ) : null}
                  </div>
                  <div className="grid gap-2 md:w-[320px]">
                    <Input
                      value={reasons[audit.id] ?? audit.legalHoldReason ?? ""}
                      onChange={(event) => setReasons((current) => ({ ...current, [audit.id]: event.target.value }))}
                      placeholder="Legal hold reason"
                      disabled={Boolean(audit.archivedAt)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant={audit.legalHold ? "outline" : "default"}
                        className="flex-1"
                        disabled={Boolean(audit.archivedAt) || legalHoldMutation.isPending}
                        onClick={() => legalHoldMutation.mutate({ auditId: audit.id, enabled: !audit.legalHold })}
                      >
                        {audit.legalHold ? "Release hold" : "Apply hold"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  );
}
