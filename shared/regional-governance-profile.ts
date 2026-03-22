export const regionalPrimaryRegions = ["eu", "uk", "us", "apac", "middle_east", "global"] as const;
export type RegionalPrimaryRegion = (typeof regionalPrimaryRegions)[number];

export const regionalDataResidencyModes = [
  "single_region",
  "regional_ring",
  "multi_region",
  "customer_managed",
] as const;
export type RegionalDataResidencyMode = (typeof regionalDataResidencyModes)[number];

export const regionalComplianceFrameworkIds = [
  "eu_ai_act",
  "uk_ai_principles",
  "nist_ai_rmf",
  "iso_42001",
  "soc2",
  "hipaa",
  "pci_dss",
] as const;
export type RegionalComplianceFrameworkId = (typeof regionalComplianceFrameworkIds)[number];

export type RegionalGovernanceProfile = {
  primaryRegion: RegionalPrimaryRegion;
  secondaryRegions: RegionalPrimaryRegion[];
  dataResidencyMode: RegionalDataResidencyMode;
  activeFrameworks: RegionalComplianceFrameworkId[];
};

export const regionalPrimaryRegionLabels: Record<RegionalPrimaryRegion, string> = {
  eu: "European Union",
  uk: "United Kingdom",
  us: "United States",
  apac: "APAC",
  middle_east: "Middle East",
  global: "Global",
};

export const regionalDataResidencyModeLabels: Record<RegionalDataResidencyMode, string> = {
  single_region: "Single region",
  regional_ring: "Regional ring",
  multi_region: "Multi-region",
  customer_managed: "Customer managed",
};

export const regionalComplianceFrameworkLabels: Record<RegionalComplianceFrameworkId, string> = {
  eu_ai_act: "EU AI Act",
  uk_ai_principles: "UK AI governance principles",
  nist_ai_rmf: "NIST AI RMF",
  iso_42001: "ISO/IEC 42001",
  soc2: "SOC 2",
  hipaa: "HIPAA",
  pci_dss: "PCI-DSS",
};

export const DEFAULT_REGIONAL_GOVERNANCE_PROFILE: RegionalGovernanceProfile = {
  primaryRegion: "eu",
  secondaryRegions: ["uk", "us"],
  dataResidencyMode: "single_region",
  activeFrameworks: ["eu_ai_act", "nist_ai_rmf", "iso_42001"],
};

export function sanitizeRegionalGovernanceProfile(input: unknown): RegionalGovernanceProfile {
  const record = input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};

  const primaryRegion =
    typeof record.primaryRegion === "string" && (regionalPrimaryRegions as readonly string[]).includes(record.primaryRegion)
      ? (record.primaryRegion as RegionalPrimaryRegion)
      : DEFAULT_REGIONAL_GOVERNANCE_PROFILE.primaryRegion;

  const secondaryRegions = Array.isArray(record.secondaryRegions)
    ? Array.from(
        new Set(
          record.secondaryRegions.filter(
            (entry): entry is RegionalPrimaryRegion =>
              typeof entry === "string" &&
              (regionalPrimaryRegions as readonly string[]).includes(entry) &&
              entry !== primaryRegion,
          ),
        ),
      ).slice(0, regionalPrimaryRegions.length - 1)
    : DEFAULT_REGIONAL_GOVERNANCE_PROFILE.secondaryRegions;

  const dataResidencyMode =
    typeof record.dataResidencyMode === "string" &&
    (regionalDataResidencyModes as readonly string[]).includes(record.dataResidencyMode)
      ? (record.dataResidencyMode as RegionalDataResidencyMode)
      : DEFAULT_REGIONAL_GOVERNANCE_PROFILE.dataResidencyMode;

  const activeFrameworks = Array.isArray(record.activeFrameworks)
    ? Array.from(
        new Set(
          record.activeFrameworks.filter(
            (entry): entry is RegionalComplianceFrameworkId =>
              typeof entry === "string" && (regionalComplianceFrameworkIds as readonly string[]).includes(entry),
          ),
        ),
      ).slice(0, regionalComplianceFrameworkIds.length)
    : DEFAULT_REGIONAL_GOVERNANCE_PROFILE.activeFrameworks;

  return {
    primaryRegion,
    secondaryRegions,
    dataResidencyMode,
    activeFrameworks: activeFrameworks.length > 0 ? activeFrameworks : DEFAULT_REGIONAL_GOVERNANCE_PROFILE.activeFrameworks,
  };
}
