import { useLocation } from "wouter";
import { LifeBuoy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAuth } from "@/hooks/use-auth";
import { getAppAccess } from "@/lib/permissions";
import { getWorkspaceGuideForPath } from "@/lib/workspace-commanding";

export function RouteHelpPanel() {
  const { user } = useAuth();
  const access = getAppAccess(user);
  const [location] = useLocation();
  const guide = getWorkspaceGuideForPath(location);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" data-testid="button-route-help">
          <LifeBuoy className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-muted-foreground" />
              {guide.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{guide.summary}</p>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Operator tips</p>
              <div className="space-y-2">
                {guide.tips.map((tip) => (
                  <div key={tip} className="rounded-md border border-border/70 bg-muted/20 px-3 py-2 text-xs">
                    {tip}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Recommended next actions</p>
              <div className="space-y-2">
                {guide.quickLinks
                  .filter((link) => !link.accessKey || access[link.accessKey])
                  .map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      className="flex items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                    >
                      <span>{link.label}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                    </a>
                  ))}
              </div>
            </div>

            <div className="rounded-md border border-dashed border-border/70 bg-background/70 p-3 text-xs text-muted-foreground">
              Use <span className="font-medium text-foreground">Ctrl/⌘K</span> to open workspace search and jump directly to systems, incidents, workflows, and decision traces.
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  );
}
