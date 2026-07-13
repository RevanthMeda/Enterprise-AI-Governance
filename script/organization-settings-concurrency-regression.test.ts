import test from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import { updateOrganizationSettingsForTenant } from "../server/services/organizationSettingsService";
import { organizations } from "../shared/schema";

test("simultaneous updates to different organization settings sections both survive", async () => {
  const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  let organizationId: string | undefined;

  try {
    const [organization] = await db
      .insert(organizations)
      .values({
        slug: `settings-concurrency-${suffix}`,
        name: `Settings Concurrency ${suffix}`,
        status: "active",
        plan: "starter",
        settings: {
          baseline: { retained: true },
        },
      })
      .returning();
    organizationId = organization.id;

    const observations: Array<Record<string, unknown>> = [];
    await Promise.all([
      updateOrganizationSettingsForTenant(organization.id, (currentSettings) => {
        observations.push({ ...currentSettings });
        return {
          analyticsReportBuilder: { defaultPlanId: "monthly" },
        };
      }),
      updateOrganizationSettingsForTenant(organization.id, (currentSettings) => {
        observations.push({ ...currentSettings });
        return {
          regionalGovernanceProfile: { legalProfile: "uk" },
        };
      }),
    ]);

    const [updated] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, organization.id));
    assert.deepEqual(updated.settings, {
      baseline: { retained: true },
      analyticsReportBuilder: { defaultPlanId: "monthly" },
      regionalGovernanceProfile: { legalProfile: "uk" },
    });
    assert.equal(observations.length, 2);
    assert.equal(
      observations.filter(
        (settings) =>
          "analyticsReportBuilder" in settings || "regionalGovernanceProfile" in settings,
      ).length,
      1,
      "exactly the second locked mutator should observe the first committed section",
    );
  } finally {
    if (organizationId) {
      await db.delete(organizations).where(eq(organizations.id, organizationId));
    }
  }
});
