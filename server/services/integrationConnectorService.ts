import { eq } from "drizzle-orm";
import { organizations } from "@shared/schema";
import { db } from "../db";
import {
  sanitizeIntegrationConnectors,
  type IntegrationConnectorConfig,
} from "@shared/integration-connectors";
import {
  PersistedSecretError,
  encryptPersistedSecret,
  integrationSecretPurpose,
  mergePersistedSecret,
  resolvePersistedSecret,
  hasPersistedCredential,
} from "../persisted-secret";
import {
  integrationConnectorClientView,
  type IntegrationConnectorClientView,
} from "../integration-credential-views";
import { updateOrganizationSettingsForTenant } from "./organizationSettingsService";
import { assertCredentialOriginPreserved } from "../credential-origin";

export type IntegrationConnectorUpdateInput = IntegrationConnectorConfig & {
  clearAuthToken?: boolean;
};

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

function resolveConnectorSecret(organizationId: string, connector: IntegrationConnectorConfig) {
  return resolvePersistedSecret(
    connector.authToken,
    integrationSecretPurpose.connectorAuthToken(organizationId, connector.id),
  );
}

export class IntegrationConnectorService {
  private async getStoredForOrg(organizationId: string) {
    const [organization] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) return null;

    const settings = getSettingsObject(organization.settings);
    return {
      organization,
      connectors: sanitizeIntegrationConnectors(settings.integrationConnectors),
    };
  }

  private async tryMigrateLegacySecrets(
    organizationId: string,
    connectors: IntegrationConnectorConfig[],
  ): Promise<void> {
    const migrations = connectors.flatMap((connector) => {
      const resolved = resolveConnectorSecret(organizationId, connector);
      if (!resolved.isLegacyPlaintext || !resolved.plaintext) return [];
      try {
        return [{
          connectorId: connector.id,
          legacyAuthToken: connector.authToken,
          encryptedAuthToken: encryptPersistedSecret(
            resolved.plaintext,
            integrationSecretPurpose.connectorAuthToken(organizationId, connector.id),
          ),
        }];
      } catch (error) {
        if (error instanceof PersistedSecretError) return [];
        throw error;
      }
    });
    if (migrations.length === 0) return;

    await updateOrganizationSettingsForTenant(organizationId, (currentSettings) => {
      const currentConnectors = sanitizeIntegrationConnectors(
        getSettingsObject(currentSettings).integrationConnectors,
      );
      const migratedConnectors = currentConnectors.map((connector) => {
        const migration = migrations.find(
          (candidate) =>
            candidate.connectorId === connector.id &&
            candidate.legacyAuthToken === connector.authToken,
        );
        return migration
          ? { ...connector, authToken: migration.encryptedAuthToken }
          : connector;
      });
      return buildConnectorSettings(currentSettings, migratedConnectors);
    });
  }

  async getForOrg(organizationId: string): Promise<IntegrationConnectorClientView[]> {
    const stored = await this.getStoredForOrg(organizationId);
    if (!stored) return [];
    await this.tryMigrateLegacySecrets(organizationId, stored.connectors);
    return stored.connectors.map(integrationConnectorClientView);
  }

  async getResolvedForOrg(organizationId: string): Promise<IntegrationConnectorConfig[]> {
    const stored = await this.getStoredForOrg(organizationId);
    if (!stored) return [];
    const resolved = stored.connectors.map((connector) => ({
      ...connector,
      authToken: resolveConnectorSecret(organizationId, connector).plaintext,
    }));
    await this.tryMigrateLegacySecrets(organizationId, stored.connectors);
    return resolved;
  }

  async updateForOrg(
    organizationId: string,
    nextValue: IntegrationConnectorUpdateInput[],
  ): Promise<IntegrationConnectorClientView[]> {
    const updated = await updateOrganizationSettingsForTenant(
      organizationId,
      (currentSettings) => {
        const current = sanitizeIntegrationConnectors(
          getSettingsObject(currentSettings).integrationConnectors,
        );
        const normalized = sanitizeIntegrationConnectors(nextValue).map((connector) => {
          const currentConnector = current.find((entry) => entry.id === connector.id);
          const rawPatch = nextValue.find((entry) => entry.id === connector.id);
          assertCredentialOriginPreserved({
            label: `Connector ${connector.label}`,
            currentUrl: currentConnector?.webhookUrl,
            nextUrl: connector.webhookUrl,
            hasCurrentCredential: hasPersistedCredential(currentConnector?.authToken),
            replacementCredential: rawPatch?.authToken,
            clearCredential: rawPatch?.clearAuthToken,
          });
          return {
            ...connector,
            authToken: mergePersistedSecret({
              currentValue: currentConnector?.authToken,
              nextValue: rawPatch?.authToken,
              clear: rawPatch?.clearAuthToken,
              purpose: integrationSecretPurpose.connectorAuthToken(organizationId, connector.id),
            }),
          };
        });
        return buildConnectorSettings(currentSettings, normalized);
      },
    );
    if (!updated) {
      throw new Error("Organization not found");
    }

    const updatedSettings = getSettingsObject(updated.settings);
    return sanitizeIntegrationConnectors(updatedSettings.integrationConnectors).map(integrationConnectorClientView);
  }
}

export const integrationConnectorService = new IntegrationConnectorService();
