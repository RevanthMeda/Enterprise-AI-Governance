import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { ApprovalWorkflow, AiSystem } from "@shared/schema";

const formSchema = z.object({
  systemId: z.string().min(1, "System is required"),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  requestedBy: z.string().min(1, "Requester is required"),
  reviewer: z.string().optional(),
  priority: z.string().default("medium"),
  estimatedFinancialImpact: z.coerce.number().int().min(0).default(0),
  usesPii: z.boolean().default(false),
  customerFacing: z.boolean().default(false),
  reversible: z.boolean().default(true),
  strategicImpact: z.boolean().default(false),
  safetyCritical: z.boolean().default(false),
});

type FormValues = z.infer<typeof formSchema>;

const statusConfig: Record<string, { icon: typeof Clock; color: string; bgColor: string }> = {
  pending: {
    icon: Clock,
    color: "text-yellow-600 dark:text-yellow-400",
    bgColor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  },
  in_review: {
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  approved: {
    icon: CheckCircle2,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  rejected: {
    icon: XCircle,
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  },
  escalated: {
    icon: ArrowUpCircle,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
};

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
};

const tierColors: Record<string, string> = {
  tier_1: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  tier_2: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  tier_3: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

const committeeLabels: Record<string, string> = {
  technical_team: "Technical Team",
  operations_committee: "Operations Committee",
  governance_committee_ceo: "Governance Committee + CEO",
};

export default function Approvals() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const { toast } = useToast();

  const { data: workflows = [], isLoading } = useQuery<ApprovalWorkflow[]>({
    queryKey: ["/api/approval-workflows"],
  });

  const { data: systems = [] } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      systemId: "",
      title: "",
      description: "",
      requestedBy: "",
      reviewer: "",
      priority: "medium",
      estimatedFinancialImpact: 0,
      usesPii: false,
      customerFacing: false,
      reversible: true,
      strategicImpact: false,
      safetyCritical: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest("POST", "/api/approval-workflows", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approval-workflows"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "Approval workflow created" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create workflow", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/approval-workflows/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approval-workflows"] });
      toast({ title: "Workflow status updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update workflow", description: err.message, variant: "destructive" });
    },
  });

  const filtered = useMemo(
    () => (activeTab === "all" ? workflows : workflows.filter((workflow) => workflow.status === activeTab)),
    [activeTab, workflows],
  );

  const getSystemName = (id: string) => systems.find((system) => system.id === id)?.name || "Unknown System";

  const counts = {
    all: workflows.length,
    pending: workflows.filter((workflow) => workflow.status === "pending").length,
    in_review: workflows.filter((workflow) => workflow.status === "in_review").length,
    escalated: workflows.filter((workflow) => workflow.status === "escalated").length,
    approved: workflows.filter((workflow) => workflow.status === "approved").length,
    rejected: workflows.filter((workflow) => workflow.status === "rejected").length,
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 p-6" data-testid="page-approvals">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Approval Workflows</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Route AI decisions by financial, privacy, safety, and strategic impact.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-approval">
              <Plus className="mr-1.5 h-4 w-4" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base">Create Approval Request</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((values) => createMutation.mutate(values))} className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="systemId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">AI System</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-workflow-system">
                              <SelectValue placeholder="Select a system" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {systems.map((system) => (
                              <SelectItem key={system.id} value={system.id}>
                                {system.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-priority">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Title</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-workflow-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} className="resize-none" data-testid="input-workflow-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid gap-3 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="requestedBy"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Requested By</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-requested-by" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reviewer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Reviewer</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-reviewer" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Tier routing inputs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="estimatedFinancialImpact"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Estimated financial impact (USD)</FormLabel>
                          <FormControl>
                            <Input {...field} type="number" min={0} step={1000} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid gap-3 md:grid-cols-2">
                      <BooleanField control={form.control} name="usesPii" label="Uses PII" />
                      <BooleanField control={form.control} name="customerFacing" label="Customer-facing decision" />
                      <BooleanField control={form.control} name="reversible" label="Reversible outcome" />
                      <BooleanField control={form.control} name="strategicImpact" label="Strategic or M&A impact" />
                      <BooleanField control={form.control} name="safetyCritical" label="Safety or compliance critical" />
                    </div>
                    <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                      Tier 1 auto-logs. Tier 2 routes to Operations Committee. Tier 3 escalates and stays blocked until Governance Committee plus CEO approval.
                    </div>
                  </CardContent>
                </Card>
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-approval">
                  {createMutation.isPending ? "Creating..." : "Submit Request"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-approval-status">
          <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="in_review">In Review ({counts.in_review})</TabsTrigger>
          <TabsTrigger value="escalated" className="data-[state=active]:border-amber-500 data-[state=active]:text-amber-700">
            Escalated <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{counts.escalated}</span>
          </TabsTrigger>
          <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="mb-3 h-12 w-12 text-muted-foreground/30" />
            <h3 className="mb-1 text-sm font-medium">No workflows found</h3>
            <p className="text-xs text-muted-foreground">Create a new approval request to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((workflow) => {
            const config = statusConfig[workflow.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            const tierColor = tierColors[workflow.decisionTier || "tier_1"] || tierColors.tier_1;
            const isTierThree = workflow.decisionTier === "tier_3";

            return (
              <Card key={workflow.id} className="hover-elevate" data-testid={`card-workflow-${workflow.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50">
                      <StatusIcon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold">{workflow.title}</h3>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {getSystemName(workflow.systemId)} - Requested by {workflow.requestedBy}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${config.bgColor}`}>
                            {workflow.status.replace("_", " ")}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColors[workflow.priority || "medium"]}`}>
                            {workflow.priority}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${tierColor}`}>
                            {(workflow.decisionTier || "tier_1").replace("_", " ").toUpperCase()}
                          </span>
                        </div>
                      </div>
                      {workflow.description ? (
                        <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">{workflow.description}</p>
                      ) : null}
                      <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
                        <span>Committee: {committeeLabels[workflow.committeeType || "technical_team"] || workflow.committeeType}</span>
                        <span>Impact: ${Number(workflow.estimatedFinancialImpact || 0).toLocaleString()}</span>
                        <span>
                          Required approvers: {Array.isArray(workflow.requiredApprovers) ? workflow.requiredApprovers.join(", ") : "Auto-log"}
                        </span>
                        <span>{workflow.createdAt ? new Date(workflow.createdAt).toLocaleDateString() : ""}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {workflow.reviewer ? <Badge variant="outline">Reviewer: {workflow.reviewer}</Badge> : null}
                        {workflow.usesPii ? <Badge variant="secondary">PII</Badge> : null}
                        {workflow.customerFacing ? <Badge variant="secondary">Customer-facing</Badge> : null}
                        {workflow.reversible === false ? <Badge variant="secondary">Irreversible</Badge> : null}
                        {workflow.strategicImpact ? <Badge variant="secondary">Strategic</Badge> : null}
                        {workflow.safetyCritical ? <Badge variant="secondary">Safety-critical</Badge> : null}
                      </div>
                      {workflow.blockedReason ? (
                        <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                          <span>{workflow.blockedReason}</span>
                        </div>
                      ) : null}
                      {(workflow.status === "pending" || workflow.status === "in_review" || workflow.status === "escalated") ? (
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {workflow.status === "pending" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: workflow.id, status: "in_review" })}
                              data-testid={`button-review-${workflow.id}`}
                            >
                              Start Review
                            </Button>
                          ) : null}
                          {!isTierThree ? (
                            <Button
                              size="sm"
                              onClick={() => updateStatusMutation.mutate({ id: workflow.id, status: "approved" })}
                              data-testid={`button-approve-${workflow.id}`}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              Approve
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Tier 3 remains blocked until Governance Committee plus CEO approval is completed outside the standard action flow.
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: workflow.id, status: "rejected" })}
                            data-testid={`button-reject-${workflow.id}`}
                          >
                            <XCircle className="mr-1 h-3.5 w-3.5" />
                            Reject
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BooleanField({
  control,
  name,
  label,
}: {
  control: ReturnType<typeof useForm<FormValues>>["control"];
  name: keyof Pick<FormValues, "usesPii" | "customerFacing" | "reversible" | "strategicImpact" | "safetyCritical">;
  label: string;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className="rounded-md border bg-muted/20 p-3">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <div>
              <div className="font-medium">{label}</div>
            </div>
            <input
              type="checkbox"
              checked={Boolean(field.value)}
              onChange={(event) => field.onChange(event.target.checked)}
              className="h-4 w-4 rounded border"
            />
          </label>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
