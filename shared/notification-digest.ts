import type { IncidentPriorityLevel } from "./incident-prioritization";

export type NotificationDigestGroup = {
  type: string;
  label: string;
  count: number;
  priority: boolean;
  latestCreatedAt: string | null;
};

export type NotificationDigestIncidentFocus = {
  id: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  owner: string | null;
  dueAt: string | null;
  detectedAt: string;
  priorityLevel: IncidentPriorityLevel;
  priorityScore: number;
};

export type NotificationDigest = {
  unreadCount: number;
  priorityUnreadCount: number;
  mutedNotificationCount: number;
  urgentIncidentCount: number;
  unassignedIncidentCount: number;
  breachedIncidentCount: number;
  groups: NotificationDigestGroup[];
  incidentFocus: NotificationDigestIncidentFocus[];
};
