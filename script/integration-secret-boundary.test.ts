import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  integrationConnectorClientView,
  jiraIntegrationClientView,
  oidcAuthSettingsClientView,
  threatIntelClientView,
} from "../server/integration-credential-views";

test("client serialization exposes only credential state for every persisted integration secret", () => {
  const jira = jiraIntegrationClientView({
    id: "jira-1",
    organizationId: "org-1",
    enabled: true,
    baseUrl: "https://jira.example.net",
    projectKey: "AI",
    userEmail: "service@example.net",
    apiToken: "jira-plaintext-must-not-leak",
    issueType: "Task",
    labels: [],
    lastTestedAt: null,
    lastSyncAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  });
  assert.equal(jira.hasCredential, true);
  assert.equal("apiToken" in jira, false);

  const connector = integrationConnectorClientView({
    id: "connector-1",
    label: "Security sink",
    type: "generic_webhook",
    enabled: true,
    webhookUrl: "https://hooks.example.net/events",
    authToken: "connector-plaintext-must-not-leak",
    eventFilters: [],
    severityFloor: "warning",
  });
  assert.equal(connector.hasCredential, true);
  assert.equal(connector.authToken, null);

  const threat = threatIntelClientView({
    enabled: true,
    advisoryMode: true,
    externalFeed: {
      enabled: true,
      providerType: "generic_json",
      providerLabel: "Feed",
      feedUrl: "https://feed.example.net/indicators",
      authToken: "feed-plaintext-must-not-leak",
    },
    customIndicators: [],
  });
  assert.equal(threat.externalFeed.hasCredential, true);
  assert.equal(threat.externalFeed.authToken, null);

  const oidc = oidcAuthSettingsClientView({
    mode: "oidc",
    oidcClientSecret: "oidc-plaintext-must-not-leak",
  });
  assert.equal(oidc.hasOidcClientSecret, true);
  assert.equal(oidc.oidcClientSecret, null);

  const serialized = JSON.stringify({ jira, connector, threat, oidc });
  assert.doesNotMatch(serialized, /plaintext-must-not-leak/);
});

test("server execution paths resolve secrets privately instead of using client views", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const jiraSource = fs.readFileSync(path.join(root, "server/services/jiraService.ts"), "utf8");
  const connectorSource = fs.readFileSync(path.join(root, "server/services/governanceEventService.ts"), "utf8");
  const backgroundJobSource = fs.readFileSync(path.join(root, "server/services/backgroundJobService.ts"), "utf8");
  const threatSource = fs.readFileSync(path.join(root, "server/services/threatIntelligenceService.ts"), "utf8");
  const ssoSource = fs.readFileSync(path.join(root, "server/services/ssoService.ts"), "utf8");
  const settingsSource = fs.readFileSync(path.join(root, "server/routes/settings.ts"), "utf8");
  const integrationsUiSource = fs.readFileSync(path.join(root, "client/src/pages/integrations.tsx"), "utf8");
  const settingsUiSource = fs.readFileSync(path.join(root, "client/src/pages/settings.tsx"), "utf8");

  assert.match(jiraSource, /private async getResolvedIntegration/);
  assert.match(jiraSource, /jiraIntegrationClientView\(integration\)/);
  // Event producers enqueue only a connector reference. The worker resolves the
  // current destination and credential at execution time, so secrets are not
  // copied into durable job payloads.
  assert.match(connectorSource, /kind:\s*"organization_connector"/);
  assert.doesNotMatch(connectorSource, /payload:\s*\{[^}]*authToken/s);
  assert.match(backgroundJobSource, /integrationConnectorService\.getResolvedForOrg/);
  assert.match(threatSource, /private async getResolvedConfigForOrg/);
  assert.match(ssoSource, /resolveOidcClientSecretForExecution/);
  assert.match(settingsSource, /getOidcClientSecretState/);
  assert.doesNotMatch(settingsSource, /apiToken:\s*integration\.apiToken/);
  assert.doesNotMatch(integrationsUiSource, /integrationQuery\.data\.apiToken/);
  assert.doesNotMatch(settingsUiSource, /setOidcClientSecret\(orgAuthSettings\.oidcClientSecret/);
  assert.match(integrationsUiSource, /clearApiToken/);
  assert.match(integrationsUiSource, /clearAuthToken/);
  assert.match(settingsUiSource, /clearOidcClientSecret/);
});
