import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Activity, AlertTriangle, Command as CommandIcon, Fingerprint, Search, Server } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/queryClient";
import { getAppAccess } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";
import {
  getVisibleWorkspaceActions,
  getWorkspaceGuideForPath,
} from "@/lib/workspace-commanding";
import type { WorkspaceSearchResponse, WorkspaceSearchResult } from "@shared/workspace-search";

function getResultIcon(kind: WorkspaceSearchResult["kind"]) {
  switch (kind) {
    case "system":
      return Server;
    case "incident":
      return AlertTriangle;
    case "decision_trace":
      return Fingerprint;
    default:
      return Activity;
  }
}

export function GlobalCommandCenter() {
  const { user } = useAuth();
  const access = getAppAccess(user);
  const [location, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleActions = useMemo(() => getVisibleWorkspaceActions(access), [access]);
  const currentGuide = getWorkspaceGuideForPath(location);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { data } = useQuery<WorkspaceSearchResponse>({
    queryKey: ["/api/workspace-search", query],
    enabled: open && query.trim().length >= 2,
    staleTime: 15_000,
    queryFn: async ({ signal }) => {
      const res = await apiFetch(`/api/workspace-search?q=${encodeURIComponent(query.trim())}`, { signal });
      if (!res.ok) {
        throw new Error("Failed to search workspace");
      }
      return (await res.json()) as WorkspaceSearchResponse;
    },
  });

  const filteredActions = visibleActions.filter((action) => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return `${action.title} ${action.description}`.toLowerCase().includes(normalizedQuery);
  });

  const openHref = (href: string) => {
    navigate(href);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden md:inline-flex"
        onClick={() => setOpen(true)}
        data-testid="button-global-command-center"
      >
        <Search className="mr-2 h-4 w-4" />
        Search or jump
        <CommandShortcut>Ctrl/⌘K</CommandShortcut>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        data-testid="button-global-command-center-mobile"
      >
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search systems, incidents, workflows, decision traces, or jump to a page..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          <CommandEmpty>No matching systems, incidents, workflows, or routes.</CommandEmpty>
          <CommandGroup heading="Quick actions">
            {filteredActions.slice(0, 8).map((action) => (
              <CommandItem key={action.key} onSelect={() => openHref(action.href)}>
                <CommandIcon className="h-4 w-4 text-muted-foreground" />
                <div className="flex min-w-0 flex-col">
                  <span>{action.title}</span>
                  <span className="text-xs text-muted-foreground">{action.description}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Workspace results">
            {query.trim().length < 2 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                Type at least 2 characters to search governed workspace records.
              </div>
            ) : null}
            {(data?.results ?? []).map((result) => {
              const Icon = getResultIcon(result.kind);
              return (
                <CommandItem key={`${result.kind}-${result.id}`} onSelect={() => openHref(result.href)}>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div className="flex min-w-0 flex-col">
                    <span>{result.title}</span>
                    <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                  </div>
                  {result.meta ? <Badge variant="outline">{result.meta}</Badge> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Context help">
            <div className="px-2 py-2">
              <p className="text-sm font-medium">{currentGuide.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{currentGuide.summary}</p>
            </div>
            {currentGuide.quickLinks
              .filter((link) => !link.accessKey || access[link.accessKey])
              .map((link) => (
                <CommandItem key={link.href} onSelect={() => openHref(link.href)}>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span>{link.label}</span>
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
