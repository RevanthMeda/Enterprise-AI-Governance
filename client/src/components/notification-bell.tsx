import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, CheckCheck, FileText, ShieldAlert, AlertTriangle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDateTime } from "@/lib/date-format";
import { formatLawPackLabel, formatLegalProfileLabel } from "@/lib/governance-display";
import { buildIncidentHref } from "@/lib/incident-navigation";
import { useAuth, type AuthUser } from "@/hooks/use-auth";
import type { Notification } from "@shared/schema";
import type { NotificationDigest } from "@shared/notification-digest";
import {
  PRIORITY_NOTIFICATION_TYPES,
  notificationFeedModes,
  notificationTypeLabels,
} from "@shared/operator-preferences";

const typeIcons: Record<string, any> = {
  approval_assigned: FileText,
  workflow_status_changed: Activity,
  high_risk_created: ShieldAlert,
  control_overdue: AlertTriangle,
  evidence_requested: FileText,
  system_modified: Activity,
  automation_action: AlertTriangle,
};

const typeColors: Record<string, string> = {
  approval_assigned: "text-blue-500",
  workflow_status_changed: "text-purple-500",
  high_risk_created: "text-red-500",
  control_overdue: "text-orange-500",
  evidence_requested: "text-yellow-500",
  system_modified: "text-green-500",
  automation_action: "text-amber-500",
};

type NotificationFeedFilter = "all" | "priority" | "unread";

function isPriorityNotification(type: string) {
  return PRIORITY_NOTIFICATION_TYPES.has(type as keyof typeof notificationTypeLabels);
}

function formatNotificationCopy(notif: Notification) {
  const generatedSeed = /^Generated notification \d+ for /i.test(notif.message ?? "");
  if (!generatedSeed) {
    return { title: notif.title, message: notif.message };
  }

  const friendlyLabels: Record<string, { title: string; message: string }> = {
    approval_assigned: {
      title: "Approval review assigned",
      message: "A workflow in your organization is awaiting review.",
    },
    workflow_status_changed: {
      title: "Workflow status updated",
      message: "An approval workflow changed state and may need follow-up.",
    },
    high_risk_created: {
      title: "High-risk system flagged",
      message: "A high-risk system requires governance attention.",
    },
    control_overdue: {
      title: "Control overdue",
      message: "A compliance control is overdue and should be reviewed.",
    },
    evidence_requested: {
      title: "Evidence requested",
      message: "Supporting evidence is needed for an active governance item.",
    },
    system_modified: {
      title: "System updated",
      message: "An AI system record was updated in the registry.",
    },
    automation_action: {
      title: "Automation follow-up",
      message: "A governance automation sweep raised a reviewer or owner follow-up task.",
    },
  };

  return friendlyLabels[notif.type] ?? {
    title: "Governance update",
    message: "There is new activity in your organization.",
  };
}

function getNotificationGovernanceMetadata(notif: Notification) {
  const metadata =
    notif.metadata && typeof notif.metadata === "object" && !Array.isArray(notif.metadata)
      ? (notif.metadata as Record<string, unknown>)
      : null;

  const legalProfileApplied =
    typeof metadata?.legalProfileApplied === "string" ? metadata.legalProfileApplied : null;
  const lawPackIdsApplied = Array.isArray(metadata?.lawPackIdsApplied)
    ? metadata.lawPackIdsApplied.filter((value): value is string => typeof value === "string")
    : [];

  return { legalProfileApplied, lawPackIdsApplied };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [feedFilter, setFeedFilter] = useState<NotificationFeedFilter>("all");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const notificationPreferences = user?.currentOrganizationOnboarding?.notificationPreferences;
  const feedMode = notificationPreferences?.feedMode ?? "stream";
  const priorityOnly = notificationPreferences?.priorityOnly ?? false;
  const mutedTypes = new Set(notificationPreferences?.mutedTypes ?? []);

  const notificationsQuery = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const unreadQuery = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const digestQuery = useQuery<NotificationDigest>({
    queryKey: ["/api/notifications/digest"],
    refetchInterval: 30000,
  });

  const notifications = notificationsQuery.data ?? [];
  const digest = digestQuery.data;
  const unreadCount = unreadQuery.isSuccess ? unreadQuery.data.count : null;
  const notificationsUnavailable = notificationsQuery.isError || unreadQuery.isError || digestQuery.isError;
  const digestUnavailable = digestQuery.isLoading || digestQuery.isError;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/digest"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/digest"] });
    },
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async (nextPrefs: Partial<{ priorityOnly: boolean; feedMode: (typeof notificationFeedModes)[number] }>) => {
      const onboarding = user?.currentOrganizationOnboarding;
      const res = await apiRequest("POST", "/api/auth/onboarding-state", {
        notificationPreferences: {
          feedMode: nextPrefs.feedMode ?? onboarding?.notificationPreferences?.feedMode ?? "stream",
          priorityOnly: nextPrefs.priorityOnly ?? onboarding?.notificationPreferences?.priorityOnly ?? false,
          mutedTypes: onboarding?.notificationPreferences?.mutedTypes ?? [],
        },
      });
      return (await res.json()) as AuthUser;
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/digest"] });
    },
  });

  const handleNotificationClick = (notif: Notification) => {
    if (!notif.read) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.entityType === "ai_system" && notif.entityId) {
      navigate(`/systems/${notif.entityId}`);
      setOpen(false);
    } else if (notif.entityType === "approval_workflow") {
      navigate("/approvals");
      setOpen(false);
    } else if ((notif.entityType === "ai_incident" || notif.entityType === "incident") && notif.entityId) {
      navigate(buildIncidentHref(notif.entityId));
      setOpen(false);
    } else if (notif.entityType === "telemetry_event") {
      navigate("/runtime-monitoring");
      setOpen(false);
    }
  };

  const visibleNotifications = notifications.filter((notif) => {
    if (mutedTypes.has(notif.type as keyof typeof notificationTypeLabels)) {
      return false;
    }
    if (priorityOnly && !isPriorityNotification(notif.type)) {
      return false;
    }
    if (feedFilter === "priority" && !isPriorityNotification(notif.type)) {
      return false;
    }
    if (feedFilter === "unread" && notif.read) {
      return false;
    }
    return true;
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={notificationsUnavailable ? "Open notifications; notification data unavailable" : "Open notifications"}
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
          {notificationsUnavailable ? (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white"
              aria-hidden="true"
              data-testid="badge-notifications-unavailable"
            >
              !
            </span>
          ) : unreadCount !== null && unreadCount > 0 ? (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div>
            <h4 className="text-sm font-semibold">Notifications</h4>
            <p className="text-[10px] text-muted-foreground">
              {feedMode === "digest"
                ? "Digest mode highlights themes and top incidents first."
                : priorityOnly
                  ? "Priority-only feed is active."
                  : "All in-app governance updates."}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={feedMode === "stream" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => updatePreferenceMutation.mutate({ feedMode: "stream" })}
            >
              Stream
            </Button>
            <Button
              variant={feedMode === "digest" ? "default" : "ghost"}
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => updatePreferenceMutation.mutate({ feedMode: "digest" })}
            >
              Digest
            </Button>
            <Button
              variant={priorityOnly ? "default" : "ghost"}
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => updatePreferenceMutation.mutate({ priorityOnly: !priorityOnly })}
            >
              Priority only
            </Button>
            {unreadCount !== null && unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => markAllReadMutation.mutate()}
                data-testid="button-mark-all-read"
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>
        {notificationsUnavailable ? (
          <div className="border-b bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:bg-amber-950/30 dark:text-amber-200" role="alert">
            <div className="flex items-center justify-between gap-3">
              <span>Notification data is unavailable. Counts and empty states are hidden until it reloads.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => void Promise.all([
                  notificationsQuery.refetch(),
                  unreadQuery.refetch(),
                  digestQuery.refetch(),
                ])}
              >
                Retry
              </Button>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {(["all", "priority", "unread"] as NotificationFeedFilter[]).map((filter) => (
            <Button
              key={filter}
              type="button"
              size="sm"
              variant={feedFilter === filter ? "default" : "outline"}
              className="h-7 text-[11px]"
              onClick={() => setFeedFilter(filter)}
            >
              {filter === "all" ? "All" : filter === "priority" ? "Needs action" : "Unread"}
            </Button>
          ))}
          {mutedTypes.size > 0 ? (
            <Badge variant="outline" className="h-6 px-2 text-[10px]">
              {mutedTypes.size} muted in Settings
            </Badge>
          ) : null}
          <a href="/settings?tab=governance" className="ml-auto text-[11px] text-muted-foreground underline underline-offset-4">
            Preferences
          </a>
        </div>
        {feedMode === "digest" ? (
          <div className="border-b px-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Needs action</div>
                <div className="mt-1 text-lg font-semibold">{digestUnavailable ? "—" : digest?.priorityUnreadCount ?? 0}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Urgent incidents</div>
                <div className="mt-1 text-lg font-semibold">{digestUnavailable ? "—" : digest?.urgentIncidentCount ?? 0}</div>
              </div>
              <div className="rounded-md border bg-muted/20 p-2">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Unassigned</div>
                <div className="mt-1 text-lg font-semibold">{digestUnavailable ? "—" : digest?.unassignedIncidentCount ?? 0}</div>
              </div>
            </div>
            {digest?.groups?.length ? (
              <div className="mt-3">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Unread themes</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {digest.groups.slice(0, 4).map((group) => (
                    <Badge key={group.type} variant={group.priority ? "secondary" : "outline"} className="text-[9px]">
                      {group.label} · {group.count}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            {digest?.incidentFocus?.length ? (
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Reviewer focus</p>
                {digest.incidentFocus.slice(0, 3).map((incident) => (
                  <button
                    key={incident.id}
                    type="button"
                    className="w-full rounded-md border px-2.5 py-2 text-left hover:bg-muted/40"
                    onClick={() => {
                      navigate(buildIncidentHref(incident.id));
                      setOpen(false);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="line-clamp-1 text-[11px] font-medium">{incident.title}</span>
                      <Badge variant={incident.priorityLevel === "urgent" ? "destructive" : "outline"} className="text-[9px]">
                        {incident.priorityLevel}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                      <span>{incident.category}</span>
                      <span>•</span>
                      <span>{incident.severity}</span>
                      <span>•</span>
                      <span>{incident.owner ? `Owner ${incident.owner}` : "Needs assignment"}</span>
                    </div>
                  </button>
                ))}
                {digest.breachedIncidentCount > 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    {digest.breachedIncidentCount} active incident{digest.breachedIncidentCount === 1 ? "" : "s"} already past containment SLA.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        <ScrollArea className="max-h-80">
          {notificationsQuery.isLoading ? (
            <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
              Loading notifications…
            </div>
          ) : notificationsQuery.isError ? (
            <div className="flex items-center justify-center px-4 py-8 text-center text-xs text-muted-foreground">
              Notifications are unavailable. Retry from the warning above.
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">
                {notifications.length === 0 ? "No notifications yet" : "No notifications match the current filter"}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {feedMode === "digest" ? (
                <div className="px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Latest matching events
                </div>
              ) : null}
              {visibleNotifications.slice(0, 20).map((notif) => {
                const Icon = typeIcons[notif.type] || Activity;
                const iconColor = typeColors[notif.type] || "text-muted-foreground";
                const copy = formatNotificationCopy(notif);
                const governanceMetadata = getNotificationGovernanceMetadata(notif);
                return (
                  <button
                    key={notif.id}
                    className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors flex items-start gap-2.5 ${
                      !notif.read ? "bg-primary/5" : ""
                    }`}
                    onClick={() => handleNotificationClick(notif)}
                    data-testid={`notification-item-${notif.id}`}
                  >
                    <div className={`mt-0.5 shrink-0 ${iconColor}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-xs leading-tight ${!notif.read ? "font-semibold" : "font-medium"}`}>
                          {copy.title}
                        </p>
                        {!notif.read && (
                          <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{copy.message}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {isPriorityNotification(notif.type) ? (
                          <Badge variant="secondary" className="h-5 px-1.5 text-[9px]">
                            Needs action
                          </Badge>
                        ) : null}
                        {notificationTypeLabels[notif.type as keyof typeof notificationTypeLabels] ? (
                          <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                            {notificationTypeLabels[notif.type as keyof typeof notificationTypeLabels]}
                          </Badge>
                        ) : null}
                      </div>
                      {(governanceMetadata.legalProfileApplied || governanceMetadata.lawPackIdsApplied.length > 0) && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {governanceMetadata.legalProfileApplied && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[9px]">
                              {formatLegalProfileLabel(governanceMetadata.legalProfileApplied)}
                            </Badge>
                          )}
                          {governanceMetadata.lawPackIdsApplied.slice(0, 2).map((packId) => (
                            <Badge key={packId} variant="outline" className="h-5 px-1.5 text-[9px]">
                              {formatLawPackLabel(packId)}
                            </Badge>
                          ))}
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDateTime(notif.createdAt)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
