import { useQuery } from "@tanstack/react-query";
import { Activity, FileText, Server, ShieldCheck, ClipboardCheck, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { exportAuditTrailCsv } from "@/lib/export-utils";
import type { AuditLog } from "@shared/schema";

const entityIcons: Record<string, any> = {
  ai_system: Server,
  approval_workflow: FileText,
  system_control: ClipboardCheck,
  compliance: ShieldCheck,
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
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["/api/audit-logs"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-16 rounded-md" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-audit-log">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Audit Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Complete audit trail of all governance activities
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportAuditTrailCsv(logs)} data-testid="button-export-audit">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <Activity className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-medium mb-1">No audit entries</h3>
              <p className="text-xs text-muted-foreground">Activity will appear here as you use the platform</p>
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
