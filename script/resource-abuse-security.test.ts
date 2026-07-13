import test from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
process.env.SESSION_SECRET ??= "resource-abuse-test-session-secret";

const {
  assertGatewayCostEnvelope,
  KeyedConcurrencyGuard,
  ResourceGuardError,
} = await import("../server/resource-abuse");
const { assertTenantAttribution, TenantAttributionError } = await import(
  "../server/services/tenantAttribution"
);
const { assertEvidenceQuota, EvidenceQuotaError } = await import(
  "../server/services/evidenceService"
);
const { assertExportWithinBounds, canRoleExport, ExportRequestError } = await import(
  "../server/services/exportService"
);

test("gateway cost guard bounds expensive output and collection cardinality", () => {
  assert.doesNotThrow(() => assertGatewayCostEnvelope({
    model: "model-1",
    messages: [{ role: "user", content: "hello" }],
    max_tokens: 2_000,
    n: 1,
  }));

  assert.throws(
    () => assertGatewayCostEnvelope({ model: "model-1", max_tokens: 40_000 }),
    (error) => error instanceof ResourceGuardError && error.code === "GATEWAY_COST_LIMIT_EXCEEDED",
  );
  assert.throws(
    () => assertGatewayCostEnvelope({ messages: Array.from({ length: 201 }, () => ({})) }),
    (error) => error instanceof ResourceGuardError && error.status === 413,
  );
});

test("gateway concurrency leases enforce per-adapter and global limits and release once", () => {
  const guard = new KeyedConcurrencyGuard(2, 3);
  const releaseA1 = guard.tryAcquire("adapter-a");
  const releaseA2 = guard.tryAcquire("adapter-a");
  assert.ok(releaseA1);
  assert.ok(releaseA2);
  assert.equal(guard.tryAcquire("adapter-a"), null);
  const releaseB = guard.tryAcquire("adapter-b");
  assert.ok(releaseB);
  assert.equal(guard.tryAcquire("adapter-c"), null);
  releaseA1!();
  releaseA1!();
  assert.ok(guard.tryAcquire("adapter-c"));
});

test("tenant attribution rejects unknown, foreign, and mismatched links", () => {
  assert.throws(
    () => assertTenantAttribution({
      subject: "Telemetry event",
      requestedSystemId: "foreign-system",
      system: undefined,
    }),
    (error) => error instanceof TenantAttributionError && error.status === 400,
  );
  assert.throws(
    () => assertTenantAttribution({
      subject: "Incident",
      requestedWorkflowId: "foreign-workflow",
      workflow: undefined,
    }),
    TenantAttributionError,
  );
  assert.throws(
    () => assertTenantAttribution({
      subject: "Telemetry event",
      requestedWorkflowId: "workflow-a",
      workflow: { id: "workflow-a", systemId: "system-a" },
    }),
    /requires an explicit AI system/,
  );
  assert.throws(
    () => assertTenantAttribution({
      subject: "Incident",
      requestedSystemId: "system-a",
      requestedWorkflowId: "workflow-b",
      system: { id: "system-a" },
      workflow: { id: "workflow-b", systemId: "system-b" },
    }),
    /does not belong to the selected AI system/,
  );
  assert.doesNotThrow(() => assertTenantAttribution({
    subject: "Telemetry event",
    requestedSystemId: "system-a",
    requestedWorkflowId: "workflow-a",
    system: { id: "system-a" },
    workflow: { id: "workflow-a", systemId: "system-a" },
  }));
});

test("evidence quotas account for the incoming file at org and user boundaries", () => {
  const limits = {
    organizationBytes: 100,
    organizationFiles: 3,
    userRollingDayBytes: 50,
    userRollingDayFiles: 2,
  };
  assert.doesNotThrow(() => assertEvidenceQuota({
    nextFileBytes: 10,
    organizationBytesUsed: 80,
    organizationFilesUsed: 1,
    userRollingDayBytesUsed: 30,
    userRollingDayFilesUsed: 1,
    limits,
  }));
  assert.throws(
    () => assertEvidenceQuota({
      nextFileBytes: 21,
      organizationBytesUsed: 80,
      organizationFilesUsed: 1,
      userRollingDayBytesUsed: 0,
      userRollingDayFilesUsed: 0,
      limits,
    }),
    EvidenceQuotaError,
  );
});

test("export bounds and role matrix protect sensitive datasets", () => {
  assert.equal(canRoleExport("auditor", "audit_logs"), true);
  assert.equal(canRoleExport("system_owner", "audit_logs"), false);
  assert.equal(canRoleExport("reviewer", "approval_workflows"), true);
  assert.throws(
    () => assertExportWithinBounds(50_001, ""),
    (error) => error instanceof ExportRequestError && error.code === "EXPORT_RECORD_LIMIT_EXCEEDED",
  );
});
