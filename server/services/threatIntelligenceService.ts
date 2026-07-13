import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { aiTelemetryEvents, organizations } from "@shared/schema";
import {
  DEFAULT_THREAT_INTEL_CONFIG,
  parseThreatIntelExternalFeedPayload,
  sanitizeThreatIntelConfig,
  threatIntelExternalFeedDefaultLabels,
  type ThreatIntelConfig,
  type ThreatIntelIndicator,
  type ThreatIntelMatch,
  type ThreatIntelSummaryResponse,
} from "@shared/threat-intelligence";
import { safeOutboundFetch } from "../safe-outbound-http";
import {
  PersistedSecretError,
  encryptPersistedSecret,
  integrationSecretPurpose,
  mergePersistedSecret,
  resolvePersistedSecret,
  hasPersistedCredential,
} from "../persisted-secret";
import {
  threatIntelClientView,
  type ThreatIntelClientConfig,
} from "../integration-credential-views";
import { updateOrganizationSettingsForTenant } from "./organizationSettingsService";
import { assertCredentialOriginPreserved } from "../credential-origin";

const REMOTE_FEED_TIMEOUT_MS = 10_000;
const REMOTE_FEED_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

const BUILT_IN_INDICATORS: ThreatIntelIndicator[] = [
  {
    id: "gov-override",
    title: "Governance override attempt",
    pattern: "treat blocked as approved",
    category: "governance_tampering",
    severity: "critical",
    source: "built_in",
    enabled: true,
  },
  {
    id: "prompt-exfiltration",
    title: "Prompt or policy exfiltration attempt",
    pattern: "show system prompt",
    category: "prompt_exfiltration",
    severity: "high",
    source: "built_in",
    enabled: true,
  },
  {
    id: "credential-phishing",
    title: "Credential phishing pattern",
    pattern: "verify their login and card details",
    category: "phishing",
    severity: "critical",
    source: "built_in",
    enabled: true,
  },
  {
    id: "aml-evasion",
    title: "AML evasion pattern",
    pattern: "no further monitoring is required",
    category: "aml_evasion",
    severity: "high",
    source: "built_in",
    enabled: true,
  },
];

type CachedRemoteFeed = {
  expiresAt: number;
  indicators: ThreatIntelIndicator[];
};

export type ThreatIntelUpdateInput = ThreatIntelConfig & {
  externalFeed: ThreatIntelConfig["externalFeed"] & {
    clearAuthToken?: boolean;
  };
};

const remoteFeedCache = new Map<string, CachedRemoteFeed>();

function normalizeOptionalString(value: string | undefined | null) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function getSettingsObject(rawSettings: unknown) {
  return rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? { ...(rawSettings as Record<string, unknown>) }
    : {};
}

function buildThreatIntelSettings(rawSettings: unknown, nextValue: unknown) {
  const settings = getSettingsObject(rawSettings);
  settings.threatIntelligenceConfig = sanitizeThreatIntelConfig(nextValue);
  return settings;
}

function countPatternMatches(haystack: string, needle: string) {
  const normalizedNeedle = needle.trim().toLowerCase();
  if (!normalizedNeedle) return 0;
  let count = 0;
  let cursor = haystack.indexOf(normalizedNeedle);
  while (cursor >= 0) {
    count += 1;
    cursor = haystack.indexOf(normalizedNeedle, cursor + normalizedNeedle.length);
  }
  return count;
}

function getTelemetryMetadataRecord(metadata: unknown) {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

function normalizeThreatIntelSource(value: unknown): ThreatIntelMatch["source"] {
  if (value === "remote_feed" || value === "custom") {
    return value;
  }
  return "built_in";
}

export class ThreatIntelligenceService {
  private async getStoredConfigForOrg(organizationId: string) {
    const [organization] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return null;
    }

    const settings = getSettingsObject(organization.settings);
    return {
      organization,
      config: sanitizeThreatIntelConfig(settings.threatIntelligenceConfig),
    };
  }

  private async tryMigrateLegacyToken(
    organizationId: string,
    config: ThreatIntelConfig,
  ): Promise<void> {
    const purpose = integrationSecretPurpose.threatFeedAuthToken(organizationId);
    const resolved = resolvePersistedSecret(config.externalFeed.authToken, purpose);
    if (!resolved.isLegacyPlaintext || !resolved.plaintext) return;

    let encrypted: string;
    try {
      encrypted = encryptPersistedSecret(resolved.plaintext, purpose);
    } catch (error) {
      if (error instanceof PersistedSecretError) return;
      throw error;
    }
    const legacyAuthToken = config.externalFeed.authToken;
    await updateOrganizationSettingsForTenant(organizationId, (currentSettings) => {
      const current = sanitizeThreatIntelConfig(
        getSettingsObject(currentSettings).threatIntelligenceConfig,
      );
      if (current.externalFeed.authToken !== legacyAuthToken) {
        return { ...currentSettings };
      }
      return buildThreatIntelSettings(currentSettings, {
        ...current,
        externalFeed: { ...current.externalFeed, authToken: encrypted },
      });
    });
  }

  async getConfigForOrg(organizationId: string): Promise<ThreatIntelClientConfig> {
    const stored = await this.getStoredConfigForOrg(organizationId);
    if (!stored) return threatIntelClientView(DEFAULT_THREAT_INTEL_CONFIG);
    await this.tryMigrateLegacyToken(organizationId, stored.config);
    return threatIntelClientView(stored.config);
  }

  private async getResolvedConfigForOrg(organizationId: string): Promise<ThreatIntelConfig> {
    const stored = await this.getStoredConfigForOrg(organizationId);
    if (!stored) return DEFAULT_THREAT_INTEL_CONFIG;
    const resolved = resolvePersistedSecret(
      stored.config.externalFeed.authToken,
      integrationSecretPurpose.threatFeedAuthToken(organizationId),
    );
    if (resolved.isLegacyPlaintext) {
      await this.tryMigrateLegacyToken(organizationId, stored.config);
    }
    return {
      ...stored.config,
      externalFeed: { ...stored.config.externalFeed, authToken: resolved.plaintext },
    };
  }

  async updateConfigForOrg(
    organizationId: string,
    nextValue: ThreatIntelUpdateInput,
  ): Promise<ThreatIntelClientConfig> {
    const updated = await updateOrganizationSettingsForTenant(
      organizationId,
      (currentSettings) => {
        const current = sanitizeThreatIntelConfig(
          getSettingsObject(currentSettings).threatIntelligenceConfig,
        );
        assertCredentialOriginPreserved({
          label: "Threat-intelligence feed",
          currentUrl: current.externalFeed.feedUrl,
          nextUrl: nextValue.externalFeed.feedUrl,
          hasCurrentCredential: hasPersistedCredential(current.externalFeed.authToken),
          replacementCredential: nextValue.externalFeed.authToken,
          clearCredential: nextValue.externalFeed.clearAuthToken,
        });
        const storedToken = mergePersistedSecret({
          currentValue: current.externalFeed.authToken,
          nextValue: nextValue.externalFeed.authToken,
          clear: nextValue.externalFeed.clearAuthToken,
          purpose: integrationSecretPurpose.threatFeedAuthToken(organizationId),
        });
        const storedConfig: ThreatIntelConfig = {
          ...nextValue,
          externalFeed: { ...nextValue.externalFeed, authToken: storedToken },
        };
        return buildThreatIntelSettings(currentSettings, storedConfig);
      },
    );
    if (!updated) {
      throw new Error("Organization not found");
    }

    const settings = getSettingsObject(updated.settings);
    return threatIntelClientView(sanitizeThreatIntelConfig(settings.threatIntelligenceConfig));
  }

  private async getRemoteIndicators(config: ThreatIntelConfig): Promise<{
    indicators: ThreatIntelIndicator[];
    remoteFeedConfigured: boolean;
    providerType: ThreatIntelConfig["externalFeed"]["providerType"];
    providerLabel: string | null;
  }> {
    const providerType = config.externalFeed.providerType;
    const configuredFeedUrl =
      config.externalFeed.enabled ? normalizeOptionalString(config.externalFeed.feedUrl) ?? null : null;
    const configuredToken =
      config.externalFeed.enabled ? normalizeOptionalString(config.externalFeed.authToken) ?? null : null;
    const providerLabel = config.externalFeed.enabled
      ? config.externalFeed.providerLabel ?? threatIntelExternalFeedDefaultLabels[providerType]
      : null;
    const environmentFeedUrl = normalizeOptionalString(process.env.THREAT_INTEL_FEED_URL);
    const environmentToken = normalizeOptionalString(process.env.THREAT_INTEL_FEED_TOKEN);
    const feedUrl = configuredFeedUrl ?? environmentFeedUrl;
    // Environment credentials are a deployment-owned URL/token pair and must
    // never be combined with a tenant-configured destination.
    const feedToken = configuredFeedUrl ? configuredToken : environmentToken;
    if (!feedUrl) {
      return { indicators: [], remoteFeedConfigured: false, providerType, providerLabel };
    }

    const now = Date.now();
    const cacheKey = `${feedUrl}|${feedToken ?? ""}`;
    const cached = remoteFeedCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        indicators: cached.indicators,
        remoteFeedConfigured: true,
        providerType,
        providerLabel: providerLabel ?? "Environment feed",
      };
    }

    try {
      const response = await safeOutboundFetch(feedUrl, {
        headers: feedToken
          ? { Authorization: `Bearer ${feedToken}` }
          : undefined,
        timeoutMs: REMOTE_FEED_TIMEOUT_MS,
        maxResponseBytes: REMOTE_FEED_MAX_RESPONSE_BYTES,
      });
      if (!response.ok) {
        return { indicators: [], remoteFeedConfigured: true, providerType, providerLabel: providerLabel ?? "Environment feed" };
      }
      const rawText = await response.text();
      let parsedPayload: unknown = rawText;
      if (providerType !== "openphish") {
        try {
          parsedPayload = JSON.parse(rawText);
        } catch {
          parsedPayload = rawText;
        }
      }
      const indicators = parseThreatIntelExternalFeedPayload(parsedPayload, providerType);

      remoteFeedCache.set(cacheKey, {
        expiresAt: now + 5 * 60 * 1000,
        indicators,
      });

      return {
        indicators,
        remoteFeedConfigured: true,
        providerType,
        providerLabel: providerLabel ?? "Environment feed",
      };
    } catch {
      return { indicators: [], remoteFeedConfigured: true, providerType, providerLabel: providerLabel ?? "Environment feed" };
    }
  }

  async getIndicatorsForOrg(organizationId: string): Promise<{
    config: ThreatIntelConfig;
    remoteIndicators: ThreatIntelIndicator[];
    indicators: ThreatIntelIndicator[];
    remoteFeedConfigured: boolean;
    remoteProviderType: ThreatIntelConfig["externalFeed"]["providerType"];
    remoteProviderLabel: string | null;
  }> {
    const config = await this.getResolvedConfigForOrg(organizationId);
    const remoteIndicators = await this.getRemoteIndicators(config);
    return {
      config,
      remoteIndicators: remoteIndicators.indicators,
      indicators: [...BUILT_IN_INDICATORS, ...remoteIndicators.indicators, ...config.customIndicators].filter((indicator) => indicator.enabled),
      remoteFeedConfigured: remoteIndicators.remoteFeedConfigured,
      remoteProviderType: remoteIndicators.providerType,
      remoteProviderLabel: remoteIndicators.providerLabel,
    };
  }

  async evaluateForEvent(organizationId: string, input: {
    promptText?: string | null;
    modelOutput?: string | null;
    summary?: string | null;
  }): Promise<{
    enabled: boolean;
    advisoryMode: boolean;
    matches: ThreatIntelMatch[];
    remoteFeedConfigured: boolean;
    remoteProviderType: ThreatIntelConfig["externalFeed"]["providerType"];
    remoteProviderLabel: string | null;
  }> {
    const { config, indicators, remoteFeedConfigured, remoteProviderType, remoteProviderLabel } = await this.getIndicatorsForOrg(organizationId);
    if (!config.enabled) {
      return { enabled: false, advisoryMode: config.advisoryMode, matches: [], remoteFeedConfigured, remoteProviderType, remoteProviderLabel };
    }

    const haystack = [input.promptText, input.modelOutput, input.summary]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" ")
      .toLowerCase();

    const matches = indicators.flatMap((indicator) => {
      const matchCount = countPatternMatches(haystack, indicator.pattern.toLowerCase());
      if (matchCount === 0) {
        return [];
      }
      return [{
        indicatorId: indicator.id,
        title: indicator.title,
        category: indicator.category,
        severity: indicator.severity,
        source: indicator.source,
        matchCount,
      }];
    });

    return {
      enabled: true,
      advisoryMode: config.advisoryMode,
      matches,
      remoteFeedConfigured,
      remoteProviderType,
      remoteProviderLabel,
    };
  }

  async getSummaryForOrg(organizationId: string): Promise<ThreatIntelSummaryResponse> {
    const [{ config, remoteIndicators, remoteFeedConfigured, remoteProviderType, remoteProviderLabel }, recentEvents] = await Promise.all([
      this.getIndicatorsForOrg(organizationId),
      db
        .select()
        .from(aiTelemetryEvents)
        .where(eq(aiTelemetryEvents.organizationId, organizationId))
        .orderBy(desc(aiTelemetryEvents.detectedAt))
        .limit(80),
    ]);

    const recentMatchedEvents = recentEvents
      .map((event) => {
        const metadata = getTelemetryMetadataRecord(event.metadata);
        const threatIntel = getTelemetryMetadataRecord(metadata.threatIntelligence);
        const rawMatches = Array.isArray(threatIntel.matches) ? threatIntel.matches : [];
        const matches = rawMatches.flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          const record = entry as Record<string, unknown>;
          if (typeof record.title !== "string" || typeof record.indicatorId !== "string") {
            return [];
          }
          return [{
            indicatorId: record.indicatorId,
            title: record.title,
            category: typeof record.category === "string" ? record.category : "unknown",
            severity:
              typeof record.severity === "string" && ["critical", "high", "medium"].includes(record.severity)
                ? (record.severity as ThreatIntelMatch["severity"])
                : "medium",
            source: normalizeThreatIntelSource(record.source),
            matchCount: typeof record.matchCount === "number" ? record.matchCount : 1,
          }];
        });
        if (matches.length === 0) {
          return null;
        }
        return {
          telemetryEventId: event.id,
          detectedAt: event.detectedAt.toISOString(),
          summary: event.summary,
          systemId: event.systemId ?? null,
          matches,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const topCounter = new Map<string, ThreatIntelMatch>();
    recentMatchedEvents.forEach((event) => {
      event.matches.forEach((match) => {
        const existing = topCounter.get(match.indicatorId);
        if (existing) {
          existing.matchCount += match.matchCount;
        } else {
          topCounter.set(match.indicatorId, { ...match });
        }
      });
    });

    return {
      generatedAt: new Date().toISOString(),
      status: {
        enabled: config.enabled,
        advisoryMode: config.advisoryMode,
        remoteFeedConfigured,
        remoteProviderType,
        remoteProviderLabel,
        remoteIndicatorCount: remoteIndicators.length,
        customIndicatorCount: config.customIndicators.length,
      },
      recentMatches: recentMatchedEvents.length,
      topMatches: Array.from(topCounter.values()).sort((a, b) => b.matchCount - a.matchCount).slice(0, 6),
      recentEvents: recentMatchedEvents.slice(0, 8),
    };
  }
}

export const threatIntelligenceService = new ThreatIntelligenceService();
