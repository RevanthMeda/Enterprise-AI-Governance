import { eq, sql } from "drizzle-orm";
import { organizations } from "@shared/schema";
import { db } from "../db";
import {
  applyOrganizationSettingsMutation,
  normalizeOrganizationSettings,
  type OrganizationSettings,
  type OrganizationSettingsMutator,
} from "./organizationSettingsState";

export type OrganizationSettingsUpdateResult = {
  organizationId: string;
  settings: OrganizationSettings;
};

export async function updateOrganizationSettingsForTenant(
  organizationId: string,
  mutate: OrganizationSettingsMutator,
): Promise<OrganizationSettingsUpdateResult | null> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`organization-settings:${organizationId}`}, 0))`,
    );

    const [current] = await tx
      .select({
        organizationId: organizations.id,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    if (!current) {
      return null;
    }

    const nextSettings = applyOrganizationSettingsMutation(current.settings, mutate);
    const [updated] = await tx
      .update(organizations)
      .set({
        settings: nextSettings,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId))
      .returning({
        organizationId: organizations.id,
        settings: organizations.settings,
      });

    return updated
      ? {
          organizationId: updated.organizationId,
          settings: normalizeOrganizationSettings(updated.settings),
        }
      : null;
  });
}
