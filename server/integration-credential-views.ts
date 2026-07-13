import type { JiraIntegration } from "@shared/schema";
import type { IntegrationConnectorConfig } from "@shared/integration-connectors";
import type { ThreatIntelConfig } from "@shared/threat-intelligence";
import { hasPersistedCredential } from "./persisted-secret";

export type JiraIntegrationClientView = Omit<JiraIntegration, "apiToken"> & {
  hasCredential: boolean;
};

export type IntegrationConnectorClientView = IntegrationConnectorConfig & {
  hasCredential: boolean;
};

export type ThreatIntelClientConfig = ThreatIntelConfig & {
  externalFeed: ThreatIntelConfig["externalFeed"] & {
    hasCredential: boolean;
  };
};

export function jiraIntegrationClientView(integration: JiraIntegration): JiraIntegrationClientView {
  const { apiToken: _apiToken, ...safe } = integration;
  return { ...safe, hasCredential: hasPersistedCredential(integration.apiToken) };
}

export function integrationConnectorClientView(
  connector: IntegrationConnectorConfig,
): IntegrationConnectorClientView {
  return {
    ...connector,
    authToken: null,
    hasCredential: hasPersistedCredential(connector.authToken),
  };
}

export function threatIntelClientView(config: ThreatIntelConfig): ThreatIntelClientConfig {
  return {
    ...config,
    externalFeed: {
      ...config.externalFeed,
      authToken: null,
      hasCredential: hasPersistedCredential(config.externalFeed.authToken),
    },
  };
}

export function oidcAuthSettingsClientView<T extends { oidcClientSecret: string | null }>(
  settings: T,
): Omit<T, "oidcClientSecret"> & { oidcClientSecret: null; hasOidcClientSecret: boolean } {
  return {
    ...settings,
    oidcClientSecret: null,
    hasOidcClientSecret: hasPersistedCredential(settings.oidcClientSecret),
  };
}
