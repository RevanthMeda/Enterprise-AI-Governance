import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant } from "../tenant";
import { notificationService } from "../services/notificationService";
import { notificationDigestService } from "../services/notificationDigestService";
import { buildAuthUserPayload } from "../auth";
import { routeParam } from "./_helpers";

export function registerNotificationsRoutes(app: Express): void {
  app.get("/api/notifications", requireAuth, requireTenant, async (req, res) => {
    try {
      const notifs = await notificationService.listForUser({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json(notifs);
    } catch (err: any) {
      console.error("Failed to load notifications:", err);
      res.status(500).json({ message: "Failed to load notifications" });
    }
  });

  app.get("/api/notifications/digest", requireAuth, requireTenant, async (req, res) => {
    try {
      const authPayload = await buildAuthUserPayload(req.user!, req.session.currentOrganizationId);
      const digest = await notificationDigestService.getForUser({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        mutedTypes: authPayload.currentOrganizationOnboarding?.notificationPreferences.mutedTypes ?? [],
      });
      res.json(digest);
    } catch (err: any) {
      console.error("Failed to load notification digest:", err);
      res.status(500).json({ message: "Failed to load notification digest" });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, requireTenant, async (req, res) => {
    try {
      const count = await notificationService.getUnreadCountForUser({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json({ count });
    } catch (err: any) {
      console.error("Failed to load unread notification count:", err);
      res.status(500).json({ message: "Failed to load unread notification count" });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, requireTenant, async (req, res) => {
    try {
      const updated = await notificationService.markRead({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        notificationId: routeParam(req.params.id),
      });
      if (!updated) return res.status(404).json({ message: "Notification not found" });
      res.json(updated);
    } catch (err: any) {
      console.error("Failed to mark notification as read:", err);
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, requireTenant, async (req, res) => {
    await notificationService.markAllRead({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
    });
    res.json({ message: "All notifications marked as read" });
  });
}
