import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft,
  Server,
  ShieldCheck,
  Activity,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  MapPin,
  Users,
  Building2,
  Database,
  Globe,
  Cpu,
  Download,
  Paperclip,
  Radio,
  SlidersHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AiSystem, SystemControl, ApprovalWorkflow, AuditLog, ComplianceControl } from "@shared/schema";
import { EvidenceUpload } from "@/components/evidence-upload";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { formatLawPackLabel, formatLegalProfileLabel } from "@/lib/governance-display";
import {
  LAW_PACKS,
  LAW_PACKS_BY_ID,
  compileLawPackRuntimeOverlay,
  getDefaultLawPackIdsForProfile,
  normalizeLegalProfile,
  resolveSystemLawPackIds,
  type LegalProfile,
  type LawPackId,
} from "@shared/law-packs";

const riskColors: Record<string, string> = {
  unacceptable: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  limited: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  minimal: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  under_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  approved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  deprecated: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
  draft: "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300",
};

const controlStatusColors: Record<string, string> = {
  verified: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  implemented: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  not_started: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300",
};

const workflowStatusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  in_review: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  approved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  escalated: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

async function handleExportEvidence(
  system: AiSystem,
  controls: SystemControl[],
  allComplianceControls: ComplianceControl[],
  workflows: ApprovalWorkflow[],
  auditLogs: AuditLog[],
) {
  const { exportSystemEvidencePdf } = await import("@/lib/export-utils");
  await exportSystemEvidencePdf(system, controls, allComplianceControls, workflows, auditLogs);
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/30">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-xs font-medium truncate">{value}</p>
      </div>
    </div>
  );
}

const EDITABLE_ORG_ROLES = new Set([
  "owner",
  "admin",
  "cro",
  "ciso",
  "compliance_lead",
  "system_owner",
]);

const SOURCE_LABELS: Record<string, string> = {
  baseline_privacy: "Baseline Privacy",
  baseline_security: "Baseline Security",
  baseline_safety: "Baseline Safety",
  gdpr: "GDPR",
  eu_ai_act: "EU AI Act",
  dora: "DORA",
  aml: "AML",
  uk_gdpr: "UK GDPR",
  dpa_2018: "DPA 2018",
  uk_aml: "UK AML",
  fca_pra_expectations: "FCA / PRA",
  security: "Security",
  accountability: "Accountability",
  glba: "GLBA",
  bsa_aml: "BSA / AML",
  ecoa_fcra: "ECOA / FCRA",
  dpdp: "DPDP Act",
  rbi: "RBI",
  pmla: "PMLA",
};

function inferFinanceDomain(system: Pick<AiSystem, "name" | "department" | "purpose" | "description">) {
  const corpus = [system.name, system.department, system.purpose, system.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(bank|loan|credit|mortgage|aml|fraud|collections|underwriting|insurance|payment|financ)/.test(corpus);
}

function formatLegalProfile(profile: string | null | undefined) {
  switch (normalizeLegalProfile(profile)) {
    case "eu":
      return "EU";
    case "uk":
      return "UK";
    case "us":
      return "US";
    case "india":
      return "India";
    default:
      return "Global";
  }
}

function LegalGovernanceCard({ system, canEdit }: { system: AiSystem; canEdit: boolean }) {
  const { toast } = useToast();
  const financeDomain = useMemo(() => inferFinanceDomain(system), [system]);
  const effectiveLawPackIds = useMemo(() => resolveSystemLawPackIds(system), [system]);
  const effectiveLawPackLabels = effectiveLawPackIds.map((packId) => LAW_PACKS_BY_ID.get(packId)?.label ?? packId);

  const [legalProfile, setLegalProfile] = useState<LegalProfile>(normalizeLegalProfile(system.legalProfile));
  const [selectedLawPackIds, setSelectedLawPackIds] = useState<LawPackId[]>(effectiveLawPackIds);

  useEffect(() => {
    setLegalProfile(normalizeLegalProfile(system.legalProfile));
    setSelectedLawPackIds(effectiveLawPackIds);
  }, [effectiveLawPackIds, system.legalProfile]);

  const overlay = useMemo(
    () => compileLawPackRuntimeOverlay(selectedLawPackIds),
    [selectedLawPackIds],
  );

  const normalizedCurrent = [...effectiveLawPackIds].sort().join("|");
  const normalizedSelected = [...selectedLawPackIds].sort().join("|");
  const hasExplicitSelection = Array.isArray(system.lawPackIds) && system.lawPackIds.length > 0;
  const isDirty =
    legalProfile !== normalizeLegalProfile(system.legalProfile) ||
    normalizedCurrent !== normalizedSelected;

  const saveMutation = useMutation({
    mutationFn: async (payload: { legalProfile: LegalProfile; lawPackIds: LawPackId[] }) => {
      const res = await apiRequest("PATCH", `/api/ai-systems/${system.id}`, payload);
      return (await res.json()) as AiSystem;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["/api/ai-systems", system.id], updated);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems", system.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems"] });
      toast({ title: "Legal profile updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update legal profile", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-xs font-semibold">Legal & Jurisdiction Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">Profile: {formatLegalProfile(legalProfile)}</Badge>
          <Badge variant="outline">{hasExplicitSelection ? "Explicit law packs" : "Profile-derived defaults"}</Badge>
          {financeDomain ? <Badge variant="outline">Finance domain</Badge> : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px,1fr]">
          <div className="space-y-2">
            <p className="text-xs font-medium">Applicable legal profile</p>
            <Select
              value={legalProfile}
              onValueChange={(value) => {
                const nextProfile = normalizeLegalProfile(value) as LegalProfile;
                setLegalProfile(nextProfile);
                setSelectedLawPackIds(getDefaultLawPackIdsForProfile(nextProfile, { financeDomain }));
              }}
              disabled={!canEdit || saveMutation.isPending}
            >
              <SelectTrigger data-testid="select-system-legal-profile">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global baseline</SelectItem>
                <SelectItem value="eu">EU</SelectItem>
                <SelectItem value="uk">UK</SelectItem>
                <SelectItem value="us">US</SelectItem>
                <SelectItem value="india">India</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              This profile seeds default packs and acts as the jurisdiction label for runtime evidence.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">Applicable law packs</p>
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3" data-testid="panel-system-law-packs">
              {LAW_PACKS.map((pack) => {
                const checked = selectedLawPackIds.includes(pack.id);
                return (
                  <label key={pack.id} className="flex items-start gap-3 rounded-md border bg-background p-3">
                    <Checkbox
                      checked={checked}
                      disabled={!canEdit || saveMutation.isPending}
                      onCheckedChange={(nextChecked) => {
                        const next = nextChecked
                          ? Array.from(new Set<LawPackId>(["global_baseline", ...selectedLawPackIds, pack.id]))
                          : selectedLawPackIds.filter((entry) => entry !== pack.id);
                        setSelectedLawPackIds(next.length > 0 ? next : ["global_baseline"]);
                      }}
                      data-testid={`checkbox-system-law-pack-${pack.id}`}
                    />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium">{pack.label}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {formatLegalProfile(pack.profile)}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{pack.summary}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-medium">Effective runtime constraints</p>
            <div className="flex flex-wrap gap-2">
              {effectiveLawPackLabels.map((label) => (
                <Badge key={label} variant="secondary">{label}</Badge>
              ))}
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Decision constraints</p>
              <ul className="space-y-1 text-xs text-muted-foreground">
                {overlay.decisionConstraints.map((constraint) => (
                  <li key={constraint}>- {constraint}</li>
                ))}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground">Source references</p>
              <div className="flex flex-wrap gap-2">
                {overlay.sourceRefs.map((source) => (
                  <Badge key={source} variant="outline">{SOURCE_LABELS[source] ?? source}</Badge>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Runtime decisions now carry these law-pack references into telemetry metadata and evidence.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted-foreground">
            {canEdit
              ? "Save to persist explicit jurisdiction packs for this system."
              : "Your current role can view the applied packs but cannot change them."}
          </p>
          <Button
            size="sm"
            disabled={!canEdit || !isDirty || saveMutation.isPending}
            onClick={() => saveMutation.mutate({ legalProfile, lawPackIds: selectedLawPackIds })}
            data-testid="button-save-system-legal-profile"
          >
            {saveMutation.isPending ? "Saving..." : "Save legal profile"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ system, canEdit }: { system: AiSystem; canEdit: boolean }) {
  return (
    <div className="space-y-4" data-testid="tab-overview">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <InfoItem icon={Building2} label="Department" value={system.department || "N/A"} />
        <InfoItem icon={Cpu} label="Model Type" value={system.modelType || "N/A"} />
        <InfoItem icon={Server} label="Vendor" value={system.vendor || "Internal"} />
        <InfoItem icon={Database} label="Data Sensitivity" value={system.dataSensitivity || "N/A"} />
        <InfoItem icon={Globe} label="Geography" value={system.geography || "N/A"} />
        <InfoItem icon={ShieldCheck} label="Legal Profile" value={formatLegalProfile(system.legalProfile)} />
        <InfoItem icon={MapPin} label="Deployment" value={system.deploymentContext || "N/A"} />
        <InfoItem icon={Users} label="Users Impacted" value={(system.usersImpacted || 0).toLocaleString()} />
        <InfoItem icon={Clock} label="Last Assessment" value={system.lastAssessment ? new Date(system.lastAssessment).toLocaleDateString() : "Not assessed"} />
      </div>
      <LegalGovernanceCard system={system} canEdit={canEdit} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold">Runtime Governance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={`/telemetry-policy?systemId=${encodeURIComponent(system.id)}`}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              Telemetry policy
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/runtime-monitoring?systemId=${encodeURIComponent(system.id)}`}>
              <Radio className="mr-2 h-4 w-4" />
              Runtime monitoring
            </Link>
          </Button>
        </CardContent>
      </Card>
      {system.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{system.description}</p>
          </CardContent>
        </Card>
      )}
      {system.purpose && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold">Purpose</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{system.purpose}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ControlsTab({ controls, allComplianceControls, systemId }: { controls: SystemControl[]; allComplianceControls: ComplianceControl[]; systemId: string }) {
  const verified = controls.filter((c) => c.status === "verified").length;
  const implemented = controls.filter((c) => c.status === "implemented").length;
  const inProgress = controls.filter((c) => c.status === "in_progress").length;
  const notStarted = controls.filter((c) => c.status === "not_started").length;
  const total = controls.length || 1;
  const complianceRate = Math.round(((verified + implemented) / total) * 100);

  const controlMap = new Map(allComplianceControls.map((c) => [c.id, c]));

  return (
    <div className="space-y-4" data-testid="tab-controls">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Compliance Progress</p>
              <p className="text-xs text-muted-foreground">{verified + implemented} of {controls.length} controls compliant</p>
            </div>
            <span className="text-2xl font-bold text-primary">{complianceRate}%</span>
          </div>
          <Progress value={complianceRate} className="h-2" />
          <div className="grid grid-cols-4 gap-2 mt-3">
            <div className="text-center p-2 rounded bg-green-50 dark:bg-green-900/10">
              <p className="text-lg font-bold text-green-700 dark:text-green-400">{verified}</p>
              <p className="text-[10px] text-muted-foreground">Verified</p>
            </div>
            <div className="text-center p-2 rounded bg-blue-50 dark:bg-blue-900/10">
              <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{implemented}</p>
              <p className="text-[10px] text-muted-foreground">Implemented</p>
            </div>
            <div className="text-center p-2 rounded bg-yellow-50 dark:bg-yellow-900/10">
              <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{inProgress}</p>
              <p className="text-[10px] text-muted-foreground">In Progress</p>
            </div>
            <div className="text-center p-2 rounded bg-gray-50 dark:bg-gray-900/10">
              <p className="text-lg font-bold text-gray-700 dark:text-gray-400">{notStarted}</p>
              <p className="text-[10px] text-muted-foreground">Not Started</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {controls.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No controls mapped to this system</p>
            </CardContent>
          </Card>
        ) : (
          controls.map((sc) => {
            const cc = controlMap.get(sc.controlId);
            return (
              <Card key={sc.id} data-testid={`control-item-${sc.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {cc && <span className="text-[10px] font-mono text-muted-foreground">{cc.controlId}</span>}
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${controlStatusColors[sc.status]}`}>
                          {sc.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs font-medium">{cc?.controlName || "Unknown Control"}</p>
                      {cc?.description && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{cc.description}</p>}
                      <div className="flex items-center gap-3 mt-1.5">
                        {sc.assignee && <span className="text-[10px] text-muted-foreground">Assignee: {sc.assignee}</span>}
                        {cc?.framework && (
                          <span className="text-[10px] font-medium text-primary">
                            {cc.framework === "eu_ai_act" ? "EU AI Act" : cc.framework === "nist_ai_rmf" ? "NIST AI RMF" : "ISO 42001"}
                          </span>
                        )}
                      </div>
                    </div>
                    <EvidenceUpload systemId={systemId} controlId={sc.controlId} compact />
                  </div>
                  {sc.evidence && (
                    <div className="mt-2 rounded bg-muted/30 p-2">
                      <p className="text-[10px] text-muted-foreground">Evidence: {sc.evidence}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function WorkflowsTab({ workflows }: { workflows: ApprovalWorkflow[] }) {
  return (
    <div className="space-y-2" data-testid="tab-workflows">
      {workflows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No approval workflows for this system</p>
          </CardContent>
        </Card>
      ) : (
        workflows.map((wf) => (
          <Card key={wf.id} data-testid={`workflow-detail-${wf.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{wf.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{wf.description}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium ${workflowStatusColors[wf.status]}`}>
                  {wf.status.replace("_", " ")}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                <span>Requested by: <strong>{wf.requestedBy}</strong></span>
                {wf.reviewer && <span>Reviewer: <strong>{wf.reviewer}</strong></span>}
                {wf.priority && <Badge variant="outline" className="text-[10px] h-4">{wf.priority}</Badge>}
                <Badge variant="outline" className="text-[10px] h-4">{formatLegalProfileLabel(wf.legalProfile)}</Badge>
                {wf.createdAt && <span>{new Date(wf.createdAt).toLocaleDateString()}</span>}
              </div>
              {Array.isArray(wf.lawPackIds) && wf.lawPackIds.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {wf.lawPackIds.map((packId) => (
                    <Badge key={packId} variant="secondary" className="text-[10px] h-4">
                      {formatLawPackLabel(packId)}
                    </Badge>
                  ))}
                </div>
              )}
              {wf.decisionNotes && (
                <div className="mt-2 rounded bg-muted/30 p-2">
                  <p className="text-[10px] text-muted-foreground">Decision: {wf.decisionNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function AuditTab({ logs }: { logs: AuditLog[] }) {
  const actionIcons: Record<string, any> = {
    created: CheckCircle2,
    updated: Activity,
    deleted: XCircle,
    approved: CheckCircle2,
    rejected: XCircle,
    status_changed: Activity,
  };

  return (
    <div className="space-y-1" data-testid="tab-audit">
      {logs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No audit history for this system</p>
          </CardContent>
        </Card>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />
          {logs.map((log) => {
            const Icon = actionIcons[log.action] || Activity;
            return (
              <div key={log.id} className="relative mb-4" data-testid={`audit-entry-${log.id}`}>
                <div className="absolute -left-6 mt-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-background border">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                </div>
                <div className="ml-2 rounded-lg bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{log.details}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">by {log.performedBy}</span>
                    <Badge variant="outline" className="text-[9px] h-4">{log.action}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SystemDetail() {
  const [, params] = useRoute("/systems/:id");
  const systemId = params?.id;
  const { user } = useAuth();

  const currentOrgRole =
    user?.organizations.find((organization) => organization.id === user.currentOrganizationId)?.role ??
    user?.role ??
    "member";
  const canEditSystemGovernance = EDITABLE_ORG_ROLES.has(currentOrgRole);

  const { data: system, isLoading: loadingSystem } = useQuery<AiSystem>({
    queryKey: ["/api/ai-systems", systemId],
    enabled: !!systemId,
  });

  const { data: controls = [], isLoading: loadingControls } = useQuery<SystemControl[]>({
    queryKey: ["/api/ai-systems", systemId, "controls"],
    enabled: !!systemId,
  });

  const { data: workflows = [], isLoading: loadingWorkflows } = useQuery<ApprovalWorkflow[]>({
    queryKey: ["/api/ai-systems", systemId, "workflows"],
    enabled: !!systemId,
  });

  const { data: auditLogs = [], isLoading: loadingLogs } = useQuery<AuditLog[]>({
    queryKey: ["/api/ai-systems", systemId, "audit-logs"],
    enabled: !!systemId,
  });

  const { data: allComplianceControls = [] } = useQuery<ComplianceControl[]>({
    queryKey: ["/api/compliance-controls"],
  });

  const isLoading = loadingSystem || loadingControls || loadingWorkflows || loadingLogs;

  if (isLoading) {
    return (
      <div className="page-shell">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!system) {
    return (
      <div className="mx-auto w-full max-w-[1360px] p-5 md:p-6">
        <Link href="/registry">
          <Button variant="ghost" size="sm" data-testid="button-back-registry">
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to Registry
          </Button>
        </Link>
        <Card className="mt-4">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium mb-1">System not found</h3>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1360px] space-y-5 p-5 md:p-6" data-testid="page-system-detail">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/registry">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-system-name">{system.name}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">Owner: {system.owner}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[system.riskLevel]}`}>
                {system.riskLevel}
              </span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[system.status]}`}>
                {system.status.replace("_", " ")}
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void handleExportEvidence(system, controls, allComplianceControls, workflows, auditLogs);
          }}
          data-testid="button-export-evidence"
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Export Evidence
        </Button>
      </div>

      <Tabs defaultValue="overview">
        <TabsList data-testid="system-tabs">
          <TabsTrigger value="overview" data-testid="tab-trigger-overview">Overview</TabsTrigger>
          <TabsTrigger value="controls" data-testid="tab-trigger-controls">
            Controls ({controls.length})
          </TabsTrigger>
          <TabsTrigger value="workflows" data-testid="tab-trigger-workflows">
            Workflows ({workflows.length})
          </TabsTrigger>
          <TabsTrigger value="evidence" data-testid="tab-trigger-evidence">
            <Paperclip className="h-3 w-3 mr-1" />
            Evidence
          </TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-trigger-audit">
            Audit ({auditLogs.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <OverviewTab system={system} canEdit={canEditSystemGovernance} />
        </TabsContent>
        <TabsContent value="controls" className="mt-4">
          <ControlsTab controls={controls} allComplianceControls={allComplianceControls} systemId={systemId!} />
        </TabsContent>
        <TabsContent value="workflows" className="mt-4">
          <WorkflowsTab workflows={workflows} />
        </TabsContent>
        <TabsContent value="evidence" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                System Evidence Files
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EvidenceUpload systemId={systemId!} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditTab logs={auditLogs} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
