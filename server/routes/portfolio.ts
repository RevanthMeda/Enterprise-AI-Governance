import type { Express } from "express";
import { requireAuth } from "../auth";
import { portfolioService } from "../services/portfolioService";
import { telemetryPolicyService } from "../services/telemetryPolicyService";
import { z } from "zod";

const telemetryPolicyPatchSchema = z.object({
  driftAlertThreshold: z.number().int().min(1).max(100).optional(),
  driftCriticalThreshold: z.number().int().min(1).max(100).optional(),
  biasFlagThreshold: z.number().int().min(1).max(20).optional(),
  safetyFlagThreshold: z.number().int().min(1).max(20).optional(),
  toxicityWarningThreshold: z.number().int().min(1).max(100).optional(),
  toxicityCriticalThreshold: z.number().int().min(1).max(100).optional(),
  piiFlagThreshold: z.number().int().min(1).max(20).optional(),
  overrideRateWarningThreshold: z.number().int().min(1).max(100).optional(),
  overrideRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
  errorRateWarningThreshold: z.number().int().min(1).max(100).optional(),
  errorRateCriticalThreshold: z.number().int().min(1).max(100).optional(),
  autoEscalateCritical: z.boolean().optional(),
  notifyOnWarning: z.boolean().optional(),
  enforceBlocking: z.boolean().optional(),
  blockOnPii: z.boolean().optional(),
  blockOnSafetyCritical: z.boolean().optional(),
  blockOnRestrictedPrompt: z.boolean().optional(),
  restrictedPromptPatterns: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  shadowModeEnabled: z.boolean().optional(),
  shadowModeLabel: z.string().trim().min(1).max(120).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one telemetry threshold setting must be provided",
});

export function registerPortfolioRoutes(app: Express): void {
  app.get(
    "/api/portfolio-control",
    requireAuth,
    async (req, res) => {
      try {
        const rawPortfolioId = req.query.portfolioId;
        const portfolioId =
          typeof rawPortfolioId === "string"
            ? rawPortfolioId
            : Array.isArray(rawPortfolioId) && typeof rawPortfolioId[0] === "string"
              ? rawPortfolioId[0]
              : undefined;
        const data = await portfolioService.getControlPlane({
          userId: req.user!.id,
          actor: req.user!,
          portfolioId,
        });
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message || "Failed to load portfolio control plane" });
      }
    },
  );

  app.get("/api/portfolio-control/telemetry-policy", requireAuth, async (req, res) => {
    try {
      const rawPortfolioId = req.query.portfolioId;
      const portfolioId =
        typeof rawPortfolioId === "string"
          ? rawPortfolioId
          : Array.isArray(rawPortfolioId) && typeof rawPortfolioId[0] === "string"
            ? rawPortfolioId[0]
            : undefined;

      const available = await portfolioService.listForUser(req.user!.id, req.user!.fullName || req.user!.username);
      const selected = available.find((portfolio) => portfolio.id === portfolioId) ?? available[0];
      if (!selected) {
        return res.status(404).json({ message: "Portfolio not found" });
      }

      const policy = await telemetryPolicyService.getForPortfolio(selected.id);
      return res.json({
        portfolio: selected,
        policy,
      });
    } catch (err: any) {
      return res.status(500).json({ message: err.message || "Failed to load portfolio telemetry policy" });
    }
  });

  app.patch("/api/portfolio-control/telemetry-policy", requireAuth, async (req, res) => {
    try {
      const rawPortfolioId = req.query.portfolioId;
      const portfolioId =
        typeof rawPortfolioId === "string"
          ? rawPortfolioId
          : Array.isArray(rawPortfolioId) && typeof rawPortfolioId[0] === "string"
            ? rawPortfolioId[0]
            : undefined;

      const available = await portfolioService.listForUser(req.user!.id, req.user!.fullName || req.user!.username);
      const selected = available.find((portfolio) => portfolio.id === portfolioId) ?? available[0];
      if (!selected) {
        return res.status(404).json({ message: "Portfolio not found" });
      }
      if (selected.role !== "portfolio_admin") {
        return res.status(403).json({ message: "Portfolio admin access required" });
      }

      const parsed = telemetryPolicyPatchSchema.parse(req.body);
      const updated = await telemetryPolicyService.updateForPortfolio(selected.id, parsed);
      return res.json({
        portfolio: selected,
        policy: updated,
      });
    } catch (err: any) {
      return res.status(400).json({ message: err.message || "Failed to update portfolio telemetry policy" });
    }
  });
}
