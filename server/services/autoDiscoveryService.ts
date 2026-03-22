import type { InsertAiSystem } from "@shared/schema";
import { getDefaultLawPackIdsForProfile, normalizeLegalProfile } from "@shared/law-packs";
import { inferCapabilityProfile, inferStrictnessMode } from "@shared/governance-policy-registry";

type AutoDiscoveryManifest = {
  systemName: string;
  owner: string;
  department?: string | null;
  purpose: string;
  vendor?: string | null;
  provider?: string | null;
  modelName?: string | null;
  modelType?: string | null;
  gateway?: string | null;
  deploymentContext?: string | null;
  intendedUse: string;
  domain: string;
  personalData: string;
  usersImpacted: string;
  decisionImpact: string;
  humanOversight: string;
  geography: string;
  biometricUse: string;
  vulnerableGroups: string;
  customerFacing?: boolean;
  telemetrySignals?: {
    productionTraffic?: boolean;
    piiExposureObserved?: boolean;
    safetyAlertsObserved?: boolean;
    biasAlertsObserved?: boolean;
  };
};

function getObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function includesAny(haystack: string, terms: string[]) {
  return terms.some((term) => haystack.includes(term));
}

function mapSensitivityToPersonalData(sensitivity?: string | null) {
  if (sensitivity === "restricted") return "special_category";
  if (sensitivity === "confidential") return "sensitive";
  if (sensitivity === "internal") return "basic";
  return "none";
}

function mapImpactedUsersToBucket(usersImpacted?: number | null) {
  if ((usersImpacted ?? 0) >= 100000) return "over_100k";
  if ((usersImpacted ?? 0) >= 10000) return "10k_100k";
  if ((usersImpacted ?? 0) >= 1000) return "1k_10k";
  return "under_1k";
}

function mapGeographyToKey(geography?: string | null) {
  const normalized = (geography ?? "").toLowerCase();
  if (normalized.includes("global")) return "global";
  if (normalized.includes("eu")) return "eu";
  if (normalized.includes("us")) return "us";
  return "other";
}

function inferDomain(system: {
  department?: string | null;
  purpose?: string | null;
  description?: string | null;
}) {
  const corpus = [system.department, system.purpose, system.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (includesAny(corpus, ["patient", "clinical", "diagnostic", "radiology", "hospital", "health"])) return "healthcare";
  if (includesAny(corpus, ["credit", "loan", "underwriting", "claims", "insurance", "bank", "finance"])) return "finance";
  if (includesAny(corpus, ["candidate", "recruit", "hiring", "screening", "talent"])) return "employment";
  if (includesAny(corpus, ["student", "school", "scholarship", "education", "counselor"])) return "education";
  if (includesAny(corpus, ["grid", "dispatch", "infrastructure", "utility", "outage", "wildfire"])) return "critical_infrastructure";
  if (includesAny(corpus, ["police", "law enforcement", "forensic"])) return "law_enforcement";
  return "general";
}

function inferDecisionImpact(system: {
  purpose?: string | null;
  description?: string | null;
  riskLevel?: string | null;
}) {
  const corpus = [system.purpose, system.description].filter(Boolean).join(" ").toLowerCase();
  if (
    includesAny(corpus, ["credit", "loan", "hiring", "candidate", "medical", "diagnostic", "safety", "insurance", "scholarship"])
  ) {
    return "legal_significant";
  }
  if (system.riskLevel === "high" || system.riskLevel === "critical" || system.riskLevel === "unacceptable") {
    return "material";
  }
  return "minor";
}

function inferHumanOversight(metadata: Record<string, unknown>) {
  const overrideRate = typeof metadata.overrideRate === "number" ? metadata.overrideRate : null;
  if (overrideRate !== null && overrideRate >= 40) return "in_loop";
  if (overrideRate !== null && overrideRate > 0) return "post_hoc";
  return "in_loop";
}

function inferBooleanFlag(
  corpus: string,
  metadata: Record<string, unknown>,
  key: string,
  keywords: string[],
) {
  if (typeof metadata[key] === "boolean") {
    return metadata[key] ? "yes" : "no";
  }
  return includesAny(corpus, keywords) ? "yes" : "no";
}

export const autoDiscoveryService = {
  deriveAnswers(manifest: AutoDiscoveryManifest) {
    let personalData = manifest.personalData;
    if (manifest.telemetrySignals?.piiExposureObserved) {
      personalData = personalData === "none" ? "basic" : personalData === "basic" ? "sensitive" : personalData;
    }

    let humanOversight = manifest.humanOversight;
    if (manifest.customerFacing && humanOversight === "full_control") {
      humanOversight = "in_loop";
    }

    let intendedUse = manifest.intendedUse;
    if (manifest.customerFacing && intendedUse === "automation") {
      intendedUse = "decision_support";
    }

    return {
      intendedUse,
      domain: manifest.domain,
      personalData,
      usersImpacted: manifest.usersImpacted,
      decisionImpact: manifest.decisionImpact,
      humanOversight,
      geography: manifest.geography,
      biometricUse: manifest.biometricUse,
      vulnerableGroups: manifest.vulnerableGroups,
      purpose: manifest.purpose,
    };
  },

  mapPersonalDataToSensitivity(personalData: string) {
    if (personalData === "special_category") return "restricted";
    if (personalData === "sensitive") return "confidential";
    if (personalData === "basic") return "internal";
    return "public";
  },

  mapUsersImpacted(usersImpacted: string) {
    if (usersImpacted === "over_100k") return 100000;
    if (usersImpacted === "10k_100k") return 25000;
    if (usersImpacted === "1k_10k") return 5000;
    return 500;
  },

  mapGeographyLabel(geography: string) {
    if (geography === "eu") return "EU";
    if (geography === "us") return "US";
    if (geography === "global") return "Global";
    return "Other";
  },

  inferLawPackIds(manifest: AutoDiscoveryManifest) {
    const profile = normalizeLegalProfile(manifest.geography);
    return getDefaultLawPackIdsForProfile(profile, {
      financeDomain: manifest.domain === "finance",
    });
  },

  buildAutoRegisteredSystemInput(manifest: AutoDiscoveryManifest, riskLevel: string): InsertAiSystem {
    const capabilityProfile = inferCapabilityProfile({
      department: manifest.department,
      purpose: manifest.purpose,
      description: manifest.purpose,
    });
    return {
      name: manifest.systemName,
      description: `Auto-discovered via SDK/application manifest. ${manifest.purpose}`,
      owner: manifest.owner,
      department: manifest.department || "AI Operations",
      vendor: manifest.vendor || manifest.provider || "Unknown",
      modelType: manifest.modelType || [manifest.provider, manifest.modelName].filter(Boolean).join(" / ") || "Unknown",
      riskLevel,
      status: "under_review",
      deploymentContext: manifest.deploymentContext || "SDK Connected Application",
      dataSensitivity: this.mapPersonalDataToSensitivity(manifest.personalData),
      geography: this.mapGeographyLabel(manifest.geography),
      legalProfile: normalizeLegalProfile(manifest.geography),
      lawPackIds: this.inferLawPackIds(manifest),
      capabilityProfile,
      allowedCapabilities: [],
      strictness: inferStrictnessMode({
        riskLevel,
        capabilityProfile,
        department: manifest.department,
        purpose: manifest.purpose,
        description: manifest.purpose,
      }),
      sourceCatalog: [],
      authoritativeFactCatalog: [],
      purpose: manifest.purpose,
      usersImpacted: this.mapUsersImpacted(manifest.usersImpacted),
    };
  },

  buildAutoReassessedSystemInput(manifest: AutoDiscoveryManifest, riskLevel: string): Partial<InsertAiSystem> {
    const capabilityProfile = inferCapabilityProfile({
      department: manifest.department,
      purpose: manifest.purpose,
      description: manifest.purpose,
    });
    return {
      department: manifest.department || undefined,
      vendor: manifest.vendor || manifest.provider || undefined,
      modelType: manifest.modelType || [manifest.provider, manifest.modelName].filter(Boolean).join(" / ") || undefined,
      riskLevel,
      status: "under_review",
      deploymentContext: manifest.deploymentContext || undefined,
      dataSensitivity: this.mapPersonalDataToSensitivity(manifest.personalData),
      geography: this.mapGeographyLabel(manifest.geography),
      legalProfile: normalizeLegalProfile(manifest.geography),
      lawPackIds: this.inferLawPackIds(manifest),
      capabilityProfile,
      strictness: inferStrictnessMode({
        riskLevel,
        capabilityProfile,
        department: manifest.department,
        purpose: manifest.purpose,
        description: manifest.purpose,
      }),
      purpose: manifest.purpose,
      usersImpacted: this.mapUsersImpacted(manifest.usersImpacted),
    };
  },

  computeRiskClassification(answers: any): {
    riskLevel: string;
    score: number;
    explanation: string;
    suggestedControls: string[];
  } {
    let score = 0;
    const factors: string[] = [];
    const suggestedControls: string[] = [];

    if (answers.intendedUse === "autonomous_decisions") {
      score += 30;
      factors.push("System makes autonomous decisions affecting individuals");
    } else if (answers.intendedUse === "decision_support") {
      score += 15;
      factors.push("System supports human decision-making");
    } else if (answers.intendedUse === "automation") {
      score += 10;
      factors.push("System automates routine tasks");
    }

    if (answers.domain === "healthcare" || answers.domain === "law_enforcement") {
      score += 25;
      factors.push(`Deployed in high-stakes domain: ${answers.domain}`);
    } else if (answers.domain === "finance" || answers.domain === "employment" || answers.domain === "education") {
      score += 20;
      factors.push(`Deployed in regulated domain: ${answers.domain}`);
    } else if (answers.domain === "critical_infrastructure") {
      score += 25;
      factors.push("Used in critical infrastructure");
    } else if (answers.domain === "general") {
      score += 5;
      factors.push("General-purpose application domain");
    }

    if (answers.personalData === "special_category") {
      score += 20;
      factors.push("Processes special category personal data (biometric, health, etc.)");
    } else if (answers.personalData === "sensitive") {
      score += 15;
      factors.push("Processes sensitive personal data");
    } else if (answers.personalData === "basic") {
      score += 8;
      factors.push("Processes basic personal data");
    }

    if (answers.usersImpacted === "over_100k") {
      score += 15;
      factors.push("Impacts over 100,000 users");
    } else if (answers.usersImpacted === "10k_100k") {
      score += 10;
      factors.push("Impacts 10,000-100,000 users");
    } else if (answers.usersImpacted === "1k_10k") {
      score += 5;
      factors.push("Impacts 1,000-10,000 users");
    }

    if (answers.decisionImpact === "legal_significant") {
      score += 20;
      factors.push("Outputs have legal or similarly significant effects");
    } else if (answers.decisionImpact === "material") {
      score += 10;
      factors.push("Outputs have material business or customer impact");
    } else if (answers.decisionImpact === "minor") {
      score += 4;
      factors.push("Outputs have limited downstream impact");
    }

    if (answers.humanOversight === "none") {
      score += 15;
      factors.push("No human oversight in operational flow");
    } else if (answers.humanOversight === "post_hoc") {
      score += 10;
      factors.push("Oversight is only post-hoc");
    } else if (answers.humanOversight === "in_loop") {
      score += 5;
      factors.push("Human remains in the loop");
    }

    if (answers.geography === "eu" || answers.geography === "global") {
      score += 5;
      factors.push("Subject to broader regional or cross-border governance obligations");
    }

    if (answers.biometricUse === "yes") {
      score += 20;
      factors.push("Uses biometric or identity-sensitive signals");
    }

    if (answers.vulnerableGroups === "yes") {
      score += 15;
      factors.push("Affects vulnerable populations");
    }

    if (score >= 80) {
      suggestedControls.push(
        "Formal governance committee approval",
        "Human-in-the-loop review controls",
        "Continuous telemetry and incident monitoring",
        "Decision trace logging with outcome follow-up",
      );
      return {
        riskLevel: "high",
        score,
        explanation: factors.join(". "),
        suggestedControls,
      };
    }

    if (score >= 45) {
      suggestedControls.push(
        "Risk owner review",
        "Documented human oversight procedure",
        "Quarterly reassessment cadence",
      );
      return {
        riskLevel: "medium",
        score,
        explanation: factors.join(". "),
        suggestedControls,
      };
    }

    suggestedControls.push(
      "Standard operational logging",
      "Baseline control mapping",
      "Annual reassessment",
    );
    return {
      riskLevel: "low",
      score,
      explanation: factors.join(". "),
      suggestedControls,
    };
  },

  buildManifestFromSystemAndTelemetry(
    system: {
      name: string;
      owner: string;
      department?: string | null;
      purpose?: string | null;
      description?: string | null;
      vendor?: string | null;
      modelType?: string | null;
      deploymentContext?: string | null;
      dataSensitivity?: string | null;
      geography?: string | null;
      usersImpacted?: number | null;
      riskLevel?: string | null;
    },
    telemetry: {
      provider?: string | null;
      modelName?: string | null;
      gateway?: string | null;
      eventType: string;
      summary: string;
      severity: string;
      driftScore?: number | null;
      biasFlags?: string[] | null;
      safetySignals?: string[] | null;
      piiFlags?: string[] | null;
      metadata?: unknown;
    },
  ): AutoDiscoveryManifest {
    const metadata = getObject(telemetry.metadata);
    const contextCorpus = [
      system.name,
      system.department,
      system.purpose,
      system.description,
      telemetry.summary,
      telemetry.eventType,
      ...getStringArray(metadata.channels),
      ...getStringArray(metadata.tags),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return {
      systemName: system.name,
      owner: system.owner,
      department: system.department,
      purpose: system.purpose || system.description || telemetry.summary || "Runtime-connected AI application",
      vendor: system.vendor || telemetry.provider || undefined,
      provider: telemetry.provider || undefined,
      modelName: telemetry.modelName || undefined,
      modelType: system.modelType || undefined,
      gateway: telemetry.gateway || undefined,
      deploymentContext: system.deploymentContext || "Runtime Connected Application",
      intendedUse: includesAny(contextCorpus, ["automated", "autonomous", "auto-approve"]) ? "autonomous_decisions" : "decision_support",
      domain: inferDomain(system),
      personalData: mapSensitivityToPersonalData(system.dataSensitivity),
      usersImpacted: mapImpactedUsersToBucket(system.usersImpacted),
      decisionImpact: inferDecisionImpact(system),
      humanOversight: inferHumanOversight(metadata),
      geography: mapGeographyToKey(system.geography),
      biometricUse: inferBooleanFlag(contextCorpus, metadata, "biometricUse", ["biometric", "face", "voice", "identity"]),
      vulnerableGroups: inferBooleanFlag(contextCorpus, metadata, "vulnerableGroups", ["student", "child", "patient"]),
      customerFacing: includesAny(contextCorpus, ["customer", "consumer", "member", "patient", "candidate", "student", "support", "chat"]),
      telemetrySignals: {
        productionTraffic: true,
        piiExposureObserved: getStringArray(telemetry.piiFlags).length > 0,
        safetyAlertsObserved: getStringArray(telemetry.safetySignals).length > 0 || telemetry.severity === "critical",
        biasAlertsObserved: getStringArray(telemetry.biasFlags).length > 0 || (telemetry.driftScore ?? 0) >= 5,
      },
    };
  },
};
