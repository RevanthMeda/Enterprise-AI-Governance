import { createHash } from "crypto";

export type TelemetryIncidentDedupeSource = "explicit" | "correlation" | "signal";

export type TelemetryIncidentDedupeInput = {
  organizationId: string;
  systemId?: string | null;
  category: string;
  eventType: string;
  gateway?: string | null;
  correlationId?: string | null;
  explicitIncidentKey?: string | null;
  thresholdBreaches: readonly string[];
  reasonCodes: readonly string[];
};

function normalizeIdentityPart(value: string | null | undefined, fallback: string): string {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return normalized || fallback;
}

function normalizeSignalSet(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeIdentityPart(value, ""))
        .filter((value) => value.length > 0),
    ),
  ).sort();
}

export function buildTelemetryIncidentDedupeIdentity(
  input: TelemetryIncidentDedupeInput,
): { key: string; source: TelemetryIncidentDedupeSource; material: string } {
  const explicitIncidentKey = normalizeIdentityPart(input.explicitIncidentKey, "");
  const correlationId = normalizeIdentityPart(input.correlationId, "");
  const source: TelemetryIncidentDedupeSource = explicitIncidentKey
    ? "explicit"
    : correlationId
      ? "correlation"
      : "signal";
  const episodeIdentity = explicitIncidentKey
    ? explicitIncidentKey
    : correlationId
      ? correlationId
      : JSON.stringify({
          thresholdBreaches: normalizeSignalSet(input.thresholdBreaches),
          reasonCodes: normalizeSignalSet(input.reasonCodes),
        });
  const material = JSON.stringify({
    version: 1,
    organizationId: normalizeIdentityPart(input.organizationId, "missing-organization"),
    systemId: normalizeIdentityPart(input.systemId, "organization-scope"),
    category: normalizeIdentityPart(input.category, "uncategorized"),
    eventType: normalizeIdentityPart(input.eventType, "unknown-event"),
    gateway: normalizeIdentityPart(input.gateway, "any-gateway"),
    source,
    episodeIdentity,
  });
  const digest = createHash("sha256").update(material).digest("hex");

  return {
    key: `telemetry-incident:v1:${digest}`,
    source,
    material,
  };
}
