import { AlertCircle, ExternalLink, PlugZap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type JiraTicketLinkProps = {
  issueKey?: string | null;
  issueUrl?: string | null;
  syncStatus?: string | null;
  className?: string;
  compact?: boolean;
  showEmpty?: boolean;
};

export function JiraTicketLink({
  issueKey,
  issueUrl,
  syncStatus,
  className,
  compact = false,
  showEmpty = false,
}: JiraTicketLinkProps) {
  if (issueKey) {
    const content = (
      <Badge
        variant="outline"
        className={cn("gap-1 whitespace-nowrap text-[10px]", className)}
        data-testid="badge-jira-issue"
      >
        <ExternalLink className="h-3 w-3" />
        {compact ? issueKey : `Jira ${issueKey}`}
      </Badge>
    );

    if (!issueUrl) {
      return content;
    }

    return (
      <a
        href={issueUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => event.stopPropagation()}
        className="inline-flex"
        data-testid="link-jira-issue"
      >
        {content}
      </a>
    );
  }

  if (!showEmpty) {
    return null;
  }

  if (syncStatus === "error") {
    return (
      <Badge
        variant="destructive"
        className={cn("gap-1 whitespace-nowrap text-[10px]", className)}
        data-testid="badge-jira-error"
      >
        <AlertCircle className="h-3 w-3" />
        Jira error
      </Badge>
    );
  }

  if (syncStatus === "pending") {
    return (
      <Badge
        variant="secondary"
        className={cn("gap-1 whitespace-nowrap text-[10px]", className)}
        data-testid="badge-jira-pending"
      >
        <PlugZap className="h-3 w-3" />
        Jira pending
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap text-[10px] text-muted-foreground", className)}
      data-testid="badge-jira-not-configured"
    >
      <PlugZap className="h-3 w-3" />
      Jira not configured
    </Badge>
  );
}
