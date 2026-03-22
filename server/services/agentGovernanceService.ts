import { storage } from "../storage";
import {
  insertAgentGovernanceProfileSchema,
  type AgentGovernanceProfile,
} from "@shared/schema";
import { resolveEffectiveGovernanceScope } from "@shared/governance-scope";
import { type LegalProfile } from "@shared/law-packs";
import type { CapabilityId, CapabilityProfileId, StrictnessMode } from "@shared/governance-policy-registry";

type Actor = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  role: string;
};

function normalizeIdentity(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildAgentIdentityCandidates(params: {
  actor?: Partial<Actor> | null;
  runtimeContext?: unknown;
  metadata?: unknown;
}) {
  const runtimeContext = getRecord(params.runtimeContext);
  const metadata = getRecord(params.metadata);

  return unique(
    [
      params.actor?.id,
      params.actor?.username,
      params.actor?.email,
      params.actor?.fullName,
      typeof runtimeContext.userId === "string" ? runtimeContext.userId : null,
      typeof runtimeContext.agentId === "string" ? runtimeContext.agentId : null,
      typeof runtimeContext.actorId === "string" ? runtimeContext.actorId : null,
      typeof metadata.userId === "string" ? metadata.userId : null,
      typeof metadata.agentId === "string" ? metadata.agentId : null,
      typeof metadata.actorId === "string" ? metadata.actorId : null,
    ]
      .map((value) => normalizeIdentity(value))
      .filter(Boolean),
  );
}

function exactScopedMatch(
  profile: AgentGovernanceProfile,
  params: { actorId: string; systemId?: string | null; workflowId?: string | null },
) {
  return (
    normalizeIdentity(profile.actorId) === params.actorId &&
    (profile.systemId ?? null) === (params.systemId ?? null) &&
    (profile.workflowId ?? null) === (params.workflowId ?? null)
  );
}

function scoreProfile(profile: AgentGovernanceProfile, params: { systemId: string; workflowId?: string | null }) {
  const exactWorkflowMatch =
    Boolean(params.workflowId) &&
    profile.systemId === params.systemId &&
    profile.workflowId === params.workflowId;
  if (exactWorkflowMatch) {
    return 3;
  }
  const exactSystemMatch = profile.systemId === params.systemId && !profile.workflowId;
  if (exactSystemMatch) {
    return 2;
  }
  if (!profile.systemId && !profile.workflowId) {
    return 1;
  }
  return 0;
}

export class AgentGovernanceService {
  async listProfiles(params: {
    organizationId: string;
    systemId?: string;
    workflowId?: string;
  }) {
    return storage.getAgentGovernanceProfilesByOrg(params.organizationId, {
      systemId: params.systemId,
      workflowId: params.workflowId,
    });
  }

  async saveProfile(params: {
    organizationId: string;
    actor: Actor;
    input: {
      actorId: string;
      actorLabel?: string | null;
      systemId?: string | null;
      workflowId?: string | null;
      legalProfile: LegalProfile;
      lawPackIds: string[];
      capabilityProfile?: CapabilityProfileId;
      allowedCapabilities?: CapabilityId[];
      strictness?: StrictnessMode;
      notes?: string | null;
    };
  }) {
    const parsed = insertAgentGovernanceProfileSchema.parse({
      actorId: normalizeIdentity(params.input.actorId),
      actorLabel: params.input.actorLabel ?? null,
      systemId: params.input.systemId ?? null,
      workflowId: params.input.workflowId ?? null,
      legalProfile: params.input.legalProfile,
      lawPackIds: params.input.lawPackIds,
      capabilityProfile: params.input.capabilityProfile ?? "general_assistant",
      allowedCapabilities: params.input.allowedCapabilities ?? [],
      strictness: params.input.strictness ?? "normal",
      notes: params.input.notes ?? null,
      createdBy: params.actor.id,
    });

    const existingProfiles = await storage.getAgentGovernanceProfilesByOrg(params.organizationId, {
      actorId: parsed.actorId,
      systemId: parsed.systemId ?? undefined,
      workflowId: parsed.workflowId ?? undefined,
    });
    const existing = existingProfiles.find((profile) =>
      exactScopedMatch(profile, {
        actorId: parsed.actorId,
        systemId: parsed.systemId ?? null,
        workflowId: parsed.workflowId ?? null,
      }),
    );

    if (existing) {
      const updated = await storage.updateAgentGovernanceProfileByOrg(params.organizationId, existing.id, {
        actorLabel: parsed.actorLabel,
        legalProfile: parsed.legalProfile,
        lawPackIds: parsed.lawPackIds,
        capabilityProfile: parsed.capabilityProfile,
        allowedCapabilities: parsed.allowedCapabilities,
        strictness: parsed.strictness,
        notes: parsed.notes,
        createdBy: parsed.createdBy,
      });
      if (updated) {
        return updated;
      }
    }

    return storage.createAgentGovernanceProfileForOrg(params.organizationId, parsed);
  }

  async deleteProfile(params: { organizationId: string; profileId: string }) {
    await storage.deleteAgentGovernanceProfileByOrg(params.organizationId, params.profileId);
  }

  async resolveEffectiveScope(params: {
    organizationId: string;
    system: {
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
      id?: string | null;
    };
    workflow?: {
      id?: string | null;
      legalProfile?: string | null;
      lawPackIds?: unknown;
      capabilityProfile?: string | null;
      allowedCapabilities?: unknown;
      strictness?: string | null;
    } | null;
    actor?: Partial<Actor> | null;
    runtimeContext?: unknown;
    metadata?: unknown;
  }) {
    const actorIds = buildAgentIdentityCandidates({
      actor: params.actor,
      runtimeContext: params.runtimeContext,
      metadata: params.metadata,
    });

    if (actorIds.length === 0 || !params.system.id) {
      return resolveEffectiveGovernanceScope({
        system: params.system,
        workflow: params.workflow,
      });
    }

    const profiles = await storage.getAgentGovernanceProfilesByOrg(params.organizationId, {
      systemId: params.system.id,
    });
    const matchingProfiles = profiles.filter((profile) => actorIds.includes(normalizeIdentity(profile.actorId)));

    const bestProfile = matchingProfiles
      .map((profile) => ({
        profile,
        score: scoreProfile(profile, {
          systemId: params.system.id!,
          workflowId: params.workflow?.id ?? null,
        }),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)[0]?.profile;

    const agentWorkflowProfile =
      bestProfile && bestProfile.workflowId === (params.workflow?.id ?? null) ? bestProfile : null;
    const agentSystemProfile =
      bestProfile && !bestProfile.workflowId && bestProfile.systemId === params.system.id ? bestProfile : null;

    return resolveEffectiveGovernanceScope({
      system: params.system,
      workflow: params.workflow,
      agentWorkflowProfile,
      agentSystemProfile,
    });
  }
}

export const agentGovernanceService = new AgentGovernanceService();
