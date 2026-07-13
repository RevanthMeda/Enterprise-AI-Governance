import type { Express } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { leads, marketingEvents } from "@shared/schema";
import { safeOutboundFetch } from "../safe-outbound-http";
import { isPlatformAdminUser } from "../auth-visibility";
import { desc } from "drizzle-orm";
import { z } from "zod";
import {
  enforceSharedRateLimits,
  getRateLimitClientAddress,
  globalRateLimitIdentity,
  publicRateLimitPolicies,
} from "../public-rate-limit";
import { boundedPublicMetadataSchema, sanitizeTrackedLocation } from "../public-payload";

const leadCaptureSchema = z.object({
  name: z.string().trim().min(1).max(120),
  workEmail: z.string().trim().email().max(255),
  company: z.string().trim().min(1).max(200),
  role: z.string().trim().min(1).max(120),
  teamSize: z.string().trim().min(1).max(80),
  primaryChallenge: z.string().trim().min(1).max(4000),
  formType: z.enum(["book_demo", "start_pilot"]),
  source: z.string().trim().max(120).optional().nullable(),
  ctaSource: z.string().trim().max(120).optional().nullable(),
  campaign: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
});

const marketingEventSchema = z.object({
  eventName: z.string().trim().min(1).max(120),
  pagePath: z.string().trim().max(500).optional().nullable(),
  section: z.string().trim().max(120).optional().nullable(),
  cta: z.string().trim().max(120).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  campaign: z.string().trim().max(120).optional().nullable(),
  referrer: z.string().trim().max(1000).optional().nullable(),
  metadata: boundedPublicMetadataSchema.optional(),
});

export function registerMarketingRoutes(app: Express): void {
  app.post("/api/track", async (req, res) => {
    const clientAddress = getRateLimitClientAddress(req);
    if (
      !(await enforceSharedRateLimits(req, res, [
        { policy: publicRateLimitPolicies.trackGlobal, identity: globalRateLimitIdentity() },
        { policy: publicRateLimitPolicies.trackIp, identity: [clientAddress] },
      ]))
    ) {
      return;
    }

    const parsed = marketingEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid tracking payload" });
    }

    try {
      await db.insert(marketingEvents).values({
        eventName: parsed.data.eventName,
        pagePath: sanitizeTrackedLocation(parsed.data.pagePath),
        section: parsed.data.section ?? null,
        cta: parsed.data.cta ?? null,
        source: parsed.data.source ?? null,
        campaign: parsed.data.campaign ?? null,
        referrer: sanitizeTrackedLocation(parsed.data.referrer),
        metadata: parsed.data.metadata ?? {},
      });
      return res.status(201).json({ ok: true });
    } catch (error) {
      console.error("Failed to record marketing event:", error);
      return res.status(500).json({ message: "Failed to record event" });
    }
  });

  app.post("/api/leads", async (req, res) => {
    const clientAddress = getRateLimitClientAddress(req);
    if (
      !(await enforceSharedRateLimits(req, res, [
        { policy: publicRateLimitPolicies.leadGlobal, identity: globalRateLimitIdentity() },
        { policy: publicRateLimitPolicies.leadIp, identity: [clientAddress] },
      ]))
    ) {
      return;
    }

    const parsed = leadCaptureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid lead payload" });
    }

    if (
      !(await enforceSharedRateLimits(req, res, [
        {
          policy: publicRateLimitPolicies.leadEmail,
          identity: [parsed.data.workEmail.toLowerCase()],
        },
      ]))
    ) {
      return;
    }

    try {
      const [lead] = await db
        .insert(leads)
        .values({
          name: parsed.data.name,
          workEmail: parsed.data.workEmail,
          company: parsed.data.company,
          role: parsed.data.role,
          teamSize: parsed.data.teamSize,
          primaryChallenge: parsed.data.primaryChallenge,
          formType: parsed.data.formType,
          source: parsed.data.source ?? null,
          ctaSource: parsed.data.ctaSource ?? null,
          campaign: parsed.data.campaign ?? null,
          notes: parsed.data.notes ?? null,
        })
        .returning();

      const webhookUrl = process.env.LEAD_WEBHOOK_URL;
      if (webhookUrl) {
        void safeOutboundFetch(webhookUrl, {
          method: "POST",
          timeoutMs: 5_000,
          maxResponseBytes: 64 * 1024,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "lead.created",
            lead,
          }),
        }).catch((error) => {
          console.error("Lead webhook failed:", error);
        });
      }

      return res.status(201).json({ ok: true, leadId: lead.id });
    } catch (error) {
      console.error("Failed to capture lead:", error);
      return res.status(500).json({ message: "Failed to capture lead" });
    }
  });

  app.get("/api/leads", requireAuth, async (req, res) => {
    if (!isPlatformAdminUser(req.user!)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const records = await db.select().from(leads).orderBy(desc(leads.createdAt));
      return res.json(records);
    } catch (error) {
      console.error("Failed to load leads:", error);
      return res.status(500).json({ message: "Failed to load leads" });
    }
  });
}
