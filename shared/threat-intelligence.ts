export const threatIntelIndicatorSeverities = ["critical", "high", "medium"] as const;
export type ThreatIntelIndicatorSeverity = (typeof threatIntelIndicatorSeverities)[number];
export const threatIntelExternalFeedTypes = ["generic_json", "openphish", "misp"] as const;
export type ThreatIntelExternalFeedType = (typeof threatIntelExternalFeedTypes)[number];

export type ThreatIntelIndicator = {
  id: string;
  title: string;
  pattern: string;
  category: string;
  severity: ThreatIntelIndicatorSeverity;
  source: "built_in" | "remote_feed" | "custom";
  enabled: boolean;
};

export type ThreatIntelConfig = {
  enabled: boolean;
  advisoryMode: boolean;
  externalFeed: {
    enabled: boolean;
    providerType: ThreatIntelExternalFeedType;
    providerLabel: string | null;
    feedUrl: string | null;
    authToken: string | null;
  };
  customIndicators: ThreatIntelIndicator[];
};

export type ThreatIntelMatch = {
  indicatorId: string;
  title: string;
  category: string;
  severity: ThreatIntelIndicatorSeverity;
  source: ThreatIntelIndicator["source"];
  matchCount: number;
};

export type ThreatIntelSummaryResponse = {
  generatedAt: string;
  status: {
    enabled: boolean;
    advisoryMode: boolean;
    remoteFeedConfigured: boolean;
    remoteProviderType: ThreatIntelExternalFeedType;
    remoteProviderLabel: string | null;
    remoteIndicatorCount: number;
    customIndicatorCount: number;
  };
  recentMatches: number;
  topMatches: ThreatIntelMatch[];
  recentEvents: Array<{
    telemetryEventId: string;
    detectedAt: string;
    summary: string;
    systemId: string | null;
    matches: ThreatIntelMatch[];
  }>;
};

export const DEFAULT_THREAT_INTEL_CONFIG: ThreatIntelConfig = {
  enabled: false,
  advisoryMode: true,
  externalFeed: {
    enabled: false,
    providerType: "generic_json",
    providerLabel: null,
    feedUrl: null,
    authToken: null,
  },
  customIndicators: [],
};

export const threatIntelExternalFeedTypeLabels: Record<ThreatIntelExternalFeedType, string> = {
  generic_json: "Generic JSON feed",
  openphish: "OpenPhish URL feed",
  misp: "MISP attributes feed",
};

export const threatIntelExternalFeedTypeDescriptions: Record<ThreatIntelExternalFeedType, string> = {
  generic_json: "Array or object payload with indicators containing title, pattern, category, and severity.",
  openphish: "Line-delimited or array-based phishing URLs converted into high-priority indicators.",
  misp: "MISP-style attribute exports using value/category/type records for threat matching.",
};

export const threatIntelExternalFeedDefaultLabels: Record<ThreatIntelExternalFeedType, string> = {
  generic_json: "Custom external feed",
  openphish: "OpenPhish",
  misp: "MISP",
};

export const threatIntelExternalFeedUrlPlaceholders: Record<ThreatIntelExternalFeedType, string> = {
  generic_json: "https://feed.example.com/indicators",
  openphish: "https://openphish.example/feed.txt",
  misp: "https://misp.example/attributes/restSearch",
};

function normalizeIndicatorSeverity(input: unknown): ThreatIntelIndicatorSeverity {
  if (typeof input === "string" && (threatIntelIndicatorSeverities as readonly string[]).includes(input)) {
    return input as ThreatIntelIndicatorSeverity;
  }
  return "medium";
}

function parseGenericJsonThreatIntelPayload(payload: unknown): ThreatIntelIndicator[] {
  const rawIndicators = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).indicators)
      ? ((payload as Record<string, unknown>).indicators as unknown[])
      : [];

  return rawIndicators.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const title = typeof record.title === "string" && record.title.trim() ? record.title.trim() : null;
    const pattern = typeof record.pattern === "string" && record.pattern.trim() ? record.pattern.trim() : null;
    if (!title || !pattern) {
      return [];
    }
    return [{
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `remote-${index + 1}`,
      title,
      pattern,
      category: typeof record.category === "string" && record.category.trim() ? record.category.trim() : "external_feed",
      severity: normalizeIndicatorSeverity(record.severity),
      source: "remote_feed" as const,
      enabled: record.enabled !== false,
    }];
  });
}

function parseOpenPhishThreatIntelPayload(payload: unknown): ThreatIntelIndicator[] {
  const lines = typeof payload === "string"
    ? payload.split(/\r?\n/)
    : Array.isArray(payload)
      ? payload.flatMap((entry) => {
          if (typeof entry === "string") return [entry];
          if (entry && typeof entry === "object" && !Array.isArray(entry)) {
            const record = entry as Record<string, unknown>;
            return typeof record.url === "string" ? [record.url] : typeof record.pattern === "string" ? [record.pattern] : [];
          }
          return [];
        })
      : payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).data === "string"
        ? String((payload as Record<string, unknown>).data).split(/\r?\n/)
        : [];

  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .slice(0, 250)
    .map((pattern, index) => ({
      id: `openphish-${index + 1}`,
      title: `OpenPhish IOC ${index + 1}`,
      pattern,
      category: "phishing_url",
      severity: "critical" as const,
      source: "remote_feed" as const,
      enabled: true,
    }));
}

function parseMispThreatIntelPayload(payload: unknown): ThreatIntelIndicator[] {
  const rawAttributes = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).Attribute)
      ? ((payload as Record<string, unknown>).Attribute as unknown[])
      : payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).response)
        ? ((payload as Record<string, unknown>).response as unknown[])
        : payload && typeof payload === "object" && (payload as Record<string, unknown>).response && typeof (payload as Record<string, unknown>).response === "object" && Array.isArray(((payload as Record<string, unknown>).response as Record<string, unknown>).Attribute)
          ? ((((payload as Record<string, unknown>).response as Record<string, unknown>).Attribute) as unknown[])
          : [];

  return rawAttributes.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const value = typeof record.value === "string" && record.value.trim() ? record.value.trim() : null;
    if (!value) {
      return [];
    }
    const category = typeof record.category === "string" && record.category.trim() ? record.category.trim() : "misp";
    const type = typeof record.type === "string" && record.type.trim() ? record.type.trim() : "attribute";
    const title = typeof record.comment === "string" && record.comment.trim()
      ? record.comment.trim()
      : `${category} / ${type}`;
    return [{
      id: typeof record.uuid === "string" && record.uuid.trim()
        ? record.uuid.trim()
        : typeof record.id === "string" && record.id.trim()
          ? record.id.trim()
          : `misp-${index + 1}`,
      title,
      pattern: value,
      category: `${category}:${type}`,
      severity: /phish|credential|malware|botnet/i.test(`${category} ${type}`) ? "critical" : "high",
      source: "remote_feed" as const,
      enabled: record.to_ids !== false,
    }];
  });
}

export function parseThreatIntelExternalFeedPayload(
  payload: unknown,
  providerType: ThreatIntelExternalFeedType,
): ThreatIntelIndicator[] {
  const parsed =
    providerType === "openphish"
      ? parseOpenPhishThreatIntelPayload(payload)
      : providerType === "misp"
        ? parseMispThreatIntelPayload(payload)
        : parseGenericJsonThreatIntelPayload(payload);
  return parsed.slice(0, 250);
}

export function sanitizeThreatIntelConfig(input: unknown): ThreatIntelConfig {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
  const externalFeedRecord =
    record.externalFeed && typeof record.externalFeed === "object" && !Array.isArray(record.externalFeed)
      ? (record.externalFeed as Record<string, unknown>)
      : null;
  const providerLabel = typeof externalFeedRecord?.providerLabel === "string" ? externalFeedRecord.providerLabel.trim() : "";
  const feedUrl = typeof externalFeedRecord?.feedUrl === "string" ? externalFeedRecord.feedUrl.trim() : "";
  const authToken = typeof externalFeedRecord?.authToken === "string" ? externalFeedRecord.authToken.trim() : "";
  const providerType =
    typeof externalFeedRecord?.providerType === "string" &&
    (threatIntelExternalFeedTypes as readonly string[]).includes(externalFeedRecord.providerType)
      ? (externalFeedRecord.providerType as ThreatIntelExternalFeedType)
      : DEFAULT_THREAT_INTEL_CONFIG.externalFeed.providerType;
  const customIndicators = Array.isArray(record.customIndicators)
    ? record.customIndicators
        .flatMap((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return [];
          }
          const indicator = entry as Record<string, unknown>;
          const id = typeof indicator.id === "string" && indicator.id.trim() ? indicator.id.trim() : null;
          const title = typeof indicator.title === "string" && indicator.title.trim() ? indicator.title.trim() : null;
          const pattern = typeof indicator.pattern === "string" && indicator.pattern.trim() ? indicator.pattern.trim() : null;
          const category = typeof indicator.category === "string" && indicator.category.trim() ? indicator.category.trim() : "unknown";
          const severity =
            typeof indicator.severity === "string" && (threatIntelIndicatorSeverities as readonly string[]).includes(indicator.severity)
              ? (indicator.severity as ThreatIntelIndicatorSeverity)
              : "medium";
          if (!id || !title || !pattern) {
            return [];
          }
          return [{
            id,
            title,
            pattern,
            category,
            severity,
            source: "custom" as const,
            enabled: indicator.enabled !== false,
          }];
        })
        .slice(0, 20)
    : [];

  return {
    enabled: record.enabled === true,
    advisoryMode: record.advisoryMode !== false,
    externalFeed: externalFeedRecord
      ? {
          enabled: externalFeedRecord.enabled === true,
          providerType,
          providerLabel: providerLabel || null,
          feedUrl: feedUrl || null,
          authToken: authToken || null,
        }
      : DEFAULT_THREAT_INTEL_CONFIG.externalFeed,
    customIndicators,
  };
}
