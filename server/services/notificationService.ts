import { storage } from "../storage";
import type { InsertNotification } from "@shared/schema";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

export class NotificationService {
  async listForUser(params: { organizationId: string; actor: Actor }) {
    return storage.getNotificationsByOrgUser(params.organizationId, params.actor.id);
  }

  async getUnreadCountForUser(params: { organizationId: string; actor: Actor }) {
    return storage.getUnreadNotificationCountByOrgUser(params.organizationId, params.actor.id);
  }

  async markRead(params: { organizationId: string; actor: Actor; notificationId: string }) {
    return storage.markNotificationReadByOrgUser(params.organizationId, params.actor.id, params.notificationId);
  }

  async markAllRead(params: { organizationId: string; actor: Actor }) {
    return storage.markAllNotificationsReadByOrgUser(params.organizationId, params.actor.id);
  }

  async createForUser(params: {
    organizationId: string;
    userId: string;
    input: Omit<InsertNotification, "organizationId" | "userId">;
  }) {
    return storage.createNotificationForOrg(params.organizationId, {
      ...params.input,
      userId: params.userId,
    });
  }
}

export const notificationService = new NotificationService();
