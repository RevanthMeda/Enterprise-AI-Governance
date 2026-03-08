import { resolveApiUrl } from "@/lib/api-url";

type NullableString = string | null;

export type MarketingEventPayload = {
  section?: NullableString;
  cta?: NullableString;
  source?: NullableString;
  campaign?: NullableString;
  pagePath?: NullableString;
  referrer?: NullableString;
  metadata?: Record<string, unknown>;
};

function normalizeNullable(input?: string | null): NullableString {
  const value = (input ?? "").trim();
  return value.length > 0 ? value : null;
}

export function readAttribution(search: string = window.location.search): {
  source: string;
  campaign: string | null;
  cta: string | null;
} {
  const params = new URLSearchParams(search);
  const source =
    normalizeNullable(params.get("source")) ??
    normalizeNullable(params.get("utm_source")) ??
    "direct";
  const campaign =
    normalizeNullable(params.get("campaign")) ??
    normalizeNullable(params.get("utm_campaign"));
  const cta =
    normalizeNullable(params.get("cta")) ??
    normalizeNullable(params.get("ctaSource"));
  return { source, campaign, cta };
}

export function buildTrackedPath(path: string, extra?: Record<string, string | undefined | null>): string {
  const params = new URLSearchParams();
  const attribution = readAttribution();
  params.set("source", attribution.source);
  if (attribution.campaign) {
    params.set("campaign", attribution.campaign);
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value && value.trim().length > 0) {
        params.set(key, value);
      }
    }
  }
  const query = params.toString();
  return query.length > 0 ? `${path}?${query}` : path;
}

export async function trackMarketingEvent(
  eventName: string,
  payload: MarketingEventPayload = {},
): Promise<void> {
  const attribution = readAttribution();
  const body = {
    eventName,
    pagePath: payload.pagePath ?? window.location.pathname,
    section: normalizeNullable(payload.section),
    cta: normalizeNullable(payload.cta),
    source: normalizeNullable(payload.source) ?? attribution.source,
    campaign: normalizeNullable(payload.campaign) ?? attribution.campaign,
    referrer: normalizeNullable(payload.referrer) ?? normalizeNullable(document.referrer),
    metadata: payload.metadata ?? {},
  };

  const json = JSON.stringify(body);

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([json], { type: "application/json" });
      navigator.sendBeacon(resolveApiUrl("/api/track"), blob);
      return;
    }
  } catch {
    // no-op fallback to fetch
  }

  try {
    await fetch(resolveApiUrl("/api/track"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: json,
      keepalive: true,
      credentials: "include",
    });
  } catch {
    // no-op
  }
}
