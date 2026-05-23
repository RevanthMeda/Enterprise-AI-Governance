import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireTenant } from "../tenant";
import { workspaceSearchService } from "../services/workspaceSearchService";

export function registerSearchRoutes(app: Express): void {
  app.get("/api/workspace-search", requireAuth, requireTenant, async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q : "";
    const results = await workspaceSearchService.search({
      organizationId: req.tenant!.organizationId,
      membershipRole: req.tenant!.membershipRole,
      query,
    });
    res.json({ query, results });
  });
}
