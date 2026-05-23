import type { Express } from "express";
import type { Server } from "http";
import { registerHealthRoutes } from "./routes/health";
import { registerAuthRoutes } from "./routes/auth";
import { registerRegistryRoutes } from "./routes/registry";
import { registerRiskRoutes } from "./routes/risk";
import { registerComplianceRoutes } from "./routes/compliance";
import { registerApprovalsRoutes } from "./routes/approvals";
import { registerAuditRoutes } from "./routes/audit";
import { registerIncidentsRoutes } from "./routes/incidents";
import { registerTelemetryRoutes } from "./routes/telemetry";
import { registerPortfolioRoutes } from "./routes/portfolio";
import { registerNotificationsRoutes } from "./routes/notifications";
import { registerExportRoutes } from "./routes/export";
import { registerSearchRoutes } from "./routes/search";
import { registerMarketingRoutes } from "./routes/marketing";
import { registerAdminRoutes } from "./routes/admin";
import { registerSettingsRoutes } from "./routes/settings";
import { registerAnalyticsRoutes } from "./routes/analytics";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  registerHealthRoutes(app);
  await registerAuthRoutes(app);
  registerRegistryRoutes(app);
  registerRiskRoutes(app);
  registerComplianceRoutes(app);
  registerApprovalsRoutes(app);
  registerAuditRoutes(app);
  registerIncidentsRoutes(app);
  registerTelemetryRoutes(app);
  registerPortfolioRoutes(app);
  registerNotificationsRoutes(app);
  registerExportRoutes(app);
  registerSearchRoutes(app);
  registerMarketingRoutes(app);
  registerAdminRoutes(app);
  registerSettingsRoutes(app);
  registerAnalyticsRoutes(app);
  return httpServer;
}
