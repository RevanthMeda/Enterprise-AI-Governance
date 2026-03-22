import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import {
  Plus,
  Search,
  Server,
  Filter,
  MoreHorizontal,
  Eye,
  Trash2,
  Download,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { resolveApiUrl } from "@/lib/api-url";
import { apiRequest, captureCsrfTokenFromResponse, queryClient } from "@/lib/queryClient";
import { exportSystemRegistryCsv } from "@/lib/export-utils";
import type { AiSystem } from "@shared/schema";
import {
  LAW_PACKS,
  LAW_PACKS_BY_ID,
  getDefaultLawPackIdsForProfile,
  legalProfiles,
  lawPackIds,
  resolveSystemLawPackIds,
} from "@shared/law-packs";

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
  legalProfile: z.enum(legalProfiles).default("global"),
  lawPackIds: z.array(z.enum(lawPackIds)).default(["global_baseline"]),
  purpose: z.string().optional(),
  usersImpacted: z.number().int().min(0).default(0),
});

type FormValues = z.infer<typeof formSchema>;

const riskColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
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

function inferFinanceDomain(values: Partial<FormValues>) {
  const corpus = [values.name, values.department, values.purpose, values.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(bank|loan|credit|mortgage|aml|fraud|collections|underwriting|insurance|payment|financ)/.test(corpus);
}

export default function Registry() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sensitivityFilter, setSensitivityFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const hasActiveFilters = riskFilter !== "all" || statusFilter !== "all" || sensitivityFilter !== "all" || search !== "";

  const queryParams = new URLSearchParams();
  if (search) queryParams.set("search", search);
  if (riskFilter !== "all") queryParams.set("riskLevel", riskFilter);
  if (statusFilter !== "all") queryParams.set("status", statusFilter);
  if (sensitivityFilter !== "all") queryParams.set("dataSensitivity", sensitivityFilter);

  const { data: systems = [], isLoading } = useQuery<AiSystem[]>({
    queryKey: ["/api/ai-systems", queryParams.toString()],
    refetchInterval: 30_000,
    staleTime: 10_000,
    queryFn: async () => {
      const res = await fetch(resolveApiUrl(`/api/ai-systems?${queryParams.toString()}`), { credentials: "include" });
      captureCsrfTokenFromResponse(res);
      if (!res.ok) throw new Error("Failed to fetch systems");
      return res.json();
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", description: "", owner: "", department: "", vendor: "",
      modelType: "", riskLevel: "minimal", status: "draft", deploymentContext: "",
      dataSensitivity: "internal", geography: "", legalProfile: "global", lawPackIds: ["global_baseline"], purpose: "", usersImpacted: 0,
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

  const clearFilters = () => {
    setSearch("");
    setRiskFilter("all");
    setStatusFilter("all");
    setSensitivityFilter("all");
  };

  const activeSystems = systems.filter((system) => system.status === "active").length;
  const highRiskSystems = systems.filter((system) => system.riskLevel === "high" || system.riskLevel === "unacceptable").length;
  const draftSystems = systems.filter((system) => system.status === "draft").length;

  return (
    <div className="page-shell" data-testid="page-registry">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">AI System Registry</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Record the systems in scope, who owns them, what they do, and how they are governed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportSystemRegistryCsv(systems)} data-testid="button-export-registry">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Export CSV
          </Button>
          <Button asChild variant="outline" size="sm" data-testid="button-connect-ai-application">
            <Link href="/registry/connect">
              <Server className="h-3.5 w-3.5 mr-1.5" />
              Connect AI Application
            </Link>
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-system">
                <Plus className="h-4 w-4 mr-1.5" />
                Register System
              </Button>
            </DialogTrigger>
            <DialogContent className="flex max-h-[85vh] max-w-lg flex-col overflow-hidden">
              <DialogHeader>
                <DialogTitle className="text-base">Register New AI System</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => createMutation.mutate(v))} className="flex min-h-0 flex-1 flex-col">
                  <ScrollArea className="min-h-0 flex-1 pr-1">
                    <div className="space-y-4 pb-4">
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
                    <FormField control={form.control} name="legalProfile" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">Legal Profile</FormLabel>
                        <Select
                          onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue(
                              "lawPackIds",
                              getDefaultLawPackIdsForProfile(value as typeof legalProfiles[number], {
                                financeDomain: inferFinanceDomain(form.getValues()),
                              }),
                            );
                          }}
                          defaultValue={field.value || "global"}
                        >
                          <FormControl><SelectTrigger data-testid="select-legal-profile"><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="global">Global baseline</SelectItem>
                            <SelectItem value="eu">EU</SelectItem>
                            <SelectItem value="uk">UK</SelectItem>
                            <SelectItem value="us">US</SelectItem>
                            <SelectItem value="india">India</SelectItem>
                          </SelectContent>
                        </Select>
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
                  <FormField control={form.control} name="lawPackIds" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Applicable Law Packs</FormLabel>
                      <div className="space-y-2 rounded-md border bg-muted/20 p-3" data-testid="panel-law-packs">
                        {LAW_PACKS.map((pack) => {
                          const checked = field.value?.includes(pack.id) ?? false;
                          return (
                            <label key={pack.id} className="flex items-start gap-3 rounded-md border bg-background p-3">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) => {
                                  const current = field.value ?? [];
                                  const next = nextChecked
                                    ? Array.from(new Set([...current, pack.id]))
                                    : current.filter((entry) => entry !== pack.id);
                                  field.onChange(next.length > 0 ? next : ["global_baseline"]);
                                }}
                                data-testid={`checkbox-law-pack-${pack.id}`}
                              />
                              <div className="space-y-1">
                                <div className="text-xs font-medium">{pack.label}</div>
                                <div className="text-[11px] text-muted-foreground">{pack.summary}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )} />
                    </div>
                  </ScrollArea>
                  <div className="mt-4 border-t pt-4">
                  <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-system">
                    {createMutation.isPending ? "Registering..." : "Register System"}
                  </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Systems in registry</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{systems.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Active</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{activeSystems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">High-scrutiny</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{highRiskSystems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Drafts</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{draftSystems}</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, owner, vendor, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-systems"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showFilters ? "secondary" : "outline"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              data-testid="button-toggle-filters"
            >
              <Filter className="h-3.5 w-3.5 mr-1.5" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] text-primary-foreground font-bold">
                  {[riskFilter !== "all", statusFilter !== "all", sensitivityFilter !== "all"].filter(Boolean).length}
                </span>
              )}
            </Button>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="h-3.5 w-3.5 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 p-3 rounded-lg bg-muted/30 border" data-testid="panel-filters">
            <Select value={riskFilter} onValueChange={setRiskFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-risk-filter">
                <SelectValue placeholder="Risk Level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risks</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="unacceptable">Unacceptable</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sensitivityFilter} onValueChange={setSensitivityFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-sensitivity-filter">
                <SelectValue placeholder="Data Sensitivity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sensitivity</SelectItem>
                <SelectItem value="public">Public</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="confidential">Confidential</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
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
      ) : systems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Server className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-medium mb-1">
              {hasActiveFilters ? "No systems match your filters" : "No AI systems found"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {hasActiveFilters ? "Try adjusting your filters" : "Register your first AI system to get started"}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {systems.map((system) => {
            const appliedLawPacks = resolveSystemLawPackIds(system)
              .map((packId) => LAW_PACKS_BY_ID.get(packId)?.label ?? packId)
              .slice(0, 3);

            return (
            <Card
              key={system.id}
              className="hover-elevate cursor-pointer"
              data-testid={`card-system-${system.id}`}
              onClick={() => navigate(`/systems/${system.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(`/systems/${system.id}`);
                }
              }}
              tabIndex={0}
              role="link"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-1 mb-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold" title={system.name}>{system.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{system.owner} - {system.department}</p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        data-testid={`button-menu-${system.id}`}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => navigate(`/systems/${system.id}`)} data-testid={`button-view-${system.id}`}>
                        <Eye className="h-3.5 w-3.5 mr-1.5" /> View Details
                      </DropdownMenuItem>
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
                <div className="mb-3 space-y-1 text-[11px] text-muted-foreground">
                  {system.modelType ? <p>Observed model: {system.modelType}</p> : null}
                  {system.deploymentContext ? <p>Runtime context: {system.deploymentContext}</p> : null}
                  <p>Legal profile: {system.legalProfile ?? "global"}</p>
                  {appliedLawPacks.length > 0 ? <p>Law packs: {appliedLawPacks.join(" · ")}</p> : null}
                </div>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
