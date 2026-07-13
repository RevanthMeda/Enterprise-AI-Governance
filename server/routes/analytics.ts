import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant, requireOrgRole } from "../tenant";
import { storage } from "../storage";
import { dashboardService } from "../services/dashboardService";
import { analyticsService } from "../services/analyticsService";
import { governanceMaturityService } from "../services/governanceMaturityService";
import { governanceAutomationService } from "../services/governanceAutomationService";
import { governanceEventService } from "../services/governanceEventService";
import { activityService } from "../services/activityService";
import { calendarService } from "../services/calendarService";
import { auditService } from "../services/auditService";
import { updateOrganizationSettingsForTenant } from "../services/organizationSettingsService";
import {
  analyticsReportCadences,
  analyticsReportFormats,
  analyticsReportSectionIds,
  buildAnalyticsReportPlanId,
  sanitizeAnalyticsReportBuilderConfig,
} from "@shared/analytics-report-builder";
import {
  governanceAutomationRuleKeys,
  governanceAutomationRunModes,
  sanitizeGovernanceAutomationConfig,
} from "@shared/governance-automation-builder";
import { analyticsReportPresetIds } from "@shared/analytics-overview";
import { z } from "zod";
import {
  routeParam,
  getAnalyticsReportBuilderSettings,
  applyAnalyticsReportBuilderSettings,
  getGovernanceAutomationSettings,
  applyGovernanceAutomationSettings,
} from "./_helpers";

const analyticsReportBuilderUpdateSchema = z.object({
  defaultPlanId: z.string().trim().min(1).max(60).nullable().optional(),
  plans: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60).optional(),
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().max(240).optional().default(""),
        presetId: z.enum(analyticsReportPresetIds),
        format: z.enum(analyticsReportFormats),
        cadence: z.enum(analyticsReportCadences),
        sections: z.array(z.enum(analyticsReportSectionIds)).min(1).max(analyticsReportSectionIds.length),
        lastRunAt: z.string().datetime().nullable().optional(),
      }),
    )
    .max(12),
});

const governanceAutomationConfigSchema = z.object({
  runMode: z.enum(governanceAutomationRunModes),
  rules: z
    .array(
      z.object({
        key: z.enum(governanceAutomationRuleKeys),
        enabled: z.boolean(),
        minSeverity: z.enum(["critical", "high", "medium"]),
        staleDays: z.number().int().min(0).max(30),
        description: z.string().trim().max(200),
      }),
    )
    .max(governanceAutomationRuleKeys.length),
});

export function registerAnalyticsRoutes(app: Express): void {
  app.get("/api/dashboard/trends", requireAuth, requireTenant, async (req, res) => {
    try {
      const trends = await dashboardService.getTrends({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json(trends);
    } catch (err: any) {
      console.error("Failed to load dashboard trends:", err);
      res.status(500).json({ message: "Failed to load dashboard trends" });
    }
  });

  app.get(
    "/api/analytics/overview",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const overview = await analyticsService.getOverview({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          membershipRole: req.tenant!.membershipRole,
        });
        res.json(overview);
      } catch (err: any) {
        console.error("Failed to load analytics overview:", err);
        res.status(500).json({ message: "Failed to load analytics overview" });
      }
    },
  );

  app.get(
    "/api/governance-maturity",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const assessment = await governanceMaturityService.getAssessment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          membershipRole: req.tenant!.membershipRole,
        });
        res.json(assessment);
      } catch (err: any) {
        console.error("Failed to load governance maturity assessment:", err);
        res.status(500).json({ message: "Failed to load governance maturity assessment" });
      }
    },
  );

  app.get(
    "/api/analytics/report-builder",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }
        res.json(getAnalyticsReportBuilderSettings(organization.settings));
      } catch (err: any) {
        console.error("Failed to load report builder settings:", err);
        res.status(500).json({ message: "Failed to load report builder settings" });
      }
    },
  );

  app.put(
    "/api/analytics/report-builder",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = analyticsReportBuilderUpdateSchema.parse(req.body);
        const normalizedPlans = parsed.plans.map((plan) => ({
          id: buildAnalyticsReportPlanId(plan.id ?? plan.name, `report-${Math.random().toString(36).slice(2, 8)}`),
          name: plan.name,
          description: plan.description ?? "",
          presetId: plan.presetId,
          format: plan.format,
          cadence: plan.cadence,
          sections: plan.sections,
          lastRunAt: plan.lastRunAt ?? null,
        }));
        const nextConfig = sanitizeAnalyticsReportBuilderConfig({
          defaultPlanId: parsed.defaultPlanId ?? normalizedPlans[0]?.id ?? null,
          plans: normalizedPlans,
        });

        const updated = await updateOrganizationSettingsForTenant(
          req.tenant!.organizationId,
          (currentSettings) => applyAnalyticsReportBuilderSettings(currentSettings, nextConfig),
        );
        if (!updated) {
          return res.status(404).json({ message: "Organization not found" });
        }

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "analytics_report_builder",
            entityId: updated.organizationId,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Analytics report builder updated with ${nextConfig.plans.length} saved plan(s).`,
          },
        });

        res.json(getAnalyticsReportBuilderSettings(updated.settings));
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to update report builder settings" });
      }
    },
  );

  app.post(
    "/api/analytics/report-builder/:planId/run",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const planId = buildAnalyticsReportPlanId(routeParam(req.params.planId), routeParam(req.params.planId));
        const lastRunAt = new Date().toISOString();
        const updated = await updateOrganizationSettingsForTenant(
          req.tenant!.organizationId,
          (currentSettings) => {
            const current = getAnalyticsReportBuilderSettings(currentSettings);
            if (!current.plans.some((plan: { id: string }) => plan.id === planId)) {
              throw Object.assign(new Error("Report plan not found"), { status: 404 });
            }

            return applyAnalyticsReportBuilderSettings(currentSettings, {
              ...current,
              plans: current.plans.map((plan: { id: string; [k: string]: unknown }) =>
                plan.id === planId ? { ...plan, lastRunAt } : plan,
              ),
            });
          },
        );
        if (!updated) {
          return res.status(404).json({ message: "Organization not found" });
        }
        const updatedConfig = getAnalyticsReportBuilderSettings(updated.settings);

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "analytics_report_builder",
            entityId: planId,
            action: "run",
            performedBy: req.user!.fullName,
            details: `Analytics report plan "${planId}" was marked as exported.`,
          },
        });

        res.json({
          ok: true,
          plan: updatedConfig.plans.find((plan: { id: string }) => plan.id === planId) ?? null,
        });
      } catch (err: any) {
        res.status(err.status ?? 400).json({ message: err.message || "Failed to record report export" });
      }
    },
  );

  app.get(
    "/api/dashboard/exit-readiness",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const data = await dashboardService.getExitReadiness({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
        });
        res.json(data);
      } catch (err: any) {
        console.error("Failed to load exit readiness:", err);
        res.status(500).json({ message: "Failed to load exit readiness" });
      }
    },
  );

  app.get("/api/activity-dashboard", requireAuth, requireTenant, async (req, res) => {
    try {
      const data = await activityService.getActivityDashboard({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        membershipRole: req.tenant!.membershipRole,
      });
      res.json(data);
    } catch (err: any) {
      console.error("Failed to load activity dashboard:", err);
      res.status(500).json({ message: "Failed to load activity dashboard" });
    }
  });

  app.get(
    "/api/governance-events",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "reviewer", "system_owner", "auditor"),
    async (req, res) => {
      try {
        const feed = await governanceEventService.getFeedForOrg({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
        });
        res.json(feed);
      } catch (err: any) {
        console.error("Failed to load governance events:", err);
        res.status(500).json({ message: "Failed to load governance events" });
      }
    },
  );

  app.post(
    "/api/governance-events/test",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const result = await governanceEventService.emitForOrg({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          eventType: "governance.test",
          title: "Governance event test",
          summary: "Manual governance event test queued from the integrations workspace.",
          severity: "info",
          entityType: "integration_test",
          metadata: {
            initiatedFrom: "integrations",
          },
        });
        res.json(result);
      } catch (err: any) {
        console.error("Failed to queue governance event test:", err);
        res.status(500).json({ message: "Failed to queue governance event test" });
      }
    },
  );

  app.get(
    "/api/governance-automation/config",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const organization = await storage.getOrganizationById(req.tenant!.organizationId);
        if (!organization) {
          return res.status(404).json({ message: "Organization not found" });
        }
        res.json(getGovernanceAutomationSettings(organization.settings));
      } catch (err: any) {
        console.error("Failed to load governance automation config:", err);
        res.status(500).json({ message: "Failed to load governance automation config" });
      }
    },
  );

  app.put(
    "/api/governance-automation/config",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const parsed = governanceAutomationConfigSchema.parse(req.body);
        const nextConfig = sanitizeGovernanceAutomationConfig(parsed);
        const updated = await updateOrganizationSettingsForTenant(
          req.tenant!.organizationId,
          (currentSettings) => applyGovernanceAutomationSettings(currentSettings, nextConfig),
        );
        if (!updated) {
          return res.status(404).json({ message: "Organization not found" });
        }

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "governance_automation",
            entityId: updated.organizationId,
            action: "config_updated",
            performedBy: req.user!.fullName,
            details: `Governance automation config updated in ${nextConfig.runMode} mode.`,
          },
        });

        res.json(getGovernanceAutomationSettings(updated.settings));
      } catch (err: any) {
        res.status(400).json({ message: err.message || "Failed to update governance automation config" });
      }
    },
  );

  app.get(
    "/api/governance-automation/summary",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const summary = await governanceAutomationService.getSummaryForOrg({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
        });
        res.json(summary);
      } catch (err: any) {
        console.error("Failed to load governance automation summary:", err);
        res.status(500).json({ message: "Failed to load governance automation summary" });
      }
    },
  );

  app.post(
    "/api/governance-automation/run",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      try {
        const result = await governanceAutomationService.runForOrg({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
        });
        res.json(result);
      } catch (err: any) {
        console.error("Failed to run governance remediation sweep:", err);
        res.status(500).json({ message: "Failed to run governance remediation sweep" });
      }
    },
  );

  app.get("/api/calendar-events", requireAuth, requireTenant, async (req, res) => {
    try {
      const monthParam = req.query.month as string | undefined;
      const typeFilter = req.query.type as string | undefined;
      const events = await calendarService.getCalendarEvents({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        membershipRole: req.tenant!.membershipRole,
        month: monthParam,
        type: typeFilter,
      });
      res.json(events);
    } catch (err: any) {
      console.error("Failed to load calendar events:", err);
      res.status(500).json({ message: "Failed to load calendar events" });
    }
  });
}
