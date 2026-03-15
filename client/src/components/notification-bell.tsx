import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bell, Check, CheckCheck, FileText, ShieldAlert, AlertTriangle, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Notification } from "@shared/schema";

const typeIcons: Record<string, any> = {
  approval_assigned: FileText,
  workflow_status_changed: Activity,
  high_risk_created: ShieldAlert,
  control_overdue: AlertTriangle,
  evidence_requested: FileText,
  system_modified: Activity,
};

const typeColors: Record<string, string> = {
  approval_assigned: "text-blue-500",
  workflow_status_changed: "text-purple-500",
  high_risk_created: "text-red-500",
  control_overdue: "text-orange-500",
  evidence_requested: "text-yellow-500",
  system_modified: "text-green-500",
};

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
  };

  return friendlyLabels[notif.type] ?? {
    title: "Governance update",
    message: "There is new activity in your organization.",
  };
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count ?? 0;

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
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
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white"
              data-testid="badge-unread-count"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h4 className="text-sm font-semibold">Notifications</h4>
          {unreadCount > 0 && (
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
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.slice(0, 20).map((notif) => {
                const Icon = typeIcons[notif.type] || Activity;
                const iconColor = typeColors[notif.type] || "text-muted-foreground";
                const copy = formatNotificationCopy(notif);
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
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {notif.createdAt ? new Date(notif.createdAt).toLocaleString() : ""}
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
