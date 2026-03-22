import {
  getDefaultLawPackIdsForProfile,
  inferFinanceDomain,
  normalizeLegalProfile,
  resolveSystemLawPackIds,
  resolveWorkflowLawPackIds,
  resolveWorkflowLegalProfile,
  sanitizeLawPackIds,
  type LawPackId,
  type LegalProfile,
} from "./law-packs";
import {
  inferCapabilityProfile,
  inferStrictnessMode,
  normalizeCapabilityProfileId,
  normalizeStrictnessMode,
  resolveAllowedCapabilities,
  type CapabilityId,
  type CapabilityProfileId,
  type StrictnessMode,
} from "./governance-policy-registry";

type SystemGovernanceContext = {
  legalProfile?: string | null;
  geography?: string | null;
  lawPackIds?: unknown;
  capabilityProfile?: string | null;
  allowedCapabilities?: unknown;
  strictness?: string | null;
  name?: string | null;
  department?: string | null;
  purpose?: string | null;
  description?: string | null;
  riskLevel?: string | null;
};

type WorkflowGovernanceContext = {
  legalProfile?: string | null;
  lawPackIds?: unknown;
  capabilityProfile?: string | null;
  allowedCapabilities?: unknown;
  strictness?: string | null;
};

type AgentGovernanceContext = {
  legalProfile?: string | null;
  lawPackIds?: unknown;
  capabilityProfile?: string | null;
  allowedCapabilities?: unknown;
  strictness?: string | null;
};

export type GovernanceScopeSource =
  | "system"
  | "workflow"
  | "agent_system"
  | "agent_workflow";

export type EffectiveGovernanceScope = {
  legalProfileApplied: LegalProfile;
  lawPackIdsApplied: LawPackId[];
  capabilityProfileApplied: CapabilityProfileId;
  allowedCapabilitiesApplied: CapabilityId[];
  strictnessApplied: StrictnessMode;
  source: GovernanceScopeSource;
};

function withGlobalBaseline(lawPackIds: LawPackId[]) {
  if (lawPackIds.includes("global_baseline")) {
    return lawPackIds;
  }
  return ["global_baseline", ...lawPackIds] as LawPackId[];
}

function hasExplicitGovernanceSelection(input: WorkflowGovernanceContext | AgentGovernanceContext | null | undefined) {
  if (!input) {
    return false;
  }
  return Boolean(input.legalProfile) || sanitizeLawPackIds(input.lawPackIds).length > 0;
}

function hasExplicitOperationalSelection(input: WorkflowGovernanceContext | AgentGovernanceContext | null | undefined) {
  if (!input) {
    return false;
  }
  return (
    Boolean(input.capabilityProfile) ||
    Boolean(input.strictness) ||
    (Array.isArray(input.allowedCapabilities) && input.allowedCapabilities.length > 0)
  );
}

function resolveAgentSelection(
  agentProfile: AgentGovernanceContext,
  system: SystemGovernanceContext,
): Pick<EffectiveGovernanceScope, "legalProfileApplied" | "lawPackIdsApplied"> {
  const explicitLawPackIds = sanitizeLawPackIds(agentProfile.lawPackIds);
  const legalProfileApplied = normalizeLegalProfile(
    agentProfile.legalProfile ?? system.legalProfile ?? system.geography,
  );

  return {
    legalProfileApplied,
    lawPackIdsApplied:
      explicitLawPackIds.length > 0
        ? withGlobalBaseline(explicitLawPackIds)
        : getDefaultLawPackIdsForProfile(legalProfileApplied, {
            financeDomain: inferFinanceDomain(system),
          }),
  };
}

function resolveOperationalSelection(
  selection: WorkflowGovernanceContext | AgentGovernanceContext | null | undefined,
  system: SystemGovernanceContext,
): Pick<EffectiveGovernanceScope, "capabilityProfileApplied" | "allowedCapabilitiesApplied" | "strictnessApplied"> {
  const capabilityProfileApplied = inferCapabilityProfile({
    capabilityProfile: selection?.capabilityProfile ?? system.capabilityProfile,
    name: system.name,
    department: system.department,
    purpose: system.purpose,
    description: system.description,
  });

  return {
    capabilityProfileApplied: normalizeCapabilityProfileId(capabilityProfileApplied),
    allowedCapabilitiesApplied: resolveAllowedCapabilities(
      capabilityProfileApplied,
      selection?.allowedCapabilities ?? system.allowedCapabilities,
    ),
    strictnessApplied: normalizeStrictnessMode(
      inferStrictnessMode({
        strictness: selection?.strictness ?? system.strictness,
        riskLevel: system.riskLevel,
        capabilityProfile: capabilityProfileApplied,
        name: system.name,
        department: system.department,
        purpose: system.purpose,
        description: system.description,
      }),
    ),
  };
}

export function resolveEffectiveGovernanceScope(params: {
  system: SystemGovernanceContext;
  workflow?: WorkflowGovernanceContext | null;
  agentSystemProfile?: AgentGovernanceContext | null;
  agentWorkflowProfile?: AgentGovernanceContext | null;
}): EffectiveGovernanceScope {
  const workflowHasExplicitSelection = hasExplicitGovernanceSelection(params.workflow);
  const workflowHasExplicitOperationalSelection = hasExplicitOperationalSelection(params.workflow);
  const agentWorkflowHasExplicitSelection =
    hasExplicitGovernanceSelection(params.agentWorkflowProfile) ||
    hasExplicitOperationalSelection(params.agentWorkflowProfile);
  const agentSystemHasExplicitSelection =
    hasExplicitGovernanceSelection(params.agentSystemProfile) ||
    hasExplicitOperationalSelection(params.agentSystemProfile);

  if (params.agentWorkflowProfile && agentWorkflowHasExplicitSelection) {
    return {
      ...(hasExplicitGovernanceSelection(params.agentWorkflowProfile)
        ? resolveAgentSelection(params.agentWorkflowProfile, params.system)
        : {
            legalProfileApplied: resolveWorkflowLegalProfile(params.workflow ?? {}, params.system),
            lawPackIdsApplied: resolveWorkflowLawPackIds(params.workflow ?? {}, params.system),
          }),
      ...resolveOperationalSelection(
        hasExplicitOperationalSelection(params.agentWorkflowProfile)
          ? params.agentWorkflowProfile
          : params.workflow && workflowHasExplicitOperationalSelection
            ? params.workflow
            : params.system,
        params.system,
      ),
      source: "agent_workflow",
    };
  }

  if (params.workflow && workflowHasExplicitSelection) {
    return {
      legalProfileApplied: resolveWorkflowLegalProfile(params.workflow, params.system),
      lawPackIdsApplied: resolveWorkflowLawPackIds(params.workflow, params.system),
      ...resolveOperationalSelection(
        workflowHasExplicitOperationalSelection ? params.workflow : params.system,
        params.system,
      ),
      source: "workflow",
    };
  }

  if (params.agentSystemProfile && agentSystemHasExplicitSelection) {
    return {
      ...(hasExplicitGovernanceSelection(params.agentSystemProfile)
        ? resolveAgentSelection(params.agentSystemProfile, params.system)
        : {
            legalProfileApplied: normalizeLegalProfile(params.system.legalProfile ?? params.system.geography),
            lawPackIdsApplied: resolveSystemLawPackIds(params.system),
          }),
      ...resolveOperationalSelection(
        hasExplicitOperationalSelection(params.agentSystemProfile) ? params.agentSystemProfile : params.system,
        params.system,
      ),
      source: "agent_system",
    };
  }

  if (params.workflow) {
    return {
      legalProfileApplied: resolveWorkflowLegalProfile(params.workflow, params.system),
      lawPackIdsApplied: resolveWorkflowLawPackIds(params.workflow, params.system),
      ...resolveOperationalSelection(
        workflowHasExplicitOperationalSelection ? params.workflow : params.system,
        params.system,
      ),
      source: "workflow",
    };
  }

  return {
    legalProfileApplied: normalizeLegalProfile(params.system.legalProfile ?? params.system.geography),
    lawPackIdsApplied: resolveSystemLawPackIds(params.system),
    ...resolveOperationalSelection(params.system, params.system),
    source: "system",
  };
}
