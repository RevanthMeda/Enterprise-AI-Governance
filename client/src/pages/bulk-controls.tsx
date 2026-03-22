import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Layers,
  CheckSquare,
  ArrowRight,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { usePageCopy } from "@/lib/page-copy";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AiSystem, ComplianceControl } from "@shared/schema";

const frameworkLabels: Record<string, string> = {
  eu_ai_act: "EU AI Act",
  nist_ai_rmf: "NIST AI RMF",
  iso_42001: "ISO/IEC 42001",
};

const riskColors: Record<string, string> = {
  unacceptable: "destructive",
  high: "destructive",
  limited: "secondary",
  minimal: "outline",
};

export default function BulkControls() {
  const pageCopy = usePageCopy();
  const [selectedSystems, setSelectedSystems] = useState<Set<string>>(new Set());
  const [selectedControls, setSelectedControls] = useState<Set<string>>(new Set());
  const [frameworkFilter, setFrameworkFilter] = useState<string>("all");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();

  const { data: systems, isLoading: systemsLoading } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
  });

  const { data: controls, isLoading: controlsLoading } = useQuery<ComplianceControl[]>({
    queryKey: ["/api/compliance-controls"],
  });

  const filteredControls = useMemo(() => {
    if (!controls) return [];
    if (frameworkFilter === "all") return controls;
    return controls.filter((c) => c.framework === frameworkFilter);
  }, [controls, frameworkFilter]);

  const toggleSystem = (id: string) => {
    setSelectedSystems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllSystems = () => {
    if (!systems) return;
    if (selectedSystems.size === systems.length) {
      setSelectedSystems(new Set());
    } else {
      setSelectedSystems(new Set(systems.map((s) => s.id)));
    }
  };

  const toggleControl = (id: string) => {
    setSelectedControls((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllControls = () => {
    if (selectedControls.size === filteredControls.length) {
      setSelectedControls(new Set());
    } else {
      setSelectedControls(new Set(filteredControls.map((c) => c.id)));
    }
  };

  const totalAssignments = selectedSystems.size * selectedControls.size;

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/system-controls/bulk", {
        systemIds: Array.from(selectedSystems),
        controlIds: Array.from(selectedControls),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Controls Assigned",
        description: `${data.total} new assignments created${data.skipped > 0 ? `, ${data.skipped} duplicates skipped` : ""}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/system-controls"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      setSelectedSystems(new Set());
      setSelectedControls(new Set());
      setConfirmOpen(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Assignment Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const isLoading = systemsLoading || controlsLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">{pageCopy.bulkControls.title}</h1>
        <p className="text-sm text-muted-foreground mt-1" data-testid="text-page-description">
          {pageCopy.bulkControls.description}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-base">Select Systems</CardTitle>
            <Badge variant="secondary" data-testid="badge-systems-count">
              {selectedSystems.size} / {systems?.length || 0}
            </Badge>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-auto space-y-1">
              <div className="flex items-center gap-2 pb-2 border-b mb-2">
                <Checkbox
                  checked={systems && systems.length > 0 && selectedSystems.size === systems.length}
                  onCheckedChange={toggleAllSystems}
                  data-testid="checkbox-select-all-systems"
                />
                <span className="text-xs font-medium text-muted-foreground">Select All</span>
              </div>
              {systems?.map((system) => (
                <label
                  key={system.id}
                  className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                  data-testid={`row-system-${system.id}`}
                >
                  <Checkbox
                    checked={selectedSystems.has(system.id)}
                    onCheckedChange={() => toggleSystem(system.id)}
                    data-testid={`checkbox-system-${system.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-system-name-${system.id}`}>
                      {system.name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {system.department || "No department"}
                    </p>
                  </div>
                  <Badge
                    variant={riskColors[system.riskLevel] as any || "outline"}
                    data-testid={`badge-risk-${system.id}`}
                  >
                    {system.riskLevel}
                  </Badge>
                </label>
              ))}
              {(!systems || systems.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">No systems found</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
            <CardTitle className="text-base">Select Controls</CardTitle>
            <Badge variant="secondary" data-testid="badge-controls-count">
              {selectedControls.size} / {filteredControls.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
              <SelectTrigger data-testid="select-framework-filter">
                <SelectValue placeholder="Filter by framework" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Frameworks</SelectItem>
                {Object.entries(frameworkLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="max-h-80 overflow-auto space-y-1">
              <div className="flex items-center gap-2 pb-2 border-b mb-2">
                <Checkbox
                  checked={filteredControls.length > 0 && selectedControls.size === filteredControls.length}
                  onCheckedChange={toggleAllControls}
                  data-testid="checkbox-select-all-controls"
                />
                <span className="text-xs font-medium text-muted-foreground">Select All</span>
              </div>
              {filteredControls.map((control) => (
                <label
                  key={control.id}
                  className="flex items-center gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                  data-testid={`row-control-${control.id}`}
                >
                  <Checkbox
                    checked={selectedControls.has(control.id)}
                    onCheckedChange={() => toggleControl(control.id)}
                    data-testid={`checkbox-control-${control.id}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" data-testid={`text-control-name-${control.id}`}>
                      {control.controlId}: {control.controlName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {frameworkLabels[control.framework] || control.framework}
                      {control.category ? ` / ${control.category}` : ""}
                    </p>
                  </div>
                </label>
              ))}
              {filteredControls.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No controls found</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assignment Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Systems selected</span>
                  <span className="text-sm font-medium" data-testid="text-preview-systems">{selectedSystems.size}</span>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-sm text-muted-foreground">Controls selected</span>
                  <span className="text-sm font-medium" data-testid="text-preview-controls">{selectedControls.size}</span>
                </div>
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-sm font-medium">Total assignments</span>
                    <span className="text-lg font-bold" data-testid="text-preview-total">{totalAssignments}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {selectedControls.size} controls x {selectedSystems.size} systems
                  </p>
                </div>
              </div>

              {totalAssignments > 50 && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-sm">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">
                    Large batch assignment. Duplicates will be automatically skipped.
                  </span>
                </div>
              )}

              <Button
                className="w-full"
                disabled={totalAssignments === 0}
                onClick={() => setConfirmOpen(true)}
                data-testid="button-review-assignment"
              >
                <Layers className="h-4 w-4 mr-2" />
                Review & Assign
              </Button>
            </CardContent>
          </Card>

          {selectedSystems.size > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Selected Systems</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {systems
                    ?.filter((s) => selectedSystems.has(s.id))
                    .map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-1 text-sm py-1"
                        data-testid={`preview-system-${s.id}`}
                      >
                        <span className="truncate">{s.name}</span>
                        <Badge variant={riskColors[s.riskLevel] as any || "outline"} className="shrink-0">
                          {s.riskLevel}
                        </Badge>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle data-testid="text-confirm-title">Confirm Bulk Assignment</DialogTitle>
            <DialogDescription>
              This will assign {selectedControls.size} compliance controls to {selectedSystems.size} AI systems,
              creating up to {totalAssignments} new assignments. Existing assignments will be skipped.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-sm font-medium mb-2">Systems ({selectedSystems.size})</h4>
              <div className="max-h-32 overflow-auto space-y-1">
                {systems
                  ?.filter((s) => selectedSystems.has(s.id))
                  .map((s) => (
                    <div key={s.id} className="text-sm flex items-center gap-2">
                      <CheckSquare className="h-3 w-3 text-primary shrink-0" />
                      <span className="truncate">{s.name}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium mb-2">Controls ({selectedControls.size})</h4>
              <div className="max-h-32 overflow-auto space-y-1">
                {filteredControls
                  .filter((c) => selectedControls.has(c.id))
                  .map((c) => (
                    <div key={c.id} className="text-sm flex items-center gap-2">
                      <CheckSquare className="h-3 w-3 text-primary shrink-0" />
                      <span className="truncate">{c.controlId}: {c.controlName}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 p-3 rounded-md bg-muted">
              <span className="text-sm font-medium">{selectedControls.size} controls</span>
              <ArrowRight className="h-4 w-4" />
              <span className="text-sm font-medium">{selectedSystems.size} systems</span>
              <span className="text-sm">=</span>
              <span className="text-sm font-bold">{totalAssignments} assignments</span>
            </div>
          </div>

          <DialogFooter className="flex flex-row justify-end gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} data-testid="button-cancel-assignment">
              Cancel
            </Button>
            <Button
              onClick={() => bulkMutation.mutate()}
              disabled={bulkMutation.isPending}
              data-testid="button-confirm-assignment"
            >
              {bulkMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Layers className="h-4 w-4 mr-2" />
              )}
              {bulkMutation.isPending ? "Assigning..." : "Confirm Assignment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
