import type { Express } from "express";
import { requireAuth } from "../auth";
import { db } from "../db";
import { leads, marketingEvents } from "@shared/schema";
import { fetchWithTimeout } from "../http";
import { desc } from "drizzle-orm";
import { z } from "zod";

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
  metadata: z.record(z.any()).optional(),
});

export function registerMarketingRoutes(app: Express): void {
  app.post("/api/track", async (req, res) => {
    const parsed = marketingEventSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid tracking payload" });
    }

    try {
      await db.insert(marketingEvents).values({
        eventName: parsed.data.eventName,
        pagePath: parsed.data.pagePath ?? null,
        section: parsed.data.section ?? null,
        cta: parsed.data.cta ?? null,
        source: parsed.data.source ?? null,
        campaign: parsed.data.campaign ?? null,
        referrer: parsed.data.referrer ?? null,
        metadata: parsed.data.metadata ?? {},
      });
      return res.status(201).json({ ok: true });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to record event" });
    }
  });

  app.post("/api/leads", async (req, res) => {
    const parsed = leadCaptureSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid lead payload" });
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
        void fetchWithTimeout(webhookUrl, {
          method: "POST",
          timeoutMs: 5_000,
          timeoutMessage: "Lead webhook timed out",
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
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to capture lead" });
    }
  });

  app.get("/api/leads", requireAuth, async (req, res) => {
    const allowedRoles = new Set(["admin", "cro", "ciso", "compliance_lead"]);
    if (!allowedRoles.has(req.user!.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    try {
      const records = await db.select().from(leads).orderBy(desc(leads.createdAt));
      return res.json(records);
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to load leads" });
    }
  });
}
