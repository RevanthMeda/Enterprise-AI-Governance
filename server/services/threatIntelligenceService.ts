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
  async getConfigForOrg(organizationId: string): Promise<ThreatIntelConfig> {
    const [organization] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!organization) {
      return DEFAULT_THREAT_INTEL_CONFIG;
    }

    const settings = getSettingsObject(organization.settings);
    return sanitizeThreatIntelConfig(settings.threatIntelligenceConfig);
  }

  async updateConfigForOrg(organizationId: string, nextValue: ThreatIntelConfig): Promise<ThreatIntelConfig> {
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
        settings: buildThreatIntelSettings(organization.settings, nextValue),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning({ settings: organizations.settings });

    const settings = getSettingsObject(updated?.settings);
    return sanitizeThreatIntelConfig(settings.threatIntelligenceConfig);
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
    const feedUrl = configuredFeedUrl ?? normalizeOptionalString(process.env.THREAT_INTEL_FEED_URL);
    if (!feedUrl) {
      return { indicators: [], remoteFeedConfigured: false, providerType, providerLabel };
    }

    const now = Date.now();
    const cacheKey = `${feedUrl}|${configuredToken ?? normalizeOptionalString(process.env.THREAT_INTEL_FEED_TOKEN) ?? ""}`;
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
      const response = await fetch(feedUrl, {
        headers: configuredToken ?? normalizeOptionalString(process.env.THREAT_INTEL_FEED_TOKEN)
          ? { Authorization: `Bearer ${(configuredToken ?? normalizeOptionalString(process.env.THREAT_INTEL_FEED_TOKEN))!}` }
          : undefined,
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
    const config = await this.getConfigForOrg(organizationId);
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
