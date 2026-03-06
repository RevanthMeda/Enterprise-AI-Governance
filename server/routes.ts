import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import { storage } from "./storage";
import { insertAiSystemSchema, insertApprovalWorkflowSchema, insertSystemControlSchema } from "@shared/schema";
import { hashPassword } from "./auth";
import { requireAuth, requireRole } from "./auth";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password, fullName, email } = req.body;
      if (!username || !password || !fullName) {
        return res.status(400).json({ message: "Username, password, and full name are required" });
      }
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const allUsers = await storage.getAllUsers();
      const assignedRole = allUsers.length === 0 ? "admin" : "reviewer";
      const hashed = await hashPassword(password);
      const user = await storage.createUser({
        username,
        password: hashed,
        fullName,
        email: email || null,
        role: assignedRole,
      });
      req.login(
        { id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role },
        (err) => {
          if (err) return res.status(500).json({ message: "Login failed after registration" });
          return res.status(201).json({ id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role });
        }
      );
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: Express.User | false, info: any) => {
      if (err) return next(err);
      if (!user) return res.status(401).json({ message: info?.message || "Invalid credentials" });
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        return res.json({ id: user.id, username: user.username, fullName: user.fullName, email: user.email, role: user.role });
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });

  app.get("/api/ai-systems", requireAuth, async (_req, res) => {
    const systems = await storage.getAiSystems();
    res.json(systems);
  });

  app.get("/api/ai-systems/:id", requireAuth, async (req, res) => {
    const system = await storage.getAiSystem(req.params.id);
    if (!system) return res.status(404).json({ message: "System not found" });
    res.json(system);
  });

  app.get("/api/ai-systems/:id/controls", requireAuth, async (req, res) => {
    const controls = await storage.getSystemControlsBySystem(req.params.id);
    res.json(controls);
  });

  app.get("/api/ai-systems/:id/workflows", requireAuth, async (req, res) => {
    const workflows = await storage.getApprovalWorkflowsBySystem(req.params.id);
    res.json(workflows);
  });

  app.get("/api/ai-systems/:id/audit-logs", requireAuth, async (req, res) => {
    const logs = await storage.getAuditLogsByEntity(req.params.id);
    res.json(logs);
  });

  app.post("/api/ai-systems", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead", "system_owner"), async (req, res) => {
    try {
      const parsed = insertAiSystemSchema.parse(req.body);
      const system = await storage.createAiSystem(parsed);
      await storage.createAuditLog({
        entityType: "ai_system",
        entityId: system.id,
        action: "created",
        performedBy: req.user!.fullName,
        details: `AI system "${system.name}" registered`,
      });
      res.status(201).json(system);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/ai-systems/:id", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead", "system_owner"), async (req, res) => {
    const updated = await storage.updateAiSystem(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "System not found" });
    await storage.createAuditLog({
      entityType: "ai_system",
      entityId: updated.id,
      action: "updated",
      performedBy: req.user!.fullName,
      details: `AI system "${updated.name}" updated`,
    });
    res.json(updated);
  });

  app.delete("/api/ai-systems/:id", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead"), async (req, res) => {
    const system = await storage.getAiSystem(req.params.id);
    if (!system) return res.status(404).json({ message: "System not found" });
    await storage.deleteAiSystem(req.params.id);
    await storage.createAuditLog({
      entityType: "ai_system",
      entityId: req.params.id,
      action: "deleted",
      performedBy: req.user!.fullName,
      details: `AI system "${system.name}" deleted`,
    });
    res.status(204).send();
  });

  app.get("/api/compliance-controls", requireAuth, async (_req, res) => {
    const controls = await storage.getComplianceControls();
    res.json(controls);
  });

  app.get("/api/system-controls", requireAuth, async (_req, res) => {
    const controls = await storage.getSystemControls();
    res.json(controls);
  });

  app.post("/api/system-controls", requireAuth, async (req, res) => {
    try {
      const parsed = insertSystemControlSchema.parse(req.body);
      const sc = await storage.createSystemControl(parsed);
      res.status(201).json(sc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/system-controls/:id", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead", "system_owner", "reviewer"), async (req, res) => {
    const updated = await storage.updateSystemControl(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Control not found" });
    await storage.createAuditLog({
      entityType: "system_control",
      entityId: updated.id,
      action: "status_changed",
      performedBy: req.user!.fullName,
      details: `Control status changed to "${updated.status}"`,
    });
    res.json(updated);
  });

  app.get("/api/approval-workflows", requireAuth, async (_req, res) => {
    const workflows = await storage.getApprovalWorkflows();
    res.json(workflows);
  });

  app.post("/api/approval-workflows", requireAuth, async (req, res) => {
    try {
      const parsed = insertApprovalWorkflowSchema.parse(req.body);
      const wf = await storage.createApprovalWorkflow(parsed);
      await storage.createAuditLog({
        entityType: "approval_workflow",
        entityId: wf.id,
        action: "created",
        performedBy: req.user!.fullName,
        details: `Approval workflow "${wf.title}" created`,
      });
      res.status(201).json(wf);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/approval-workflows/:id", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead", "reviewer"), async (req, res) => {
    const updated = await storage.updateApprovalWorkflow(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "Workflow not found" });
    const action = req.body.status === "approved" ? "approved" : req.body.status === "rejected" ? "rejected" : "status_changed";
    await storage.createAuditLog({
      entityType: "approval_workflow",
      entityId: updated.id,
      action,
      performedBy: req.user!.fullName,
      details: `Workflow "${updated.title}" ${action}`,
    });
    res.json(updated);
  });

  app.get("/api/audit-logs", requireAuth, async (_req, res) => {
    const logs = await storage.getAuditLogs();
    res.json(logs);
  });

  return httpServer;
}
