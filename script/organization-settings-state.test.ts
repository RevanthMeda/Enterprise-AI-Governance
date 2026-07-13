import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  applyOrganizationSettingsMutation,
  normalizeOrganizationSettings,
} from "../server/services/organizationSettingsState";

test("organization settings normalization accepts only object maps", () => {
  assert.deepEqual(normalizeOrganizationSettings(null), {});
  assert.deepEqual(normalizeOrganizationSettings([]), {});
  assert.deepEqual(normalizeOrganizationSettings("invalid"), {});
  assert.deepEqual(normalizeOrganizationSettings({ existing: true }), { existing: true });
});

test("independent settings mutations preserve the baseline and each other", () => {
  const original = {
    auth: { mode: "local" },
    existingFeature: { enabled: true },
  };

  const withAnalytics = applyOrganizationSettingsMutation(original, () => ({
    analyticsReportBuilder: { plans: ["monthly"] },
  }));
  const withRegionalProfile = applyOrganizationSettingsMutation(withAnalytics, () => ({
    regionalGovernanceProfile: { legalProfile: "uk" },
  }));

  assert.deepEqual(withRegionalProfile, {
    auth: { mode: "local" },
    existingFeature: { enabled: true },
    analyticsReportBuilder: { plans: ["monthly"] },
    regionalGovernanceProfile: { legalProfile: "uk" },
  });
  assert.deepEqual(original, {
    auth: { mode: "local" },
    existingFeature: { enabled: true },
  });
});

test("organization settings mutations must return an object", () => {
  assert.throws(
    () => applyOrganizationSettingsMutation({}, () => null as never),
    /must return an object/,
  );
  assert.throws(
    () => applyOrganizationSettingsMutation({}, () => [] as never),
    /must return an object/,
  );
});

test("the transactional updater locks, re-reads, mutates, then writes once", async () => {
  const source = await readFile("server/services/organizationSettingsService.ts", "utf8");
  const lockIndex = source.indexOf("pg_advisory_xact_lock");
  const selectIndex = source.indexOf(".select({");
  const mutateIndex = source.indexOf("applyOrganizationSettingsMutation(current.settings, mutate)");
  const updateIndex = source.indexOf(".update(organizations)");

  assert.ok(lockIndex >= 0, "settings updates must take a transaction-scoped advisory lock");
  assert.ok(selectIndex > lockIndex, "settings must be read after acquiring the organization lock");
  assert.ok(mutateIndex > selectIndex, "the mutator must receive the locked, freshly read settings");
  assert.ok(updateIndex > mutateIndex, "settings must be written after the pure mutation");
  assert.equal(source.match(/\.update\(organizations\)/g)?.length, 1, "the transaction must write settings once");
  assert.match(source, /where\(eq\(organizations\.id, organizationId\)\)/);
});

test("organization settings writers route through the transactional updater", async () => {
  const writerFiles = [
    "server/routes/analytics.ts",
    "server/routes/settings.ts",
    "server/services/integrationConnectorService.ts",
    "server/services/organizationSecretService.ts",
    "server/services/regionalGovernanceProfileService.ts",
    "server/services/threatIntelligenceService.ts",
  ];

  for (const file of writerFiles) {
    const source = await readFile(file, "utf8");
    assert.match(
      source,
      /updateOrganizationSettingsForTenant/,
      `${file} must use the serialized organization settings updater`,
    );
    assert.doesNotMatch(
      source,
      /\.update\(organizations\)/,
      `${file} must not write the settings document directly`,
    );
  }
});
