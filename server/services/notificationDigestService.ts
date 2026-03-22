import type { Notification } from "@shared/schema";
import { evaluateIncidentPriority } from "@shared/incident-prioritization";
import type { NotificationDigest } from "@shared/notification-digest";
import { PRIORITY_NOTIFICATION_TYPES, notificationTypeLabels } from "@shared/operator-preferences";
import { incidentService } from "./incidentService";
import { storage } from "../storage";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

function toIsoString(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isPriorityNotification(type: string) {
  return PRIORITY_NOTIFICATION_TYPES.has(type as keyof typeof notificationTypeLabels);
}

export class NotificationDigestService {
  async getForUser(params: {
    organizationId: string;
    actor: Actor;
    mutedTypes?: string[];
  }): Promise<NotificationDigest> {
    const [notifications, incidents] = await Promise.all([
      storage.getNotificationsByOrgUser(params.organizationId, params.actor.id),
      incidentService.listForOrg(params.organizationId, { status: "all" }),
    ]);

    const mutedTypes = new Set(params.mutedTypes ?? []);
    const visibleNotifications = notifications.filter((notification) => !mutedTypes.has(notification.type));
    const unreadNotifications = visibleNotifications.filter((notification) => !notification.read);
    const priorityUnreadCount = unreadNotifications.filter((notification) => isPriorityNotification(notification.type)).length;

    const grouped = new Map<string, { type: string; count: number; latestCreatedAt: string | null; priority: boolean }>();
    for (const notification of unreadNotifications) {
      const existing = grouped.get(notification.type);
      const createdAt = toIsoString(notification.createdAt);
      if (!existing) {
        grouped.set(notification.type, {
          type: notification.type,
          count: 1,
          latestCreatedAt: createdAt,
          priority: isPriorityNotification(notification.type),
        });
        continue;
      }

      existing.count += 1;
      if (!existing.latestCreatedAt || (createdAt && createdAt > existing.latestCreatedAt)) {
        existing.latestCreatedAt = createdAt;
      }
    }

    const groups = Array.from(grouped.values())
      .map((group) => ({
        type: group.type,
        label: notificationTypeLabels[group.type as keyof typeof notificationTypeLabels] ?? group.type.replace(/_/g, " "),
        count: group.count,
        priority: group.priority,
        latestCreatedAt: group.latestCreatedAt,
      }))
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority ? -1 : 1;
        }
        if (b.count !== a.count) {
          return b.count - a.count;
        }
        return (b.latestCreatedAt ?? "").localeCompare(a.latestCreatedAt ?? "");
      });

    const activeIncidents = incidents
      .filter((incident) => incident.status === "open" || incident.status === "contained")
      .map((incident) => {
        const priority = evaluateIncidentPriority(incident);
        return {
          id: incident.id,
          title: incident.title,
          category: incident.category,
          severity: incident.severity,
          status: incident.status,
          owner: incident.owner ?? null,
          dueAt: toIsoString(incident.dueAt),
          detectedAt: toIsoString(incident.detectedAt) ?? new Date().toISOString(),
          priorityLevel: priority.level,
          priorityScore: priority.score,
          breached: priority.breached,
          needsAssignment: priority.needsAssignment,
        };
      })
      .sort((a, b) => {
        if (b.priorityScore !== a.priorityScore) {
          return b.priorityScore - a.priorityScore;
        }
        return (a.dueAt ?? "").localeCompare(b.dueAt ?? "");
      });

    return {
      unreadCount: unreadNotifications.length,
      priorityUnreadCount,
      mutedNotificationCount: notifications.length - visibleNotifications.length,
      urgentIncidentCount: activeIncidents.filter((incident) => incident.priorityLevel === "urgent").length,
      unassignedIncidentCount: activeIncidents.filter((incident) => incident.needsAssignment).length,
      breachedIncidentCount: activeIncidents.filter((incident) => incident.breached).length,
      groups,
      incidentFocus: activeIncidents.slice(0, 5).map(({ breached, needsAssignment, ...incident }) => incident),
    };
  }
}

export const notificationDigestService = new NotificationDigestService();
