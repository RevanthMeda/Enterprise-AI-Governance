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
  const [selectedControlId, setSelectedControlId] = useState<string | null>(null);
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
      <div className="page-shell">
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
  const verifiedCount = systemControls.filter((control) => control.status === "verified").length;
  const implementedCount = systemControls.filter((control) => control.status === "implemented").length;
  const inProgressCount = systemControls.filter((control) => control.status === "in_progress").length;
  const notStartedCount = systemControls.filter((control) => control.status === "not_started").length;
  const overallCoverage = systemControls.length
    ? Math.round(((verifiedCount + implementedCount) / systemControls.length) * 100)
    : 0;
  const controlRows = frameworkControls.map((control) => ({
    control,
    systemControl: filteredSystemControls.find((s) => s.controlId === control.id) ?? null,
  }));
  const selectedRow =
    controlRows.find((row) => row.control.id === selectedControlId) ??
    controlRows[0] ??
    null;
  const selectedStatus = selectedRow?.systemControl?.status ?? "not_started";
  const SelectedStatusIcon = statusIcons[selectedStatus] ?? XCircle;

  return (
    <div className="page-shell" data-testid="page-compliance">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Compliance Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Evidence-first control tracking across EU AI Act, NIST AI RMF, and ISO/IEC 42001.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportComplianceSummaryCsv(systems, systemControls, controls)} data-testid="button-export-compliance">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Overall coverage</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{overallCoverage}%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Verified</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{verifiedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Implemented</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{implementedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Needs attention</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{inProgressCount + notStartedCount}</p>
          </CardContent>
        </Card>
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
              Control register
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
                {frameworkControls.length === 0 ? (
                  <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                    No controls defined for this framework.
                  </div>
                ) : (
                  <div className="grid items-start gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="rounded-lg border bg-muted/10 p-2 xl:max-h-[calc(100vh-24rem)] xl:overflow-y-auto">
                      <div className="space-y-2">
                        {controlRows.map((row) => (
                          <button
                            key={row.control.id}
                            type="button"
                            onClick={() => setSelectedControlId(row.control.id)}
                            className={`w-full rounded-lg border p-3 text-left transition-colors ${
                              selectedRow?.control.id === row.control.id ? "border-primary bg-primary/5" : "hover:bg-muted/30"
                            }`}
                            data-testid={`row-control-${row.control.id}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-mono text-muted-foreground">{row.control.controlId}</div>
                                <div className="mt-1 text-sm font-medium">{row.control.controlName}</div>
                              </div>
                              <Badge className={statusBadgeColors[row.systemControl?.status || "not_started"]}>
                                {(row.systemControl?.status || "not_started").replace("_", " ")}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                              <span>{row.control.category || "General"}</span>
                              <span>•</span>
                              <span>{row.systemControl?.assignee || "Unassigned"}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {selectedRow ? (
                      <div className="rounded-lg border p-4 xl:max-h-[calc(100vh-24rem)] xl:overflow-y-auto">
                        <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className="text-xs font-mono text-muted-foreground">{selectedRow.control.controlId}</div>
                            <div className="mt-1 text-lg font-semibold">{selectedRow.control.controlName}</div>
                            <div className="mt-1 text-xs text-muted-foreground">{selectedRow.control.category || "General"} • {frameworkLabels[activeTab]}</div>
                          </div>
                          <Badge className={statusBadgeColors[selectedStatus]}>
                            {selectedStatus.replace("_", " ")}
                          </Badge>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                          <DetailMeta label="Mapped system" value={selectedRow.systemControl ? (systems.find((system) => system.id === selectedRow.systemControl?.systemId)?.name || selectedRow.systemControl.systemId) : "Not mapped"} />
                          <DetailMeta label="Assignee" value={selectedRow.systemControl?.assignee || "Unassigned"} />
                          <DetailMeta label="Evidence" value={selectedRow.systemControl ? "Attach or review evidence below" : "Map this control first"} />
                        </div>

                        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
                          <div className="space-y-4">
                            <SectionPanel title="Control description">
                              <p className="text-sm text-muted-foreground">{selectedRow.control.description || "No control description recorded."}</p>
                            </SectionPanel>

                            <SectionPanel title="Status update">
                              {selectedRow.systemControl ? (
                                <div className="space-y-3">
                                  <div className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${statusColors[selectedStatus]}`}>
                                    <SelectedStatusIcon className="h-4 w-4" />
                                    <span>Current status: {selectedStatus.replace("_", " ")}</span>
                                  </div>
                                  <Select
                                    value={selectedRow.systemControl.status}
                                    onValueChange={(val) => {
                                      const requiresEvidenceNote = val === "implemented" || val === "verified";
                                      const promptedNotes = requiresEvidenceNote
                                        ? window.prompt(
                                            `Add evidence notes or reviewer rationale before marking this control as ${val.replace("_", " ")}. Leave blank only if you already attached evidence files.`,
                                            selectedRow.systemControl?.notes || "",
                                          )
                                        : "";
                                      if (requiresEvidenceNote && promptedNotes === null) {
                                        return;
                                      }
                                      const notes = typeof promptedNotes === "string" ? promptedNotes.trim() : "";
                                      updateStatusMutation.mutate({ id: selectedRow.systemControl.id, status: val, notes });
                                    }}
                                  >
                                    <SelectTrigger className="max-w-[220px]" data-testid={`select-status-${selectedRow.control.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="not_started">Not Started</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="implemented">Implemented</SelectItem>
                                      <SelectItem value="verified">Verified</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              ) : (
                                <div className="text-sm text-muted-foreground">This control is not mapped for the selected system filter.</div>
                              )}
                            </SectionPanel>
                          </div>

                          <div className="space-y-4">
                            <SectionPanel title="Evidence workspace">
                              {selectedRow.systemControl ? (
                                <EvidenceUpload systemId={selectedRow.systemControl.systemId} controlId={selectedRow.systemControl.controlId} />
                              ) : (
                                <p className="text-sm text-muted-foreground">Evidence becomes available once the control is mapped to a system.</p>
                              )}
                            </SectionPanel>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}
