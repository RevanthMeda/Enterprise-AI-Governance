import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { storage } from "../storage";
import { insertAiSystemSchema, insertAgentGovernanceProfileSchema } from "@shared/schema";
import { systemService } from "../services/systemService";
import { workflowService } from "../services/workflowService";
import { auditService } from "../services/auditService";
import { agentGovernanceService } from "../services/agentGovernanceService";
import { riskAssessmentService } from "../services/riskAssessmentService";
import { autoDiscoveryService } from "../services/autoDiscoveryService";
import { resolveSystemLawPackIds, resolveWorkflowLegalProfile } from "@shared/law-packs";
import { notifyAllAdmins, routeParam } from "./_helpers";
import { z } from "zod";

const autoDiscoveryManifestSchema = z.object({
  systemName: z.string().min(1, "System name is required"),
  owner: z.string().min(1, "Owner is required"),
  department: z.string().optional(),
  purpose: z.string().min(1, "Purpose is required"),
  vendor: z.string().optional(),
  provider: z.string().optional(),
  modelName: z.string().optional(),
  modelType: z.string().optional(),
  gateway: z.string().optional(),
  deploymentContext: z.string().optional(),
  intendedUse: z.enum(["autonomous_decisions", "decision_support", "automation", "analytics"]),
  domain: z.enum(["healthcare", "law_enforcement", "finance", "employment", "education", "critical_infrastructure", "general"]),
  personalData: z.enum(["special_category", "sensitive", "basic", "none"]),
  usersImpacted: z.enum(["over_100k", "10k_100k", "1k_10k", "under_1k"]),
  decisionImpact: z.enum(["legal_significant", "material", "minor", "none"]),
  humanOversight: z.enum(["none", "post_hoc", "in_loop", "full_control"]),
  geography: z.enum(["eu", "global", "us", "other"]).default("other"),
  biometricUse: z.enum(["yes", "no"]).default("no"),
  vulnerableGroups: z.enum(["yes", "no"]).default("no"),
  customerFacing: z.boolean().optional().default(false),
  telemetrySignals: z.object({
    productionTraffic: z.boolean().optional().default(false),
    piiExposureObserved: z.boolean().optional().default(false),
    safetyAlertsObserved: z.boolean().optional().default(false),
    biasAlertsObserved: z.boolean().optional().default(false),
  }).optional().default({}),
});

function buildAutoDiscoveryNotes(manifest: any): string[] {
  const notes: string[] = [];
  if (manifest.provider || manifest.modelName) {
    notes.push(`Model provider: ${[manifest.provider, manifest.modelName].filter(Boolean).join(" / ")}`);
  }
  if (manifest.gateway) {
    notes.push(`Gateway connected: ${manifest.gateway}`);
  }
  if (manifest.customerFacing) {
    notes.push("Customer-facing runtime detected");
  }
  if (manifest.telemetrySignals?.productionTraffic) {
    notes.push("Production traffic signal present");
  }
  if (manifest.telemetrySignals?.piiExposureObserved) {
    notes.push("Runtime telemetry observed PII exposure risk");
  }
  if (manifest.telemetrySignals?.safetyAlertsObserved) {
    notes.push("Runtime telemetry observed safety alerts");
  }
  if (manifest.telemetrySignals?.biasAlertsObserved) {
    notes.push("Runtime telemetry observed bias alerts");
  }
  return notes;
}

export function registerRegistryRoutes(app: Express): void {
  app.get("/api/ai-systems", requireAuth, requireTenant, async (req, res) => {
    const filters = {
      search: req.query.search as string | undefined,
      riskLevel: req.query.riskLevel as string | undefined,
      status: req.query.status as string | undefined,
      dataSensitivity: req.query.dataSensitivity as string | undefined,
      geography: req.query.geography as string | undefined,
      department: req.query.department as string | undefined,
    };
    const systems = await systemService.listSystems({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      filters,
    });
    res.json(systems);
  });

  app.get("/api/ai-systems/:id", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    res.json(system);
  });

  app.get("/api/ai-systems/:id/controls", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    const controls = await storage.getSystemControlsBySystemForOrg(req.tenant!.organizationId, routeParam(req.params.id));
    res.json(controls);
  });

  app.get("/api/ai-systems/:id/workflows", requireAuth, requireTenant, async (req, res) => {
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    const workflows = await workflowService.getWorkflowsBySystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    res.json(workflows);
  });

  app.get("/api/ai-systems/:id/audit-logs", requireAuth, requireTenant, async (req, res) => {
    const { enrichAuditLogsWithContext } = await import("./_helpers");
    const system = await systemService.getSystem({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      systemId: routeParam(req.params.id),
    });
    if (!system) return res.status(404).json({ message: "System not found" });
    const logs = await auditService.listLogsByEntity({
      organizationId: req.tenant!.organizationId,
      actor: req.user!,
      entityId: routeParam(req.params.id),
    });
    res.json(await enrichAuditLogsWithContext(req.tenant!.organizationId, logs));
  });

  app.get(
    "/api/ai-systems/:id/agent-governance",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner", "auditor", "reviewer"),
    async (req, res) => {
      const system = await systemService.getSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
      });
      if (!system) return res.status(404).json({ message: "System not found" });
      const profiles = await agentGovernanceService.listProfiles({
        organizationId: req.tenant!.organizationId,
        systemId: system.id,
      });
      res.json(profiles);
    },
  );

  app.post(
    "/api/ai-systems/:id/agent-governance",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const system = await systemService.getSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId: routeParam(req.params.id),
        });
        if (!system) return res.status(404).json({ message: "System not found" });

        const parsed = insertAgentGovernanceProfileSchema
          .pick({
            actorId: true,
            actorLabel: true,
            workflowId: true,
            legalProfile: true,
            lawPackIds: true,
            capabilityProfile: true,
            allowedCapabilities: true,
            strictness: true,
            notes: true,
          })
          .extend({
            workflowId: z.string().nullable().optional(),
          })
          .parse(req.body ?? {});

        if (parsed.workflowId) {
          const workflow = await storage.getApprovalWorkflowById(req.tenant!.organizationId, parsed.workflowId);
          if (!workflow || workflow.systemId !== system.id) {
            return res.status(404).json({ message: "Workflow not found for this system" });
          }
        }

        const profile = await agentGovernanceService.saveProfile({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            actorId: parsed.actorId,
            actorLabel: parsed.actorLabel ?? null,
            systemId: system.id,
            workflowId: parsed.workflowId ?? null,
            legalProfile: parsed.legalProfile,
            lawPackIds: parsed.lawPackIds,
            capabilityProfile: parsed.capabilityProfile,
            allowedCapabilities: parsed.allowedCapabilities,
            strictness: parsed.strictness,
            notes: parsed.notes ?? null,
          },
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "agent_governance_profile",
            entityId: profile.id,
            action: "updated",
            performedBy: req.user!.fullName,
            details: `Agent governance override saved for ${profile.actorLabel || profile.actorId} on ${system.name}${profile.workflowId ? ` / workflow ${profile.workflowId}` : ""}`,
          },
        });
        res.status(201).json(profile);
      } catch (err: any) {
        res.status(err?.status ?? 400).json({ message: err.message || "Failed to save agent governance profile" });
      }
    },
  );

  app.delete(
    "/api/agent-governance/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      const profile = await storage.getAgentGovernanceProfileByIdForOrg(
        req.tenant!.organizationId,
        routeParam(req.params.id),
      );
      if (!profile) {
        return res.status(404).json({ message: "Agent governance profile not found" });
      }
      await agentGovernanceService.deleteProfile({
        organizationId: req.tenant!.organizationId,
        profileId: profile.id,
      });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "agent_governance_profile",
          entityId: profile.id,
          action: "deleted",
          performedBy: req.user!.fullName,
          details: `Agent governance override removed for ${profile.actorLabel || profile.actorId}`,
        },
      });
      res.status(204).send();
    },
  );

  app.post(
    "/api/ai-systems/auto-register",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const manifest = autoDiscoveryManifestSchema.parse(req.body);
        const derivedAnswers = autoDiscoveryService.deriveAnswers(manifest);
        const { riskLevel, score, explanation, suggestedControls } = autoDiscoveryService.computeRiskClassification(derivedAnswers);
        const discoveryNotes = buildAutoDiscoveryNotes(manifest);
        const riskExplanation = discoveryNotes.length
          ? `${explanation}\n\nAuto-discovery signals:\n${discoveryNotes.map((note) => `• ${note}`).join("\n")}`
          : explanation;

        const system = await systemService.createSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: autoDiscoveryService.buildAutoRegisteredSystemInput(manifest, riskLevel),
        });

        const assessment = await riskAssessmentService.createAssessment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            systemId: system.id,
            systemName: system.name,
            answers: {
              ...derivedAnswers,
              discovery: {
                provider: manifest.provider ?? null,
                modelName: manifest.modelName ?? null,
                gateway: manifest.gateway ?? null,
                customerFacing: manifest.customerFacing,
                telemetrySignals: manifest.telemetrySignals,
              },
            },
            riskOutcome: riskLevel,
            riskScore: score,
            riskExplanation,
            suggestedControls,
          },
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: system.id,
            action: "auto_registered",
            performedBy: req.user!.fullName,
            details: `AI application "${system.name}" auto-registered from SDK/application manifest`,
          },
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "risk_assessment",
            entityId: assessment.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Derived risk assessment created for "${system.name}": ${riskLevel} (${score})`,
          },
        });

        if (riskLevel === "high" || riskLevel === "unacceptable") {
          const systemLawPackIds = resolveSystemLawPackIds(system);
          await notifyAllAdmins(
            req.tenant!.organizationId,
            "High-Risk Application Connected",
            `"${system.name}" was auto-registered as ${riskLevel} risk from SDK/application intake`,
            "high_risk_created",
            "ai_system",
            system.id,
            {
              legalProfileApplied: resolveWorkflowLegalProfile({}, system),
              lawPackIdsApplied: systemLawPackIds,
            },
          );
        }

        res.status(201).json({ system, assessment, derivedAnswers });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/ai-systems/:id/auto-reassess",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const systemId = routeParam(req.params.id);
        const system = await systemService.getSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId,
        });
        if (!system) {
          return res.status(404).json({ message: "System not found" });
        }

        const manifest = autoDiscoveryManifestSchema.parse({
          ...req.body,
          systemName: req.body.systemName || system.name,
          owner: req.body.owner || system.owner,
          purpose: req.body.purpose || system.purpose || system.description || system.name,
        });

        const derivedAnswers = autoDiscoveryService.deriveAnswers(manifest);
        const { riskLevel, score, explanation, suggestedControls } = autoDiscoveryService.computeRiskClassification(derivedAnswers);
        const discoveryNotes = buildAutoDiscoveryNotes(manifest);
        const riskExplanation = discoveryNotes.length
          ? `${explanation}\n\nAuto-discovery signals:\n${discoveryNotes.map((note) => `• ${note}`).join("\n")}`
          : explanation;

        const updatedSystem = await systemService.updateSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          systemId,
          input: autoDiscoveryService.buildAutoReassessedSystemInput(manifest, riskLevel),
        });

        const assessment = await riskAssessmentService.createAssessment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            systemId,
            systemName: system.name,
            answers: {
              ...derivedAnswers,
              discovery: {
                provider: manifest.provider ?? null,
                modelName: manifest.modelName ?? null,
                gateway: manifest.gateway ?? null,
                customerFacing: manifest.customerFacing,
                telemetrySignals: manifest.telemetrySignals,
              },
            },
            riskOutcome: riskLevel,
            riskScore: score,
            riskExplanation,
            suggestedControls,
          },
        });

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: systemId,
            action: "auto_reassessed",
            performedBy: req.user!.fullName,
            details: `AI application "${system.name}" auto-reassessed from SDK/application manifest: ${riskLevel} (${score})`,
          },
        });

        res.json({ system: updatedSystem ?? system, assessment, derivedAnswers });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.post(
    "/api/ai-systems",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const parsed = insertAiSystemSchema.parse(req.body);
        const system = await systemService.createSystem({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: parsed,
        });
        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "ai_system",
            entityId: system.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `AI system "${system.name}" registered`,
          },
        });
        if (system.riskLevel === "high" || system.riskLevel === "unacceptable") {
          const systemLawPackIds = resolveSystemLawPackIds(system);
          await notifyAllAdmins(
            req.tenant!.organizationId,
            "High-Risk System Registered",
            `"${system.name}" has been registered with ${system.riskLevel} risk level`,
            "high_risk_created",
            "ai_system",
            system.id,
            {
              legalProfileApplied: resolveWorkflowLegalProfile({}, system),
              lawPackIdsApplied: systemLawPackIds,
            },
          );
        }
        res.status(201).json(system);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  app.patch(
    "/api/ai-systems/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      const updated = await systemService.updateSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
        input: req.body,
      });
      if (!updated) return res.status(404).json({ message: "System not found" });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "ai_system",
          entityId: updated.id,
          action: "updated",
          performedBy: req.user!.fullName,
          details: `AI system "${updated.name}" updated`,
        },
      });
      res.json(updated);
    },
  );

  app.delete(
    "/api/ai-systems/:id",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead"),
    async (req, res) => {
      const system = await systemService.getSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
      });
      if (!system) return res.status(404).json({ message: "System not found" });
      await systemService.deleteSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.id),
      });
      await auditService.createLog({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        input: {
          entityType: "ai_system",
          entityId: routeParam(req.params.id),
          action: "deleted",
          performedBy: req.user!.fullName,
          details: `AI system "${system.name}" deleted`,
        },
      });
      res.status(204).send();
    },
  );
}
