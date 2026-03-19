import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ClipboardCheck,
  CheckCircle2,
  Clock,
  XCircle,
  ShieldCheck,
  Filter,
  Download,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EvidenceUpload } from "@/components/evidence-upload";
import { exportComplianceSummaryCsv } from "@/lib/export-utils";
import type { ComplianceControl, SystemControl, AiSystem } from "@shared/schema";

const frameworkLabels: Record<string, string> = {
  eu_ai_act: "EU AI Act",
  nist_ai_rmf: "NIST AI RMF",
  iso_42001: "ISO/IEC 42001",
};

const statusIcons: Record<string, any> = {
  verified: CheckCircle2,
  implemented: ShieldCheck,
  in_progress: Clock,
  not_started: XCircle,
};

const statusColors: Record<string, string> = {
  verified: "text-green-600 dark:text-green-400",
  implemented: "text-blue-600 dark:text-blue-400",
  in_progress: "text-yellow-600 dark:text-yellow-400",
  not_started: "text-muted-foreground",
};

const statusBadgeColors: Record<string, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  implemented: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  not_started: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

function FrameworkCard({
  framework,
  controls,
  systemControls,
}: {
  framework: string;
  controls: ComplianceControl[];
  systemControls: SystemControl[];
}) {
  const frameworkControls = controls.filter((c) => c.framework === framework);
  const mappedControls = systemControls.filter((sc) =>
    frameworkControls.some((fc) => fc.id === sc.controlId)
  );

  const total = mappedControls.length || 1;
  const verified = mappedControls.filter((c) => c.status === "verified").length;
  const implemented = mappedControls.filter((c) => c.status === "implemented").length;
  const completionRate = Math.round(((verified + implemented) / total) * 100);

  return (
    <Card data-testid={`card-framework-${framework}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-1 mb-3">
          <div>
            <h3 className="text-sm font-semibold">{frameworkLabels[framework]}</h3>
            <p className="text-[11px] text-muted-foreground">
              {frameworkControls.length} controls defined
            </p>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold">{completionRate}%</span>
            <p className="text-[10px] text-muted-foreground">complete</p>
          </div>
        </div>
        <Progress value={completionRate} className="h-2" />
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
            <span className="text-[10px]">{verified}</span>
          </div>
          <div className="flex items-center gap-1">
            <ShieldCheck className="h-3 w-3 text-blue-600 dark:text-blue-400" />
            <span className="text-[10px]">{implemented}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
            <span className="text-[10px]">{mappedControls.filter((c) => c.status === "in_progress").length}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Compliance() {
  const [activeTab, setActiveTab] = useState("eu_ai_act");
  const [systemFilter, setSystemFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: controls = [], isLoading: loadingControls } = useQuery<ComplianceControl[]>({
    queryKey: ["/api/compliance-controls"],
  });

  const { data: systemControls = [], isLoading: loadingSC } = useQuery<SystemControl[]>({
    queryKey: ["/api/system-controls"],
  });

  const { data: systems = [] } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      await apiRequest("PATCH", `/api/system-controls/${id}`, {
        status,
        ...(notes ? { notes } : {}),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-controls"] });
      toast({ title: "Control status updated" });
    },
  });

  const isLoading = loadingControls || loadingSC;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 rounded-md" />)}
        </div>
        <Skeleton className="h-96 rounded-md" />
      </div>
    );
  }

  const frameworkControls = controls.filter((c) => c.framework === activeTab);
  const filteredSystemControls = systemControls.filter((sc) => {
    const matchesFramework = frameworkControls.some((fc) => fc.id === sc.controlId);
    const matchesSystem = systemFilter === "all" || sc.systemId === systemFilter;
    return matchesFramework && matchesSystem;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-compliance">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Compliance Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Control mapping across EU AI Act, NIST AI RMF, and ISO/IEC 42001
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportComplianceSummaryCsv(systems, systemControls, controls)} data-testid="button-export-compliance">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {["eu_ai_act", "nist_ai_rmf", "iso_42001"].map((fw) => (
          <FrameworkCard
            key={fw}
            framework={fw}
            controls={controls}
            systemControls={systemControls}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
              Control Details
            </CardTitle>
            <Select value={systemFilter} onValueChange={setSystemFilter}>
              <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-system-filter">
                <Filter className="h-3.5 w-3.5 mr-1.5" />
                <SelectValue placeholder="Filter by system" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Systems</SelectItem>
                {systems.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4" data-testid="tabs-framework">
              <TabsTrigger value="eu_ai_act" data-testid="tab-eu-ai-act">EU AI Act</TabsTrigger>
              <TabsTrigger value="nist_ai_rmf" data-testid="tab-nist">NIST AI RMF</TabsTrigger>
              <TabsTrigger value="iso_42001" data-testid="tab-iso">ISO 42001</TabsTrigger>
            </TabsList>

            {["eu_ai_act", "nist_ai_rmf", "iso_42001"].map((fw) => (
              <TabsContent key={fw} value={fw}>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-[100px]">Control ID</TableHead>
                        <TableHead className="text-xs">Control Name</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs w-[120px]">Status</TableHead>
                        <TableHead className="text-xs w-[120px]">Evidence</TableHead>
                        <TableHead className="text-xs w-[100px]">Assignee</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {frameworkControls.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <p className="text-sm text-muted-foreground">No controls defined for this framework</p>
                          </TableCell>
                        </TableRow>
                      ) : (
                        frameworkControls.map((control) => {
                          const sc = filteredSystemControls.find((s) => s.controlId === control.id);
                          const StatusIcon = statusIcons[sc?.status || "not_started"];
                          return (
                            <TableRow key={control.id} data-testid={`row-control-${control.id}`}>
                              <TableCell className="text-xs font-mono">{control.controlId}</TableCell>
                              <TableCell>
                                <div>
                                  <span className="text-xs font-medium">{control.controlName}</span>
                                  {control.description && (
                                    <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                      {control.description}
                                    </p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-[11px] text-muted-foreground">{control.category || "General"}</span>
                              </TableCell>
                              <TableCell>
                                {sc ? (
                                  <Select
                                    value={sc.status}
                                    onValueChange={(val) => {
                                      const requiresEvidenceNote = val === "implemented" || val === "verified";
                                      const promptedNotes = requiresEvidenceNote
                                        ? window.prompt(
                                            `Add evidence notes or reviewer rationale before marking this control as ${val.replace("_", " ")}. Leave blank only if you already attached evidence files.`,
                                            sc.notes || "",
                                          )
                                        : "";
                                      if (requiresEvidenceNote && promptedNotes === null) {
                                        return;
                                      }
                                      const notes = typeof promptedNotes === "string" ? promptedNotes.trim() : "";
                                      updateStatusMutation.mutate({ id: sc.id, status: val, notes });
                                    }}
                                  >
                                    <SelectTrigger className="h-7 text-[10px]" data-testid={`select-status-${control.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="not_started">Not Started</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="implemented">Implemented</SelectItem>
                                      <SelectItem value="verified">Verified</SelectItem>
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className={`inline-flex items-center gap-1 text-[10px] ${statusColors["not_started"]}`}>
                                    <XCircle className="h-3 w-3" /> Not Mapped
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {sc ? (
                                  <EvidenceUpload compact systemId={sc.systemId} controlId={sc.controlId} />
                                ) : (
                                  <span className="text-[11px] text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-[11px] text-muted-foreground">
                                {sc?.assignee || "-"}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
