import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAiSystemSchema, insertApprovalWorkflowSchema, insertSystemControlSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/ai-systems", async (_req, res) => {
    const systems = await storage.getAiSystems();
    res.json(systems);
  });

  app.get("/api/ai-systems/:id", async (req, res) => {
    const system = await storage.getAiSystem(req.params.id);
    if (!system) return res.status(404).json({ message: "System not found" });
    res.json(system);
  });

  app.post("/api/ai-systems", async (req, res) => {
    try {
      const parsed = insertAiSystemSchema.parse(req.body);
      const system = await storage.createAiSystem(parsed);
      await storage.createAuditLog({
        entityType: "ai_system",
        entityId: system.id,
        action: "created",
        performedBy: req.body.owner || "System",
        details: `AI system "${system.name}" registered`,
      });
      res.status(201).json(system);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/ai-systems/:id", async (req, res) => {
    const updated = await storage.updateAiSystem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "System not found" });
    await storage.createAuditLog({
      entityType: "ai_system",
      entityId: updated.id,
      action: "updated",
      performedBy: "System",
      details: `AI system "${updated.name}" updated`,
    });
    res.json(updated);
  });

  app.delete("/api/ai-systems/:id", async (req, res) => {
    const system = await storage.getAiSystem(req.params.id);
    if (!system) return res.status(404).json({ message: "System not found" });
    await storage.deleteAiSystem(req.params.id);
    await storage.createAuditLog({
      entityType: "ai_system",
      entityId: req.params.id,
      action: "deleted",
      performedBy: "System",
      details: `AI system "${system.name}" deleted`,
    });
    res.status(204).send();
  });

  app.get("/api/compliance-controls", async (_req, res) => {
    const controls = await storage.getComplianceControls();
    res.json(controls);
  });

  app.get("/api/system-controls", async (_req, res) => {
    const controls = await storage.getSystemControls();
    res.json(controls);
  });

  app.post("/api/system-controls", async (req, res) => {
    try {
      const parsed = insertSystemControlSchema.parse(req.body);
      const sc = await storage.createSystemControl(parsed);
      res.status(201).json(sc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/system-controls/:id", async (req, res) => {
    const updated = await storage.updateSystemControl(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Control not found" });
    await storage.createAuditLog({
      entityType: "system_control",
      entityId: updated.id,
      action: "status_changed",
      performedBy: updated.assignee || "System",
      details: `Control status changed to "${updated.status}"`,
    });
    res.json(updated);
  });

  app.get("/api/approval-workflows", async (_req, res) => {
    const workflows = await storage.getApprovalWorkflows();
    res.json(workflows);
  });

  app.post("/api/approval-workflows", async (req, res) => {
    try {
      const parsed = insertApprovalWorkflowSchema.parse(req.body);
      const wf = await storage.createApprovalWorkflow(parsed);
      await storage.createAuditLog({
        entityType: "approval_workflow",
        entityId: wf.id,
        action: "created",
        performedBy: wf.requestedBy,
        details: `Approval workflow "${wf.title}" created`,
      });
      res.status(201).json(wf);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/approval-workflows/:id", async (req, res) => {
    const updated = await storage.updateApprovalWorkflow(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Workflow not found" });
    const action = req.body.status === "approved" ? "approved" : req.body.status === "rejected" ? "rejected" : "status_changed";
    await storage.createAuditLog({
      entityType: "approval_workflow",
      entityId: updated.id,
      action,
      performedBy: updated.reviewer || "System",
      details: `Workflow "${updated.title}" ${action}`,
    });
    res.json(updated);
  });

  app.get("/api/audit-logs", async (_req, res) => {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  return httpServer;
}
