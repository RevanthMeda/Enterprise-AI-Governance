export type OrganizationSettings = Record<string, unknown>;

export type OrganizationSettingsMutator = (
  currentSettings: Readonly<OrganizationSettings>,
) => OrganizationSettings;

export function normalizeOrganizationSettings(rawSettings: unknown): OrganizationSettings {
  return rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
    ? { ...(rawSettings as OrganizationSettings) }
    : {};
}

export function applyOrganizationSettingsMutation(
  rawSettings: unknown,
  mutate: OrganizationSettingsMutator,
): OrganizationSettings {
  const currentSettings = normalizeOrganizationSettings(rawSettings);
  const mutatedSettings = mutate(currentSettings);

  if (!mutatedSettings || typeof mutatedSettings !== "object" || Array.isArray(mutatedSettings)) {
    throw new TypeError("Organization settings mutator must return an object");
  }

  return {
    ...currentSettings,
    ...mutatedSettings,
  };
}
