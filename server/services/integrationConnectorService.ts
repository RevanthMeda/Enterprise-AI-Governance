import { eq } from "drizzle-orm";
import { organizations } from "@shared/schema";
import { db } from "../db";
import {
  sanitizeIntegrationConnectors,
  type IntegrationConnectorConfig,
} from "@shared/integration-connectors";

function getSettingsObject(rawSettings: unknown) {
  return rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? { ...(rawSettings as Record<string, unknown>) }
    : {};
}

function buildConnectorSettings(rawSettings: unknown, nextValue: unknown) {
  const settings = getSettingsObject(rawSettings);
  settings.integrationConnectors = sanitizeIntegrationConnectors(nextValue);
  return settings;
}

export class IntegrationConnectorService {
  async getForOrg(organizationId: string): Promise<IntegrationConnectorConfig[]> {
    const [organization] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return [];
    }

    const settings = getSettingsObject(organization.settings);
    return sanitizeIntegrationConnectors(settings.integrationConnectors);
  }

  async updateForOrg(organizationId: string, nextValue: IntegrationConnectorConfig[]): Promise<IntegrationConnectorConfig[]> {
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
        settings: buildConnectorSettings(organization.settings, nextValue),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning({ settings: organizations.settings });

    const settings = getSettingsObject(updated?.settings);
    return sanitizeIntegrationConnectors(settings.integrationConnectors);
  }
}

export const integrationConnectorService = new IntegrationConnectorService();
