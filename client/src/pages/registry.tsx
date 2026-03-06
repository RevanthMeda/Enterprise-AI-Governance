import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Server,
  Filter,
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AiSystem } from "@shared/schema";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  owner: z.string().min(1, "Owner is required"),
  department: z.string().optional(),
  vendor: z.string().optional(),
  modelType: z.string().optional(),
  riskLevel: z.string().default("minimal"),
  status: z.string().default("draft"),
  deploymentContext: z.string().optional(),
  dataSensitivity: z.string().default("internal"),
  geography: z.string().optional(),
  purpose: z.string().optional(),
  usersImpacted: z.number().int().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

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

function SystemDetailDialog({ system }: { system: AiSystem }) {
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="text-base">{system.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="text-[11px] text-muted-foreground block">Owner</span>
            <span className="font-medium">{system.owner}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Department</span>
            <span className="font-medium">{system.department || "N/A"}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Risk Level</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[system.riskLevel]}`}>
              {system.riskLevel}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Status</span>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[system.status]}`}>
              {system.status.replace("_", " ")}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Vendor</span>
            <span className="font-medium">{system.vendor || "Internal"}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Model Type</span>
            <span className="font-medium">{system.modelType || "N/A"}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Data Sensitivity</span>
            <span className="font-medium">{system.dataSensitivity || "N/A"}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Geography</span>
            <span className="font-medium">{system.geography || "N/A"}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Users Impacted</span>
            <span className="font-medium">{system.usersImpacted?.toLocaleString() || "0"}</span>
          </div>
          <div>
            <span className="text-[11px] text-muted-foreground block">Deployment</span>
            <span className="font-medium">{system.deploymentContext || "N/A"}</span>
          </div>
        </div>
        {system.description && (
          <div>
            <span className="text-[11px] text-muted-foreground block mb-1">Description</span>
            <p className="text-sm">{system.description}</p>
          </div>
        )}
        {system.purpose && (
          <div>
            <span className="text-[11px] text-muted-foreground block mb-1">Purpose</span>
            <p className="text-sm">{system.purpose}</p>
          </div>
        )}
      </div>
    </DialogContent>
  );
}

export default function Registry() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailSystem, setDetailSystem] = useState<AiSystem | null>(null);
  const { toast } = useToast();

  const { data: systems = [], isLoading } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems"],
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      owner: "",
      department: "",
      vendor: "",
      modelType: "",
      riskLevel: "minimal",
      status: "draft",
      deploymentContext: "",
      dataSensitivity: "internal",
      geography: "",
      purpose: "",
      usersImpacted: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const res = await apiRequest("POST", "/api/ai-systems", values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems"] });
      setDialogOpen(false);
      form.reset();
      toast({ title: "AI system registered successfully" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to register system", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/ai-systems/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-systems"] });
      toast({ title: "System deleted" });
    },
  });

  const filtered = systems.filter((s) => {
    const matchSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.owner.toLowerCase().includes(search.toLowerCase()) ||
      (s.department?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchRisk = riskFilter === "all" || s.riskLevel === riskFilter;
    return matchSearch && matchRisk;
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto" data-testid="page-registry">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">AI System Registry</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Inventory of all AI systems across the organization
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-system">
              <Plus className="h-4 w-4 mr-1.5" />
              Register System
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">Register New AI System</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="space-y-4">
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">System Name</FormLabel>
                    <FormControl><Input {...field} data-testid="input-system-name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Description</FormLabel>
                    <FormControl><Textarea {...field} className="resize-none" data-testid="input-description" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="owner" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Owner</FormLabel>
                      <FormControl><Input {...field} data-testid="input-owner" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="department" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Department</FormLabel>
                      <FormControl><Input {...field} data-testid="input-department" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="vendor" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Vendor</FormLabel>
                      <FormControl><Input {...field} data-testid="input-vendor" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="modelType" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Model Type</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g., LLM, Classification" data-testid="input-model-type" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="riskLevel" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Risk Level</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger data-testid="select-risk-level"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="minimal">Minimal</SelectItem>
                          <SelectItem value="limited">Limited</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="unacceptable">Unacceptable</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="dataSensitivity" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Data Sensitivity</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value || "internal"}>
                        <FormControl><SelectTrigger data-testid="select-data-sensitivity"><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="public">Public</SelectItem>
                          <SelectItem value="internal">Internal</SelectItem>
                          <SelectItem value="confidential">Confidential</SelectItem>
                          <SelectItem value="restricted">Restricted</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="geography" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Geography</FormLabel>
                      <FormControl><Input {...field} placeholder="e.g., EU, US, Global" data-testid="input-geography" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="usersImpacted" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Users Impacted</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-users-impacted"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="purpose" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Purpose</FormLabel>
                    <FormControl><Textarea {...field} className="resize-none" data-testid="input-purpose" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-system">
                  {createMutation.isPending ? "Registering..." : "Register System"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search systems..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-systems"
          />
        </div>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-risk-filter">
            <Filter className="h-3.5 w-3.5 mr-1.5" />
            <SelectValue placeholder="Risk Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risks</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
            <SelectItem value="limited">Limited</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="unacceptable">Unacceptable</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-5 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2 mb-3" />
                <Skeleton className="h-3 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium mb-1">No AI systems found</h3>
            <p className="text-xs text-muted-foreground">Register your first AI system to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((system) => (
            <Card key={system.id} className="hover-elevate" data-testid={`card-system-${system.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1 mb-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold truncate">{system.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{system.owner} - {system.department}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" data-testid={`button-menu-${system.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <Dialog>
                        <DialogTrigger asChild>
                          <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setDetailSystem(system); }} data-testid={`button-view-${system.id}`}>
                            <Eye className="h-3.5 w-3.5 mr-1.5" /> View Details
                          </DropdownMenuItem>
                        </DialogTrigger>
                      </Dialog>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => deleteMutation.mutate(system.id)}
                        data-testid={`button-delete-${system.id}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {system.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2 mb-3">{system.description}</p>
                )}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${riskColors[system.riskLevel]}`}>
                    {system.riskLevel}
                  </span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusColors[system.status]}`}>
                    {system.status.replace("_", " ")}
                  </span>
                  {system.vendor && (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {system.vendor}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detailSystem} onOpenChange={(open) => !open && setDetailSystem(null)}>
        {detailSystem && <SystemDetailDialog system={detailSystem} />}
      </Dialog>
    </div>
  );
}
