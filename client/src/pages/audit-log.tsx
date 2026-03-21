import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, FileText, Server, ShieldCheck, ClipboardCheck, Download, Filter, X, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { exportAuditTrailCsv } from "@/lib/export-utils";
import { resolveApiUrl } from "@/lib/api-url";
import { captureCsrfTokenFromResponse } from "@/lib/queryClient";
import type { AuditLog } from "@shared/schema";

const entityIcons: Record<string, any> = {
  ai_system: Server,
  approval_workflow: FileText,
  system_control: ClipboardCheck,
  compliance: ShieldCheck,
  evidence_file: FileText,
};

const actionColors: Record<string, string> = {
  created: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  updated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  deleted: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  rejected: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  status_changed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function AuditLogPage() {
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actorSearch, setActorSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = actionFilter !== "all" || entityFilter !== "all" || actorSearch !== "" || dateFrom !== "" || dateTo !== "";

  const queryParams = new URLSearchParams();
  if (actionFilter !== "all") queryParams.set("action", actionFilter);
  if (entityFilter !== "all") queryParams.set("entityType", entityFilter);
  if (actorSearch) queryParams.set("performedBy", actorSearch);
  if (dateFrom) queryParams.set("dateFrom", dateFrom);
  if (dateTo) queryParams.set("dateTo", dateTo);

  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs", queryParams.toString()],
    refetchInterval: 15_000,
    staleTime: 5_000,
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/audit-logs?${queryParams.toString()}`), { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
  });

  const clearFilters = () => {
    setActionFilter("all");
    setEntityFilter("all");
    setActorSearch("");
    setDateFrom("");
    setDateTo("");
  };

  if (isLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell" data-testid="page-audit-log">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete audit trail of all governance activities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={showFilters ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-audit-filters"
          >
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">!</span>
            )}
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAuditTrailCsv(logs)} data-testid="button-export-audit">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/30 border" data-testid="panel-audit-filters">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-action-filter">
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="created">Created</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="deleted">Deleted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="status_changed">Status Changed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger className="w-[160px]" data-testid="select-entity-filter">
              <SelectValue placeholder="Entity Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              <SelectItem value="ai_system">AI System</SelectItem>
              <SelectItem value="approval_workflow">Workflow</SelectItem>
              <SelectItem value="system_control">Control</SelectItem>
              <SelectItem value="evidence_file">Evidence</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Actor name..."
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              className="pl-7 w-[150px]"
              data-testid="input-actor-filter"
            />
          </div>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[140px]"
            placeholder="From date"
            data-testid="input-date-from"
          />
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[140px]"
            placeholder="To date"
            data-testid="input-date-to"
          />
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-audit-filters">
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
          )}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Activity Timeline
            <span className="text-[10px] font-normal text-muted-foreground ml-1">({logs.length} entries)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Activity className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-medium mb-1">
                {hasActiveFilters ? "No entries match your filters" : "No audit entries"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {hasActiveFilters ? "Try adjusting your filters" : "Activity will appear here as you use the platform"}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
              <div className="space-y-1">
                {logs.map((log) => {
                  const Icon = entityIcons[log.entityType] || Activity;
                  return (
                    <div
                      key={log.id}
                      className="relative flex items-start gap-3 pl-10 py-2.5"
                      data-testid={`audit-entry-${log.id}`}
                    >
                      <div className="absolute left-2 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-background border">
                        <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${actionColors[log.action] || "bg-muted text-muted-foreground"}`}>
                              {log.action.replace("_", " ")}
                            </span>
                            <span className="text-xs font-medium">{log.entityType.replace("_", " ")}</span>
                          </div>
                          {log.details && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">{log.details}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{log.performedBy}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
