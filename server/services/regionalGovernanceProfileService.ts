import { eq } from "drizzle-orm";
import { organizations } from "@shared/schema";
import { db } from "../db";
import {
  DEFAULT_REGIONAL_GOVERNANCE_PROFILE,
  sanitizeRegionalGovernanceProfile,
  type RegionalGovernanceProfile,
} from "@shared/regional-governance-profile";

function getSettingsObject(rawSettings: unknown) {
  return rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? { ...(rawSettings as Record<string, unknown>) }
    : {};
}

function buildRegionalGovernanceSettings(rawSettings: unknown, nextValue: unknown) {
  const settings = getSettingsObject(rawSettings);
  settings.regionalGovernanceProfile = sanitizeRegionalGovernanceProfile(nextValue);
  return settings;
}

export class RegionalGovernanceProfileService {
  async getForOrg(organizationId: string): Promise<RegionalGovernanceProfile> {
    const [organization] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return DEFAULT_REGIONAL_GOVERNANCE_PROFILE;
    }

    const settings = getSettingsObject(organization.settings);
    return sanitizeRegionalGovernanceProfile(settings.regionalGovernanceProfile);
  }

  async updateForOrg(organizationId: string, nextValue: RegionalGovernanceProfile): Promise<RegionalGovernanceProfile> {
    const [organization] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      throw new Error("Organization not found");
    }

    const [updated] = await db
      .update(organizations)
      .set({
        settings: buildRegionalGovernanceSettings(organization.settings, nextValue),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning({ settings: organizations.settings });

    const settings = getSettingsObject(updated?.settings);
    return sanitizeRegionalGovernanceProfile(settings.regionalGovernanceProfile);
  }
}

export const regionalGovernanceProfileService = new RegionalGovernanceProfileService();
