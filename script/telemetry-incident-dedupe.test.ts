import test from "node:test";
import assert from "node:assert/strict";
import { buildTelemetryIncidentDedupeIdentity } from "../server/services/telemetryIncidentDedupe";

const baseInput = {
  organizationId: "org-a",
  systemId: "system-a",
  category: "safety",
  eventType: "runtime.evaluation",
  gateway: "gateway-prod",
  correlationId: null,
  explicitIncidentKey: null,
  thresholdBreaches: ["safety_flags_detected", "pii_detected"],
  reasonCodes: ["runtime_safety_threshold"],
} as const;

test("equivalent telemetry signals produce one stable incident identity", () => {
  const first = buildTelemetryIncidentDedupeIdentity(baseInput);
  const second = buildTelemetryIncidentDedupeIdentity({
    ...baseInput,
    organizationId: " ORG-A ",
    eventType: " Runtime.Evaluation ",
    thresholdBreaches: [" PII_DETECTED ", "safety_flags_detected", "pii_detected"],
    reasonCodes: ["RUNTIME_SAFETY_THRESHOLD"],
  });

  assert.equal(first.key, second.key);
  assert.equal(first.source, "signal");
  assert.match(first.key, /^telemetry-incident:v1:[a-f0-9]{64}$/);
});

test("explicit and correlation identities group only the same incident episode", () => {
  const correlated = buildTelemetryIncidentDedupeIdentity({
    ...baseInput,
    correlationId: "request-123",
  });
  const correlatedWithChangedSignals = buildTelemetryIncidentDedupeIdentity({
    ...baseInput,
    correlationId: " REQUEST-123 ",
    thresholdBreaches: ["different_threshold"],
    reasonCodes: [],
  });
  const differentCorrelation = buildTelemetryIncidentDedupeIdentity({
    ...baseInput,
    correlationId: "request-456",
  });
  const explicit = buildTelemetryIncidentDedupeIdentity({
    ...baseInput,
    correlationId: "request-456",
    explicitIncidentKey: "customer-impact-7",
  });
  const sameExplicit = buildTelemetryIncidentDedupeIdentity({
    ...baseInput,
    correlationId: "unrelated-correlation",
    explicitIncidentKey: "CUSTOMER-IMPACT-7",
  });

  assert.equal(correlated.key, correlatedWithChangedSignals.key);
  assert.notEqual(correlated.key, differentCorrelation.key);
  assert.equal(explicit.key, sameExplicit.key);
  assert.equal(explicit.source, "explicit");
});

test("tenant, system, category, event, gateway, and signal changes remain distinct", () => {
  const baseKey = buildTelemetryIncidentDedupeIdentity(baseInput).key;
  const variants = [
    { ...baseInput, organizationId: "org-b" },
    { ...baseInput, systemId: "system-b" },
    { ...baseInput, category: "privacy" },
    { ...baseInput, eventType: "runtime.preflight" },
    { ...baseInput, gateway: "gateway-backup" },
    { ...baseInput, thresholdBreaches: ["safety_flags_detected"] },
  ];

  for (const variant of variants) {
    assert.notEqual(buildTelemetryIncidentDedupeIdentity(variant).key, baseKey);
  }
});
