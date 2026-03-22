import type { GovernanceMaturityDomain, GovernanceMaturityLevel, GovernanceMaturityResponse } from "@shared/governance-maturity";
import { analyticsService } from "./analyticsService";
import { storage } from "../storage";
import { telemetryPolicyService } from "./telemetryPolicyService";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percent(score: number, maxScore: number) {
  if (maxScore <= 0) return 0;
  return Math.round((score / maxScore) * 100);
}

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

function getLevel(scorePercent: number): GovernanceMaturityLevel {
  if (scorePercent >= 85) return "predictive";
  if (scorePercent >= 70) return "optimized";
  if (scorePercent >= 50) return "proactive";
  if (scorePercent >= 25) return "reactive";
  return "ad_hoc";
}

function getSettingsObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getAuthSettings(rawSettings: unknown) {
  const settings = getSettingsObject(rawSettings);
  const auth = getSettingsObject(settings.auth);
  const allowedDomains = Array.isArray(auth.allowedDomains)
    ? auth.allowedDomains.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
  return {
    mode: auth.mode === "saml" || auth.mode === "oidc" ? auth.mode : "local",
    enforceSso: auth.enforceSso === true,
    jitProvisioning: auth.jitProvisioning === true,
    allowedDomains,
  };
}

function getSavedPlanCount(rawSettings: unknown) {
  const settings = getSettingsObject(rawSettings);
  const builder = getSettingsObject(settings.analyticsReportBuilder);
  const plans = Array.isArray(builder.plans) ? builder.plans : [];
  return plans.length;
}

function getAutomationStats(rawSettings: unknown) {
  const settings = getSettingsObject(rawSettings);
  const automation = getSettingsObject(settings.governanceAutomation);
  const rules = Array.isArray(automation.rules) ? automation.rules : [];
  const enabledRules = rules.filter((rule) => rule && typeof rule === "object" && (rule as Record<string, unknown>).enabled === true);
  return {
    runMode: typeof automation.runMode === "string" ? automation.runMode : "manual_review",
    enabledRuleCount: enabledRules.length,
  };
}

function buildDomain(params: Omit<GovernanceMaturityDomain, "percent">): GovernanceMaturityDomain {
  return {
    ...params,
    score: roundScore(params.score),
    percent: percent(params.score, params.maxScore),
  };
}

export class GovernanceMaturityService {
  async getAssessment(params: {
    organizationId: string;
    actor: Actor;
    membershipRole: string;
  }): Promise<GovernanceMaturityResponse> {
    const [overview, systems, organization, policy] = await Promise.all([
      analyticsService.getOverview({
        organizationId: params.organizationId,
        actor: params.actor,
        membershipRole: params.membershipRole,
      }),
      storage.getAiSystemsByOrg(params.organizationId),
      storage.getOrganizationById(params.organizationId),
      telemetryPolicyService.getEffectiveForOrg(params.organizationId),
    ]);

    const authSettings = getAuthSettings(organization?.settings);
    const savedPlanCount = getSavedPlanCount(organization?.settings);
    const automation = getAutomationStats(organization?.settings);

    const totalSystems = systems.length;
    const ownedSystems = systems.filter((system) => Boolean(system.owner?.trim())).length;
    const jurisdictionTaggedSystems = systems.filter(
      (system) =>
        Boolean(system.legalProfile && String(system.legalProfile).trim()) ||
        (Array.isArray(system.lawPackIds) && system.lawPackIds.length > 0),
    ).length;

    const inventoryScore =
      (totalSystems > 0 ? 6 : 0) +
      (totalSystems > 0 ? 7 * (ownedSystems / totalSystems) : 0) +
      (totalSystems > 0 ? 7 * (jurisdictionTaggedSystems / totalSystems) : 0);

    const controlsScore =
      10 * (overview.summary.controlCoverageRate / 100) +
      6 * (overview.summary.evidenceCoverageRate / 100) +
      4 * clamp(1 - overview.summary.pendingWorkflows / Math.max(totalSystems, 4), 0, 1);

    const runtimeScore =
      (policy.enforceBlocking ? 6 : 2) +
      (policy.autoEscalateCritical ? 4 : 1) +
      (policy.shadowModeEnabled ? 2 : 0) +
      4 * clamp(1 - overview.summary.breachedIncidents / Math.max(overview.summary.openIncidents || 1, 1), 0, 1) +
      4 * clamp(1 - overview.summary.openIncidents / Math.max(totalSystems * 2, 4), 0, 1);

    const evidenceScore =
      10 * (overview.summary.decisionTraceCoverageRate / 100) +
      4 * (overview.summary.evidenceCoverageRate / 100) +
      6 * (overview.summary.avgContainmentHours === null ? 0.3 : clamp(1 - overview.summary.avgContainmentHours / 48, 0, 1));

    const identityOpsScore =
      (authSettings.mode !== "local" ? 5 : 1) +
      (authSettings.enforceSso ? 4 : 0) +
      (authSettings.allowedDomains.length > 0 ? 3 : 0) +
      (authSettings.jitProvisioning ? 2 : 0) +
      Math.min(savedPlanCount, 3) * 1.5 +
      (automation.runMode !== "manual_review" ? 2 : 0) +
      Math.min(automation.enabledRuleCount, 3) * 1;

    const domains: GovernanceMaturityDomain[] = [
      buildDomain({
        key: "inventory",
        label: "Inventory and ownership",
        score: inventoryScore,
        maxScore: 20,
        summary:
          totalSystems === 0
            ? "No governed systems are registered yet, so the inventory baseline is not established."
            : `${ownedSystems}/${totalSystems} systems have a named owner and ${jurisdictionTaggedSystems}/${totalSystems} carry legal-profile or law-pack context.`,
        nextActions: [
          "Ensure every active system has a named owner and department.",
          "Apply legal profiles and law packs consistently across systems before runtime onboarding.",
        ],
      }),
      buildDomain({
        key: "controls",
        label: "Control coverage",
        score: controlsScore,
        maxScore: 20,
        summary: `Control coverage is ${overview.summary.controlCoverageRate}% with evidence on ${overview.summary.evidenceCoverageRate}% of registered systems.`,
        nextActions: [
          "Push in-progress controls to verified status on high-risk systems first.",
          "Close approval backlog so controls and evidence stay tied to live workflows.",
        ],
      }),
      buildDomain({
        key: "runtime",
        label: "Runtime guardrails",
        score: runtimeScore,
        maxScore: 20,
        summary: `${policy.enforceBlocking ? "Live blocking is enabled" : "Runtime is still monitor-only"} with ${overview.summary.openIncidents} open incidents and ${overview.summary.breachedIncidents} beyond containment target.`,
        nextActions: [
          "Use shadow mode before tightening thresholds further on noisy systems.",
          "Reduce breached incidents before adding more reviewer-only exceptions.",
        ],
      }),
      buildDomain({
        key: "evidence",
        label: "Evidence and traceability",
        score: evidenceScore,
        maxScore: 20,
        summary: `Decision trace coverage is ${overview.summary.decisionTraceCoverageRate}% and average containment time is ${overview.summary.avgContainmentHours ?? "N/A"} hours.`,
        nextActions: [
          "Link sensitive workflows to decision traces as part of standard review closure.",
          "Document override rationale and outcomes so evidence quality improves, not just file counts.",
        ],
      }),
      buildDomain({
        key: "operations",
        label: "Identity and operations",
        score: identityOpsScore,
        maxScore: 20,
        summary: `${authSettings.mode === "local" ? "Local auth is still the primary mode." : `${authSettings.mode.toUpperCase()} SSO is configured.`} ${savedPlanCount} saved analytics plan(s) and ${automation.enabledRuleCount} enabled automation rule(s) are present.`,
        nextActions: [
          "Move governed tenants to enforced SSO and domain-backed access where possible.",
          "Use saved reporting and automation rules to reduce manual reviewer coordination.",
        ],
      }),
    ];

    const overallScore = domains.reduce((sum, domain) => sum + domain.score, 0);
    const maxScore = domains.reduce((sum, domain) => sum + domain.maxScore, 0);
    const overallPercent = percent(overallScore, maxScore);
    const level = getLevel(overallPercent);

    const strengths = [...domains]
      .sort((a, b) => b.percent - a.percent)
      .slice(0, 2)
      .map((domain) => `${domain.label}: ${domain.summary}`);
    const gaps = [...domains]
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 2)
      .map((domain) => `${domain.label}: ${domain.nextActions[0]}`);

    const headline =
      level === "predictive"
        ? "Governance is operating with strong structural controls, automation, and review discipline."
        : level === "optimized"
          ? "The program is structurally governed, but a few domains still need tighter operational discipline."
          : level === "proactive"
            ? "The foundation is in place, but runtime and evidence loops still need consistent execution."
            : level === "reactive"
              ? "Governance exists but remains dependent on manual catch-up and uneven operating routines."
              : "The organization is still building its governed operating baseline.";

    return {
      generatedAt: new Date().toISOString(),
      overallScore: roundScore(overallScore),
      maxScore,
      percent: overallPercent,
      level,
      headline,
      strengths,
      gaps,
      domains,
    };
  }
}

export const governanceMaturityService = new GovernanceMaturityService();
