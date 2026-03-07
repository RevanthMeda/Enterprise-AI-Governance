import type { Express } from "express";
import { createServer, type Server } from "http";
import passport from "passport";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { insertAiSystemSchema, insertApprovalWorkflowSchema, insertSystemControlSchema, insertRiskAssessmentSchema } from "@shared/schema";
import { hashPassword } from "./auth";
import { requireAuth, requireRole } from "./auth";
import { z } from "zod";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/zip",
  "application/json",
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").substring(0, 200);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + "-" + sanitizeFilename(file.originalname));
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

async function notifyAllAdmins(title: string, message: string, type: string, entityType?: string, entityId?: string) {
  const allUsers = await storage.getAllUsers();
  const admins = allUsers.filter((u) => ["admin", "cro", "ciso", "compliance_lead"].includes(u.role));
  for (const admin of admins) {
    await storage.createNotification({
      userId: admin.id,
      title,
      message,
      type,
      entityType: entityType || null,
      entityId: entityId || null,
      read: false,
    });
  }
}

async function notifyUser(userId: string, title: string, message: string, type: string, entityType?: string, entityId?: string) {
  await storage.createNotification({
    userId,
    title,
    message,
    type,
    entityType: entityType || null,
    entityId: entityId || null,
    read: false,
  });
}

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

  app.get("/api/ai-systems", requireAuth, async (req, res) => {
    const filters = {
      search: req.query.search as string | undefined,
      riskLevel: req.query.riskLevel as string | undefined,
      status: req.query.status as string | undefined,
      dataSensitivity: req.query.dataSensitivity as string | undefined,
      geography: req.query.geography as string | undefined,
      department: req.query.department as string | undefined,
    };
    const systems = await storage.getAiSystems(filters);
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
      if (system.riskLevel === "high" || system.riskLevel === "unacceptable") {
        await notifyAllAdmins(
          "High-Risk System Registered",
          `"${system.name}" has been registered with ${system.riskLevel} risk level`,
          "high_risk_created",
          "ai_system",
          system.id
        );
      }
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

  app.get("/api/approval-workflows", requireAuth, async (req, res) => {
    const filters = {
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      systemId: req.query.systemId as string | undefined,
    };
    const workflows = await storage.getApprovalWorkflows(filters);
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
      if (wf.reviewer) {
        const allUsers = await storage.getAllUsers();
        const reviewer = allUsers.find((u) => u.fullName === wf.reviewer || u.username === wf.reviewer);
        if (reviewer) {
          await notifyUser(
            reviewer.id,
            "Approval Request Assigned",
            `You have been assigned to review "${wf.title}"`,
            "approval_assigned",
            "approval_workflow",
            wf.id
          );
        }
      }
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
    const allUsers = await storage.getAllUsers();
    const requester = allUsers.find((u) => u.fullName === updated.requestedBy || u.username === updated.requestedBy);
    if (requester) {
      await notifyUser(
        requester.id,
        `Workflow ${action}`,
        `Your workflow "${updated.title}" has been ${action}`,
        "workflow_status_changed",
        "approval_workflow",
        updated.id
      );
    }
    res.json(updated);
  });

  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    const filters = {
      action: req.query.action as string | undefined,
      entityType: req.query.entityType as string | undefined,
      performedBy: req.query.performedBy as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    };
    const logs = await storage.getAuditLogs(filters);
    res.json(logs);
  });

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.user!.id);
      res.json(notifs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notifs = await storage.getNotificationsByUser(req.user!.id);
      const owns = notifs.some((n) => n.id === req.params.id);
      if (!owns) return res.status(403).json({ message: "Not authorized" });
      const updated = await storage.markNotificationRead(req.params.id);
      if (!updated) return res.status(404).json({ message: "Notification not found" });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/notifications/read-all", requireAuth, async (req, res) => {
    await storage.markAllNotificationsRead(req.user!.id);
    res.json({ message: "All notifications marked as read" });
  });

  app.get("/api/evidence", requireAuth, async (req, res) => {
    try {
      const filters = {
        systemId: req.query.systemId as string | undefined,
        controlId: req.query.controlId as string | undefined,
        workflowId: req.query.workflowId as string | undefined,
      };
      const files = await storage.getEvidenceFiles(filters);
      res.json(files);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/evidence", requireAuth, upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }
      const { systemId, controlId, workflowId } = req.body;
      if (!systemId) {
        return res.status(400).json({ message: "systemId is required" });
      }
      const evidence = await storage.createEvidenceFile({
        systemId,
        controlId: controlId || null,
        workflowId: workflowId || null,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        filePath: req.file.filename,
        uploadedBy: req.user!.fullName,
      });
      await storage.createAuditLog({
        entityType: "evidence_file",
        entityId: evidence.id,
        action: "created",
        performedBy: req.user!.fullName,
        details: `Evidence file "${req.file.originalname}" uploaded for system ${systemId}`,
      });
      res.status(201).json(evidence);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/evidence/:id/download", requireAuth, async (req, res) => {
    try {
      const file = await storage.getEvidenceFile(req.params.id);
      if (!file) return res.status(404).json({ message: "File not found" });
      const filePath = path.join(uploadDir, file.filePath);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "File not found on disk" });
      }
      res.setHeader("Content-Disposition", `attachment; filename="${sanitizeFilename(file.fileName)}"`);
      res.setHeader("Content-Type", file.mimeType);
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/evidence/:id", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead", "system_owner"), async (req, res) => {
    const file = await storage.getEvidenceFile(req.params.id);
    if (!file) return res.status(404).json({ message: "File not found" });
    const filePath = path.join(uploadDir, file.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    await storage.deleteEvidenceFile(req.params.id);
    await storage.createAuditLog({
      entityType: "evidence_file",
      entityId: req.params.id,
      action: "deleted",
      performedBy: req.user!.fullName,
      details: `Evidence file "${file.fileName}" deleted`,
    });
    res.status(204).send();
  });

  app.get("/api/risk-assessments", requireAuth, async (_req, res) => {
    try {
      const assessments = await storage.getRiskAssessments();
      res.json(assessments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/risk-assessments/system/:systemId", requireAuth, async (req, res) => {
    try {
      const assessments = await storage.getRiskAssessmentsBySystem(req.params.systemId);
      res.json(assessments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const riskAssessmentAnswersSchema = z.object({
    intendedUse: z.enum(["autonomous_decisions", "decision_support", "automation", "analytics"]),
    domain: z.enum(["healthcare", "law_enforcement", "finance", "employment", "education", "critical_infrastructure", "general"]),
    personalData: z.enum(["special_category", "sensitive", "basic", "none"]),
    usersImpacted: z.enum(["over_100k", "10k_100k", "1k_10k", "under_1k"]),
    decisionImpact: z.enum(["legal_significant", "material", "minor", "none"]),
    humanOversight: z.enum(["none", "post_hoc", "in_loop", "full_control"]),
    geography: z.enum(["eu", "global", "us", "other"]).optional(),
    biometricUse: z.enum(["yes", "no"]).optional(),
    vulnerableGroups: z.enum(["yes", "no"]).optional(),
    purpose: z.string().optional(),
  });

  const riskAssessmentBodySchema = z.object({
    systemName: z.string().min(1, "System name is required"),
    systemId: z.string().nullable().optional(),
    answers: riskAssessmentAnswersSchema,
  });

  app.post("/api/risk-assessments", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead", "system_owner"), async (req, res) => {
    try {
      const parsed = riskAssessmentBodySchema.parse(req.body);
      const { answers, systemId, systemName } = parsed;

      if (systemId) {
        const system = await storage.getAiSystem(systemId);
        if (!system) {
          return res.status(404).json({ message: "System not found" });
        }
      }

      const { riskLevel, score, explanation, suggestedControls } = computeRiskClassification(answers);

      const assessment = await storage.createRiskAssessment({
        systemId: systemId || null,
        systemName,
        answers,
        riskOutcome: riskLevel,
        riskScore: score,
        riskExplanation: explanation,
        suggestedControls,
        completedBy: req.user!.fullName,
      });

      if (systemId) {
        await storage.updateAiSystem(systemId, { riskLevel });
        await storage.createAuditLog({
          entityType: "ai_system",
          entityId: systemId,
          action: "risk_assessed",
          performedBy: req.user!.fullName,
          details: `Risk assessment completed: ${riskLevel} (score: ${score})`,
        });
      }

      await storage.createAuditLog({
        entityType: "risk_assessment",
        entityId: assessment.id,
        action: "created",
        performedBy: req.user!.fullName,
        details: `Risk assessment for "${systemName}" completed: ${riskLevel}`,
      });

      res.status(201).json(assessment);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/dashboard/trends", requireAuth, async (_req, res) => {
    try {
      const [systems, workflows, logs, evidence] = await Promise.all([
        storage.getAiSystems(),
        storage.getApprovalWorkflows(),
        storage.getAuditLogs(),
        storage.getEvidenceFiles(),
      ]);

      const now = new Date();
      const weekLabels: string[] = [];
      const weekStarts: Date[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i * 7);
        d.setHours(0, 0, 0, 0);
        const dayOfWeek = d.getDay();
        d.setDate(d.getDate() - dayOfWeek);
        weekStarts.push(new Date(d));
        weekLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
      }

      const getWeekIndex = (date: Date | string | null) => {
        if (!date) return -1;
        const d = new Date(date);
        for (let i = weekStarts.length - 1; i >= 0; i--) {
          if (d >= weekStarts[i]) return i;
        }
        return -1;
      };

      const riskTrends = weekLabels.map((label, i) => {
        const beforeEnd = i < weekStarts.length - 1 ? weekStarts[i + 1] : new Date();
        const sysBefore = systems.filter((s) => s.createdAt && new Date(s.createdAt) < beforeEnd);
        return {
          week: label,
          high: sysBefore.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable").length,
          limited: sysBefore.filter((s) => s.riskLevel === "limited").length,
          minimal: sysBefore.filter((s) => s.riskLevel === "minimal").length,
        };
      });

      const approvalTrends = weekLabels.map((label, i) => {
        const weekWfs = workflows.filter((w) => getWeekIndex(w.createdAt) === i);
        return {
          week: label,
          submitted: weekWfs.length,
          approved: weekWfs.filter((w) => w.status === "approved").length,
          rejected: weekWfs.filter((w) => w.status === "rejected").length,
        };
      });

      const auditTrends = weekLabels.map((label, i) => ({
        week: label,
        events: logs.filter((l) => getWeekIndex(l.createdAt) === i).length,
      }));

      const evidenceTrends = weekLabels.map((label, i) => {
        const beforeEnd = i < weekStarts.length - 1 ? weekStarts[i + 1] : new Date();
        return {
          week: label,
          total: evidence.filter((e) => e.createdAt && new Date(e.createdAt) < beforeEnd).length,
        };
      });

      res.json({ riskTrends, approvalTrends, auditTrends, evidenceTrends });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/activity-dashboard", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const userName = user.fullName;
      const userRole = user.role;

      const [mySystems, pendingMyReview, myAssignedControls, notifications, allEvidence] = await Promise.all([
        storage.getAiSystemsByOwner(userName),
        storage.getApprovalWorkflowsByReviewer(userName),
        storage.getSystemControlsByAssignee(userName),
        storage.getNotificationsByUser(user.id),
        storage.getEvidenceFiles(),
      ]);

      const mySystemIds = new Set(mySystems.map((s) => s.id));

      const systemControls = await Promise.all(
        mySystems.map((s) => storage.getSystemControlsBySystem(s.id))
      );
      const mySystemControls = systemControls.flat();

      const allMyControls = [...myAssignedControls];
      const assignedIds = new Set(myAssignedControls.map((c) => c.id));
      for (const sc of mySystemControls) {
        if (!assignedIds.has(sc.id)) allMyControls.push(sc);
      }

      const now = new Date();
      const overdueControls = allMyControls.filter(
        (c) => c.dueDate && new Date(c.dueDate) < now && c.status !== "verified" && c.status !== "implemented"
      );
      const controlsInProgress = allMyControls.filter((c) => c.status === "in_progress");
      const controlsNotStarted = allMyControls.filter((c) => c.status === "not_started");

      const oneWeekFromNow = new Date();
      oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);
      const tasksDueThisWeek = allMyControls.filter(
        (c) => c.dueDate && new Date(c.dueDate) >= now && new Date(c.dueDate) <= oneWeekFromNow &&
          c.status !== "verified" && c.status !== "implemented"
      );

      const unreadNotifications = notifications.filter((n) => !n.read);

      const highRiskSystems = (userRole === "admin" || userRole === "cro" || userRole === "ciso")
        ? (await storage.getAiSystems()).filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable")
        : mySystems.filter((s) => s.riskLevel === "high" || s.riskLevel === "unacceptable");

      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const recentlyChangedHighRisk = highRiskSystems.filter(
        (s) => s.updatedAt && new Date(s.updatedAt) > oneWeekAgo
      );

      const systemsWithoutEvidence = mySystems.filter(
        (s) => !allEvidence.some((e) => e.systemId === s.id)
      );

      const recentAuditLogs = (await storage.getAuditLogs({ performedBy: userName })).slice(0, 10);

      const myRequestedWorkflows = (await storage.getApprovalWorkflows()).filter(
        (w) => w.requestedBy === userName || w.requestedBy === user.username
      );

      const approvalBottlenecks = (userRole === "admin" || userRole === "cro" || userRole === "ciso")
        ? (await storage.getApprovalWorkflows()).filter((w) => {
            if (w.status !== "pending" && w.status !== "in_review") return false;
            if (!w.createdAt) return false;
            const daysPending = (Date.now() - new Date(w.createdAt).getTime()) / (1000 * 60 * 60 * 24);
            return daysPending > 3;
          })
        : [];

      const controlGaps = (userRole === "admin" || userRole === "compliance_lead" || userRole === "ciso")
        ? (await storage.getSystemControls()).filter((c) => c.status === "not_started")
        : controlsNotStarted;

      res.json({
        summary: {
          mySystemsCount: mySystems.length,
          pendingReviewCount: pendingMyReview.length,
          myControlsCount: allMyControls.length,
          overdueControlsCount: overdueControls.length,
          unreadNotificationsCount: unreadNotifications.length,
          controlsInProgressCount: controlsInProgress.length,
          controlsNotStartedCount: controlsNotStarted.length,
          highRiskSystemsCount: highRiskSystems.length,
          evidenceMissingCount: systemsWithoutEvidence.length,
          tasksDueThisWeekCount: tasksDueThisWeek.length,
        },
        pendingMyReview: pendingMyReview.slice(0, 10),
        mySystems: mySystems.slice(0, 10),
        overdueControls: overdueControls.slice(0, 10),
        controlsInProgress: controlsInProgress.slice(0, 10),
        tasksDueThisWeek: tasksDueThisWeek.slice(0, 10),
        recentlyChangedHighRisk: recentlyChangedHighRisk.slice(0, 10),
        systemsWithoutEvidence: systemsWithoutEvidence.slice(0, 10),
        approvalBottlenecks: approvalBottlenecks.slice(0, 10),
        controlGaps: controlGaps.slice(0, 10),
        myRequestedWorkflows: myRequestedWorkflows.slice(0, 5),
        recentActivity: recentAuditLogs,
        userRole,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/calendar-events", requireAuth, async (req, res) => {
    try {
      const user = req.user!;
      const userName = user.fullName;
      const userRole = user.role;
      const isExecutive = ["admin", "cro", "ciso", "compliance_lead"].includes(userRole);

      const monthParam = req.query.month as string | undefined;
      const typeFilter = req.query.type as string | undefined;

      let rangeStart: Date;
      let rangeEnd: Date;
      if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
        const [year, month] = monthParam.split("-").map(Number);
        rangeStart = new Date(year, month - 1, 1);
        rangeEnd = new Date(year, month, 0, 23, 59, 59);
        rangeStart.setDate(rangeStart.getDate() - 7);
        rangeEnd.setDate(rangeEnd.getDate() + 7);
      } else {
        const now = new Date();
        rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0, 23, 59, 59);
      }

      const [allSystems, allControls, allWorkflows, allEvidence] = await Promise.all([
        storage.getAiSystems(),
        storage.getSystemControls(),
        storage.getApprovalWorkflows(),
        storage.getEvidenceFiles(),
      ]);

      const events: any[] = [];
      const now = new Date();

      const mySystems = isExecutive ? allSystems : allSystems.filter(
        (s) => s.owner === userName || s.owner === user.username
      );
      const mySystemIds = new Set(mySystems.map((s) => s.id));
      const systemNameMap = new Map(allSystems.map((s) => [s.id, s.name]));

      const myControls = isExecutive ? allControls : allControls.filter(
        (c) => c.assignee === userName || c.assignee === user.username || mySystemIds.has(c.systemId)
      );

      for (const ctrl of myControls) {
        if (ctrl.dueDate) {
          const dueDate = new Date(ctrl.dueDate);
          if (dueDate >= rangeStart && dueDate <= rangeEnd) {
            const isOverdue = dueDate < now && ctrl.status !== "verified" && ctrl.status !== "implemented";
            const isCompleted = ctrl.status === "verified" || ctrl.status === "implemented";
            events.push({
              id: `ctrl-${ctrl.id}`,
              title: `Control due: ${systemNameMap.get(ctrl.systemId) || "Unknown System"}`,
              date: ctrl.dueDate,
              type: isOverdue ? "overdue_control" : "control_deadline",
              priority: isOverdue ? "high" : (dueDate.getTime() - now.getTime() < 7 * 86400000 ? "medium" : "low"),
              status: isCompleted ? "completed" : (isOverdue ? "overdue" : "upcoming"),
              entityId: ctrl.systemId,
              entityType: "system",
              description: `${ctrl.assignee ? `Assigned to ${ctrl.assignee}` : "Unassigned"} · Status: ${ctrl.status.replace("_", " ")}`,
            });
          }
        }
      }

      const myWorkflows = isExecutive ? allWorkflows : allWorkflows.filter(
        (w) => w.reviewer === userName || w.reviewer === user.username ||
          w.requestedBy === userName || w.requestedBy === user.username
      );

      for (const wf of myWorkflows) {
        if ((wf.status === "pending" || wf.status === "in_review") && wf.createdAt) {
          const created = new Date(wf.createdAt);
          const deadlineDate = new Date(created);
          deadlineDate.setDate(deadlineDate.getDate() + 7);
          if (deadlineDate >= rangeStart && deadlineDate <= rangeEnd) {
            const daysPending = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
            events.push({
              id: `wf-${wf.id}`,
              title: `Review deadline: ${wf.systemName || "Approval Workflow"}`,
              date: deadlineDate.toISOString(),
              type: "approval_deadline",
              priority: daysPending > 5 ? "high" : "medium",
              status: daysPending > 7 ? "overdue" : "upcoming",
              entityId: wf.id,
              entityType: "workflow",
              description: `Requested by ${wf.requestedBy || "Unknown"} · Priority: ${wf.priority || "normal"}`,
            });
          }
        }
      }

      for (const ev of allEvidence) {
        if (ev.createdAt) {
          const uploadDate = new Date(ev.createdAt);
          if (uploadDate >= rangeStart && uploadDate <= rangeEnd) {
            if (isExecutive || ev.uploadedBy === userName || ev.uploadedBy === user.username || mySystemIds.has(ev.systemId)) {
              events.push({
                id: `ev-${ev.id}`,
                title: `Evidence uploaded: ${ev.fileName}`,
                date: ev.createdAt,
                type: "evidence_uploaded",
                priority: "low",
                status: "completed",
                entityId: ev.systemId,
                entityType: "system",
                description: `Uploaded by ${ev.uploadedBy || "Unknown"} · ${systemNameMap.get(ev.systemId) || ""}`,
              });
            }
          }
        }
      }

      for (const sys of mySystems) {
        const lastAssess = sys.lastAssessment ? new Date(sys.lastAssessment) : null;
        const daysSinceAssessment = lastAssess
          ? (now.getTime() - lastAssess.getTime()) / (1000 * 60 * 60 * 24)
          : 999;
        if (daysSinceAssessment >= 90 || !lastAssess) {
          const reassessDate = lastAssess
            ? new Date(lastAssess.getTime() + 90 * 86400000)
            : now;
          if (reassessDate >= rangeStart && reassessDate <= rangeEnd) {
            events.push({
              id: `reassess-${sys.id}`,
              title: `Reassessment due: ${sys.name}`,
              date: reassessDate.toISOString(),
              type: "reassessment_due",
              priority: daysSinceAssessment > 120 ? "high" : "medium",
              status: "upcoming",
              entityId: sys.id,
              entityType: "system",
              description: `Last assessed: ${lastAssess ? lastAssess.toLocaleDateString() : "Never"} · Risk: ${sys.riskLevel}`,
            });
          }
        }
      }

      const euAiActMilestones = [
        { date: "2025-02-02", title: "EU AI Act: Prohibited AI practices take effect", description: "Article 5 prohibitions enforced — unacceptable risk AI systems must be discontinued" },
        { date: "2025-08-02", title: "EU AI Act: GPAI model obligations begin", description: "General-purpose AI model providers must comply with transparency and documentation requirements" },
        { date: "2026-08-02", title: "EU AI Act: High-risk AI obligations begin", description: "Full compliance required for high-risk AI systems including conformity assessments, CE marking, and EU database registration" },
        { date: "2027-08-02", title: "EU AI Act: Annex I systems compliance", description: "High-risk AI systems in Annex I (safety components) must comply with all requirements" },
      ];

      for (const milestone of euAiActMilestones) {
        const milestoneDate = new Date(milestone.date);
        if (milestoneDate >= rangeStart && milestoneDate <= rangeEnd) {
          const isPast = milestoneDate < now;
          events.push({
            id: `reg-${milestone.date}`,
            title: milestone.title,
            date: milestone.date,
            type: "regulatory_milestone",
            priority: isPast ? "low" : "high",
            status: isPast ? "completed" : "upcoming",
            entityId: null,
            entityType: null,
            description: milestone.description,
          });
        }
      }

      let filteredEvents = events;
      if (typeFilter && typeFilter !== "all") {
        filteredEvents = events.filter((e) => e.type === typeFilter);
      }

      filteredEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      res.json(filteredEvents);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/system-controls/bulk", requireAuth, requireRole("admin", "cro", "ciso", "compliance_lead"), async (req, res) => {
    try {
      const { systemIds, controlIds } = req.body;
      if (!Array.isArray(systemIds) || !Array.isArray(controlIds) || systemIds.length === 0 || controlIds.length === 0) {
        return res.status(400).json({ message: "systemIds and controlIds arrays are required" });
      }

      const [allSystems, allControls] = await Promise.all([
        storage.getAiSystems(),
        storage.getComplianceControls(),
      ]);
      const validSystemIds = new Set(allSystems.map((s) => s.id));
      const validControlIds = new Set(allControls.map((c) => c.id));

      const invalidSystems = systemIds.filter((id: string) => !validSystemIds.has(id));
      const invalidControls = controlIds.filter((id: string) => !validControlIds.has(id));
      if (invalidSystems.length > 0 || invalidControls.length > 0) {
        return res.status(400).json({
          message: "Some IDs do not exist",
          invalidSystems,
          invalidControls,
        });
      }

      const existingControls = await storage.getSystemControls();
      const existingSet = new Set(existingControls.map((c) => `${c.systemId}:${c.controlId}`));

      const items: { systemId: string; controlId: string }[] = [];
      for (const sysId of systemIds) {
        for (const ctrlId of controlIds) {
          const key = `${sysId}:${ctrlId}`;
          if (!existingSet.has(key)) {
            items.push({ systemId: sysId, controlId: ctrlId });
          }
        }
      }

      if (items.length === 0) {
        return res.json({ created: [], message: "All assignments already exist", skipped: systemIds.length * controlIds.length });
      }

      const created = await storage.bulkCreateSystemControls(items);

      await storage.createAuditLog({
        entityType: "system_control",
        entityId: "bulk",
        action: "bulk_assigned",
        performedBy: req.user!.fullName,
        details: `Bulk assigned ${controlIds.length} controls to ${systemIds.length} systems (${created.length} new assignments)`,
      });

      res.status(201).json({ created, total: created.length, skipped: (systemIds.length * controlIds.length) - created.length });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  return httpServer;
}

function computeRiskClassification(answers: any): {
  riskLevel: string;
  score: number;
  explanation: string;
  suggestedControls: string[];
} {
  let score = 0;
  const factors: string[] = [];
  const suggestedControls: string[] = [];

  if (answers.intendedUse === "autonomous_decisions") {
    score += 30;
    factors.push("System makes autonomous decisions affecting individuals");
  } else if (answers.intendedUse === "decision_support") {
    score += 15;
    factors.push("System supports human decision-making");
  } else if (answers.intendedUse === "automation") {
    score += 10;
    factors.push("System automates routine tasks");
  }

  if (answers.domain === "healthcare" || answers.domain === "law_enforcement") {
    score += 25;
    factors.push(`Deployed in high-stakes domain: ${answers.domain}`);
  } else if (answers.domain === "finance" || answers.domain === "employment" || answers.domain === "education") {
    score += 20;
    factors.push(`Deployed in regulated domain: ${answers.domain}`);
  } else if (answers.domain === "critical_infrastructure") {
    score += 25;
    factors.push("Used in critical infrastructure");
  } else if (answers.domain === "general") {
    score += 5;
    factors.push("General-purpose application domain");
  }

  if (answers.personalData === "special_category") {
    score += 20;
    factors.push("Processes special category personal data (biometric, health, etc.)");
  } else if (answers.personalData === "sensitive") {
    score += 15;
    factors.push("Processes sensitive personal data");
  } else if (answers.personalData === "basic") {
    score += 8;
    factors.push("Processes basic personal data");
  }

  if (answers.usersImpacted === "over_100k") {
    score += 15;
    factors.push("Impacts over 100,000 users");
  } else if (answers.usersImpacted === "10k_100k") {
    score += 10;
    factors.push("Impacts 10,000-100,000 users");
  } else if (answers.usersImpacted === "1k_10k") {
    score += 5;
    factors.push("Impacts 1,000-10,000 users");
  }

  if (answers.decisionImpact === "legal_significant") {
    score += 20;
    factors.push("Decisions produce legal or similarly significant effects");
  } else if (answers.decisionImpact === "material") {
    score += 12;
    factors.push("Decisions have material impact on individuals");
  } else if (answers.decisionImpact === "minor") {
    score += 4;
    factors.push("Decisions have minor impact");
  }

  if (answers.humanOversight === "none") {
    score += 15;
    factors.push("No human oversight in decision loop");
  } else if (answers.humanOversight === "post_hoc") {
    score += 8;
    factors.push("Human oversight only after decisions are made");
  } else if (answers.humanOversight === "in_loop") {
    score -= 5;
    factors.push("Human-in-the-loop oversight (risk mitigated)");
  }

  if (answers.geography === "eu" || answers.geography === "global") {
    score += 5;
    factors.push(`Operating in ${answers.geography === "eu" ? "EU" : "global"} jurisdiction`);
  }

  if (answers.biometricUse === "yes") {
    score += 15;
    factors.push("Uses biometric identification or categorization");
  }

  if (answers.vulnerableGroups === "yes") {
    score += 10;
    factors.push("Affects vulnerable groups (children, elderly, disabled)");
  }

  let riskLevel: string;
  if (score >= 80) {
    riskLevel = "unacceptable";
  } else if (score >= 50) {
    riskLevel = "high";
  } else if (score >= 25) {
    riskLevel = "limited";
  } else {
    riskLevel = "minimal";
  }

  if (riskLevel === "unacceptable" || riskLevel === "high") {
    suggestedControls.push("Risk Management System", "Data Governance Framework", "Technical Documentation", "Record-Keeping & Logging", "Human Oversight Mechanism", "Accuracy & Robustness Testing", "Cybersecurity Assessment", "Conformity Assessment");
  } else if (riskLevel === "limited") {
    suggestedControls.push("Transparency Disclosure", "User Notification", "AI Content Labeling", "Basic Documentation");
  } else {
    suggestedControls.push("Voluntary Code of Conduct", "Best Practice Guidelines");
  }

  const explanation = `Risk Score: ${score}/100 — Classification: ${riskLevel.toUpperCase()}\n\nFactors considered:\n${factors.map((f) => `• ${f}`).join("\n")}`;

  return { riskLevel, score, explanation, suggestedControls };
}
