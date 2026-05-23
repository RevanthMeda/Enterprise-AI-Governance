import type { Express } from "express";
import { requireAuth } from "../auth";
import { requireOrgRole, requireTenant } from "../tenant";
import { systemService } from "../services/systemService";
import { riskAssessmentService } from "../services/riskAssessmentService";
import { auditService } from "../services/auditService";
import { routeParam } from "./_helpers";
import { z } from "zod";

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

export function registerRiskRoutes(app: Express): void {
  app.get("/api/risk-assessments", requireAuth, requireTenant, async (req, res) => {
    try {
      const assessments = await riskAssessmentService.listAssessments({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
      });
      res.json(assessments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/risk-assessments/system/:systemId", requireAuth, requireTenant, async (req, res) => {
    try {
      const system = await systemService.getSystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.systemId),
      });
      if (!system) return res.status(404).json({ message: "System not found" });
      const assessments = await riskAssessmentService.listAssessmentsBySystem({
        organizationId: req.tenant!.organizationId,
        actor: req.user!,
        systemId: routeParam(req.params.systemId),
      });
      res.json(assessments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post(
    "/api/risk-assessments",
    requireAuth,
    requireTenant,
    requireOrgRole("owner", "admin", "cro", "ciso", "compliance_lead", "system_owner"),
    async (req, res) => {
      try {
        const parsed = riskAssessmentBodySchema.parse(req.body);
        const { answers, systemId, systemName } = parsed;

        if (systemId) {
          const system = await systemService.getSystem({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            systemId,
          });
          if (!system) {
            return res.status(404).json({ message: "System not found" });
          }
        }

        const { riskLevel, score, explanation, suggestedControls } = computeRiskClassification(answers);

        const assessment = await riskAssessmentService.createAssessment({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            systemId: systemId || null,
            systemName,
            answers,
            riskOutcome: riskLevel,
            riskScore: score,
            riskExplanation: explanation,
            suggestedControls,
          },
        });

        if (systemId) {
          await riskAssessmentService.updateLinkedSystemRisk({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            systemId,
            riskLevel,
          });
          await auditService.createLog({
            organizationId: req.tenant!.organizationId,
            actor: req.user!,
            input: {
              entityType: "ai_system",
              entityId: systemId,
              action: "risk_assessed",
              performedBy: req.user!.fullName,
              details: `Risk assessment completed: ${riskLevel} (score: ${score})`,
            },
          });
        }

        await auditService.createLog({
          organizationId: req.tenant!.organizationId,
          actor: req.user!,
          input: {
            entityType: "risk_assessment",
            entityId: assessment.id,
            action: "created",
            performedBy: req.user!.fullName,
            details: `Risk assessment for "${systemName}" completed: ${riskLevel}`,
          },
        });

        res.status(201).json(assessment);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );
}
