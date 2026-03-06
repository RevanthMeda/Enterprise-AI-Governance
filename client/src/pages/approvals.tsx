import { useState } from "react";
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
  AlertTriangle,
  ArrowUpCircle,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
});

type FormValues = z.infer<typeof formSchema>;

const statusConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
  pending: { icon: Clock, color: "text-yellow-600 dark:text-yellow-400", bgColor: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  in_review: { icon: FileText, color: "text-blue-600 dark:text-blue-400", bgColor: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  approved: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400", bgColor: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  rejected: { icon: XCircle, color: "text-red-600 dark:text-red-400", bgColor: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  escalated: { icon: ArrowUpCircle, color: "text-purple-600 dark:text-purple-400", bgColor: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
};

const priorityColors: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  critical: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
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
      await apiRequest("PATCH", `/api/approval-workflows/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/approval-workflows"] });
      toast({ title: "Workflow status updated" });
    },
  });

  const filtered = activeTab === "all"
    ? workflows
    : workflows.filter((w) => w.status === activeTab);

  const getSystemName = (id: string) =>
    systems.find((s) => s.id === id)?.name || "Unknown System";

  const counts = {
    all: workflows.length,
    pending: workflows.filter((w) => w.status === "pending").length,
    in_review: workflows.filter((w) => w.status === "in_review").length,
    approved: workflows.filter((w) => w.status === "approved").length,
    rejected: workflows.filter((w) => w.status === "rejected").length,
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-md" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-approvals">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Approval Workflows</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review and approve AI system deployments
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-approval">
              <Plus className="h-4 w-4 mr-1.5" />
              New Request
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base">Create Approval Request</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="systemId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">AI System</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger data-testid="select-workflow-system"><SelectValue placeholder="Select a system" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {systems.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Title</FormLabel>
                    <FormControl><Input {...field} data-testid="input-workflow-title" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Description</FormLabel>
                    <FormControl><Textarea {...field} className="resize-none" data-testid="input-workflow-description" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="requestedBy" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Requested By</FormLabel>
                      <FormControl><Input {...field} data-testid="input-requested-by" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="reviewer" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Reviewer</FormLabel>
                      <FormControl><Input {...field} data-testid="input-reviewer" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Priority</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger data-testid="select-priority"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
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
          <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium mb-1">No workflows found</h3>
            <p className="text-xs text-muted-foreground">Create a new approval request to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((wf) => {
            const config = statusConfig[wf.status] || statusConfig.pending;
            const StatusIcon = config.icon;
            return (
              <Card key={wf.id} className="hover-elevate" data-testid={`card-workflow-${wf.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/50`}>
                      <StatusIcon className={`h-4 w-4 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold">{wf.title}</h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {getSystemName(wf.systemId)} - Requested by {wf.requestedBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${config.bgColor}`}>
                            {wf.status.replace("_", " ")}
                          </span>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${priorityColors[wf.priority || "medium"]}`}>
                            {wf.priority}
                          </span>
                        </div>
                      </div>
                      {wf.description && (
                        <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{wf.description}</p>
                      )}
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {wf.reviewer && (
                          <span className="text-[10px] text-muted-foreground">
                            Reviewer: {wf.reviewer}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {wf.createdAt ? new Date(wf.createdAt).toLocaleDateString() : ""}
                        </span>
                      </div>
                      {(wf.status === "pending" || wf.status === "in_review") && (
                        <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                          {wf.status === "pending" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => updateStatusMutation.mutate({ id: wf.id, status: "in_review" })}
                              data-testid={`button-review-${wf.id}`}
                            >
                              Start Review
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => updateStatusMutation.mutate({ id: wf.id, status: "approved" })}
                            data-testid={`button-approve-${wf.id}`}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateStatusMutation.mutate({ id: wf.id, status: "rejected" })}
                            data-testid={`button-reject-${wf.id}`}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </div>
                      )}
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
