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

type SystemGovernanceContext = {
  legalProfile?: string | null;
  geography?: string | null;
  lawPackIds?: unknown;
  name?: string | null;
  department?: string | null;
  purpose?: string | null;
  description?: string | null;
};

type WorkflowGovernanceContext = {
  legalProfile?: string | null;
  lawPackIds?: unknown;
};

type AgentGovernanceContext = {
  legalProfile?: string | null;
  lawPackIds?: unknown;
};

export type GovernanceScopeSource =
  | "system"
  | "workflow"
  | "agent_system"
  | "agent_workflow";

export type EffectiveGovernanceScope = {
  legalProfileApplied: LegalProfile;
  lawPackIdsApplied: LawPackId[];
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

export function resolveEffectiveGovernanceScope(params: {
  system: SystemGovernanceContext;
  workflow?: WorkflowGovernanceContext | null;
  agentSystemProfile?: AgentGovernanceContext | null;
  agentWorkflowProfile?: AgentGovernanceContext | null;
}): EffectiveGovernanceScope {
  const workflowHasExplicitSelection = hasExplicitGovernanceSelection(params.workflow);

  if (params.agentWorkflowProfile && hasExplicitGovernanceSelection(params.agentWorkflowProfile)) {
    return {
      ...resolveAgentSelection(params.agentWorkflowProfile, params.system),
      source: "agent_workflow",
    };
  }

  if (params.workflow && workflowHasExplicitSelection) {
    return {
      legalProfileApplied: resolveWorkflowLegalProfile(params.workflow, params.system),
      lawPackIdsApplied: resolveWorkflowLawPackIds(params.workflow, params.system),
      source: "workflow",
    };
  }

  if (params.agentSystemProfile && hasExplicitGovernanceSelection(params.agentSystemProfile)) {
    return {
      ...resolveAgentSelection(params.agentSystemProfile, params.system),
      source: "agent_system",
    };
  }

  if (params.workflow) {
    return {
      legalProfileApplied: resolveWorkflowLegalProfile(params.workflow, params.system),
      lawPackIdsApplied: resolveWorkflowLawPackIds(params.workflow, params.system),
      source: "workflow",
    };
  }

  return {
    legalProfileApplied: normalizeLegalProfile(params.system.legalProfile ?? params.system.geography),
    lawPackIdsApplied: resolveSystemLawPackIds(params.system),
    source: "system",
  };
}
