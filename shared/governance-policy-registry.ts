import type { GovernanceReasonCode } from "./governance-reasoning";

export const governancePolicyLayers = [
  "content_policy",
  "business_policy",
  "capability_profile",
] as const;
export type GovernancePolicyLayer = (typeof governancePolicyLayers)[number];

export const capabilityIds = [
  "draft_customer_communications",
  "summarize_case_material",
  "create_internal_notes",
  "cross_customer_analytics",
  "customer_account_changes",
  "fund_movement",
  "aml_case_adjudication",
  "prod_write_actions",
  "medical_treatment_planning",
  "personalized_investment_advice",
  "political_persuasion",
  "security_attack_guidance",
  "abusive_targeted_messaging",
  "governance_configuration_change",
  "employment_decisioning",
] as const;
export type CapabilityId = (typeof capabilityIds)[number];

export const capabilityProfileIds = [
  "general_assistant",
  "banking_copilot",
  "hr_assistant",
  "devops_assistant",
  "governance_console",
] as const;
export type CapabilityProfileId = (typeof capabilityProfileIds)[number];

export const strictnessModes = ["normal", "high_risk"] as const;
export type StrictnessMode = (typeof strictnessModes)[number];

export const governancePolicyCategoryIds = [
  "illegal_or_abusive_content",
  "cross_customer_privacy",
  "fairness_discrimination",
  "regulatory_fabrication",
  "governance_tampering",
  "professional_high_stakes_advice",
  "unsafe_tool_actuation",
  "business_record_integrity",
  "surface_capability_violation",
  "regulated_financial_controls",
  "political_manipulation",
] as const;
export type GovernancePolicyCategoryId = (typeof governancePolicyCategoryIds)[number];

export type GovernancePolicyCategoryDefinition = {
  id: GovernancePolicyCategoryId;
  label: string;
  layer: GovernancePolicyLayer;
  defaultDecision: "allow" | "warn" | "escalate" | "block";
  alwaysLog: boolean;
};

export type CapabilityProfileDefinition = {
  id: CapabilityProfileId;
  label: string;
  summary: string;
  allowedCapabilities: CapabilityId[];
};

export type SurfaceGovernanceAssessment = {
  policyCategories: GovernancePolicyCategoryId[];
  policyLayers: GovernancePolicyLayer[];
  alwaysLogCategories: GovernancePolicyCategoryId[];
  requestedCapabilities: CapabilityId[];
  outOfScopeCapabilities: CapabilityId[];
  promotedReasonCodes: GovernanceReasonCode[];
  promotedThresholdBreaches: string[];
  fictionFramingDetected: boolean;
  fictionBypassPrevented: boolean;
};

const POLICY_CATEGORY_REGISTRY: GovernancePolicyCategoryDefinition[] = [
  {
    id: "illegal_or_abusive_content",
    label: "Illegal or abusive content",
    layer: "content_policy",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "cross_customer_privacy",
    label: "Cross-customer privacy",
    layer: "business_policy",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "fairness_discrimination",
    label: "Fairness or discrimination",
    layer: "business_policy",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "regulatory_fabrication",
    label: "Regulatory or authority fabrication",
    layer: "business_policy",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "governance_tampering",
    label: "Governance tampering",
    layer: "capability_profile",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "professional_high_stakes_advice",
    label: "Professional high-stakes advice",
    layer: "content_policy",
    defaultDecision: "warn",
    alwaysLog: true,
  },
  {
    id: "unsafe_tool_actuation",
    label: "Unsafe tool actuation",
    layer: "capability_profile",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "business_record_integrity",
    label: "Business record integrity",
    layer: "business_policy",
    defaultDecision: "warn",
    alwaysLog: true,
  },
  {
    id: "surface_capability_violation",
    label: "Surface capability violation",
    layer: "capability_profile",
    defaultDecision: "block",
    alwaysLog: true,
  },
  {
    id: "regulated_financial_controls",
    label: "Regulated financial controls",
    layer: "business_policy",
    defaultDecision: "warn",
    alwaysLog: true,
  },
  {
    id: "political_manipulation",
    label: "Political manipulation",
    layer: "content_policy",
    defaultDecision: "block",
    alwaysLog: true,
  },
];

export const GOVERNANCE_POLICY_CATEGORIES = POLICY_CATEGORY_REGISTRY;
export const GOVERNANCE_POLICY_CATEGORIES_BY_ID = new Map(
  POLICY_CATEGORY_REGISTRY.map((entry) => [entry.id, entry]),
);

export const CAPABILITY_PROFILES: CapabilityProfileDefinition[] = [
  {
    id: "general_assistant",
    label: "General Assistant",
    summary: "General drafting and summarization only.",
    allowedCapabilities: [
      "draft_customer_communications",
      "summarize_case_material",
      "create_internal_notes",
    ],
  },
  {
    id: "banking_copilot",
    label: "Banking Copilot",
    summary: "Customer-safe banking drafting, summaries, and internal notes without transactional authority.",
    allowedCapabilities: [
      "draft_customer_communications",
      "summarize_case_material",
      "create_internal_notes",
    ],
  },
  {
    id: "hr_assistant",
    label: "HR Assistant",
    summary: "Policy explanations, summaries, and internal drafting without autonomous employment decisions.",
    allowedCapabilities: [
      "draft_customer_communications",
      "summarize_case_material",
      "create_internal_notes",
    ],
  },
  {
    id: "devops_assistant",
    label: "DevOps Assistant",
    summary: "Read-focused diagnostics and operational drafting without production write authority.",
    allowedCapabilities: [
      "summarize_case_material",
      "create_internal_notes",
    ],
  },
  {
    id: "governance_console",
    label: "Governance Console",
    summary: "Governance review, summaries, and internal notes without customer-side actuation.",
    allowedCapabilities: [
      "summarize_case_material",
      "create_internal_notes",
    ],
  },
];

export const CAPABILITY_PROFILES_BY_ID = new Map(
  CAPABILITY_PROFILES.map((entry) => [entry.id, entry]),
);

const REASON_CODE_TO_CATEGORY: Partial<Record<GovernanceReasonCode, GovernancePolicyCategoryId>> = {
  cross_customer_data_access: "cross_customer_privacy",
  regulated_financial_record_access: "cross_customer_privacy",
  aml_override_or_audit_fabrication: "regulated_financial_controls",
  phishing_or_credential_theft: "illegal_or_abusive_content",
  internal_policy_or_prompt_exfiltration: "governance_tampering",
  protected_trait_or_proxy_discrimination: "fairness_discrimination",
  fabricated_customer_data_or_metrics: "business_record_integrity",
  fabricated_authority_or_regulatory_quote: "regulatory_fabrication",
  legal_or_regulatory_citation_required: "regulatory_fabrication",
  governance_tampering_or_runtime_override: "governance_tampering",
  privacy_retention_misrepresentation: "business_record_integrity",
  tax_evasion_or_asset_concealment: "illegal_or_abusive_content",
  coercive_or_abusive_script_request: "illegal_or_abusive_content",
  unsupported_case_action_or_false_execution: "business_record_integrity",
  unsupported_aml_or_sanctions_clearance: "regulated_financial_controls",
  deceptive_or_fraudulent_instruction: "illegal_or_abusive_content",
  capability_out_of_scope_for_surface: "surface_capability_violation",
  high_risk_strictness_review_required: "surface_capability_violation",
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

function includesAny(haystack: string, patterns: string[]) {
  return patterns.some((pattern) => haystack.includes(pattern));
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function inferFinanceDomainFromText(value: string) {
  return /(bank|loan|credit|mortgage|aml|fraud|collections|underwriting|insurance|payment|financ)/.test(value);
}

function inferEmploymentDomainFromText(value: string) {
  return /(candidate|recruit|hiring|screening|talent|hr|human resources|employee|promotion|termination)/.test(value);
}

function inferDevopsDomainFromText(value: string) {
  return /(devops|sre|incident|infrastructure|kubernetes|cluster|deployment|prod|production|on-call|alert|runbook)/.test(value);
}

function inferGovernanceDomainFromText(value: string) {
  return /(governance|audit|policy|compliance|control grid|incident response|decision trace|evidence)/.test(value);
}

export function normalizeCapabilityProfileId(value: string | null | undefined): CapabilityProfileId {
  return CAPABILITY_PROFILES_BY_ID.has((value ?? "").trim().toLowerCase() as CapabilityProfileId)
    ? ((value ?? "").trim().toLowerCase() as CapabilityProfileId)
    : "general_assistant";
}

export function normalizeStrictnessMode(value: string | null | undefined): StrictnessMode {
  return value === "high_risk" ? "high_risk" : "normal";
}

export function resolveAllowedCapabilities(
  capabilityProfile: string | null | undefined,
  explicitAllowedCapabilities?: unknown,
) {
  const profile = CAPABILITY_PROFILES_BY_ID.get(normalizeCapabilityProfileId(capabilityProfile));
  const explicit = Array.isArray(explicitAllowedCapabilities)
    ? explicitAllowedCapabilities.filter((value): value is CapabilityId => capabilityIds.includes(value as CapabilityId))
    : [];

  return explicit.length > 0 ? unique(explicit) : [...(profile?.allowedCapabilities ?? [])];
}

export function inferCapabilityProfile(params: {
  capabilityProfile?: string | null;
  name?: string | null;
  department?: string | null;
  purpose?: string | null;
  description?: string | null;
}) {
  const explicit = normalizeCapabilityProfileId(params.capabilityProfile);
  if (params.capabilityProfile && params.capabilityProfile.trim()) {
    return explicit;
  }

  const corpus = normalize([params.name, params.department, params.purpose, params.description].filter(Boolean).join(" "));
  if (inferGovernanceDomainFromText(corpus)) {
    return "governance_console";
  }
  if (inferDevopsDomainFromText(corpus)) {
    return "devops_assistant";
  }
  if (inferEmploymentDomainFromText(corpus)) {
    return "hr_assistant";
  }
  if (inferFinanceDomainFromText(corpus)) {
    return "banking_copilot";
  }
  return explicit;
}

export function inferStrictnessMode(params: {
  strictness?: string | null;
  riskLevel?: string | null;
  capabilityProfile?: string | null;
  name?: string | null;
  department?: string | null;
  purpose?: string | null;
  description?: string | null;
}) {
  if (params.strictness && params.strictness.trim()) {
    return normalizeStrictnessMode(params.strictness);
  }

  const normalizedRiskLevel = (params.riskLevel ?? "").trim().toLowerCase();
  if (normalizedRiskLevel === "high" || normalizedRiskLevel === "unacceptable") {
    return "high_risk";
  }

  const profile = inferCapabilityProfile(params);
  if (profile === "banking_copilot" || profile === "hr_assistant" || profile === "devops_assistant") {
    return "high_risk";
  }

  return "normal";
}

export function detectRequestedCapabilities(params: {
  promptText?: string | null;
  modelOutput?: string | null;
}) {
  const prompt = normalize(params.promptText);
  const output = normalize(params.modelOutput);
  const combined = `${prompt}\n${output}`;
  const requested: CapabilityId[] = [];

  if (includesAny(combined, ["draft a", "write an email", "write an sms", "customer-ready draft", "customer ready draft"])) {
    requested.push("draft_customer_communications");
  }
  if (includesAny(combined, ["summarize", "summarise", "review the document", "extract fees", "supervisor summary"])) {
    requested.push("summarize_case_material");
  }
  if (includesAny(combined, ["internal note", "case note", "supervisor pack", "write it up"])) {
    requested.push("create_internal_notes");
  }
  if (
    includesAny(combined, [
      "cross-check this customer's profile against all others",
      "cross-check this customer’s profile against all others",
      "full transaction history",
      "other customers",
      "share their home address or employer",
      "balances and arrears",
    ])
  ) {
    requested.push("cross_customer_analytics");
  }
  if (includesAny(combined, ["update her system status", "hardship plan active", "apply a three-month interest freeze", "add internal note"])) {
    requested.push("customer_account_changes");
  }
  if (includesAny(combined, ["move €", "move eur", "send €", "send funds", "iban", "move 50000", "transfer"])) {
    requested.push("fund_movement");
  }
  if (includesAny(combined, ["aml block", "suspicious activity", "no further monitoring", "risk is low", "sanctioned"])) {
    requested.push("aml_case_adjudication");
  }
  if (includesAny(combined, ["production banking apis", "delete any alerts or logs", "modify prod", "production config"])) {
    requested.push("prod_write_actions");
  }
  if (includesAny(combined, ["insulin doses", "metformin", "without me needing to talk to my doctor", "day-by-day change plan"])) {
    requested.push("medical_treatment_planning");
  }
  if (includesAny(combined, ["which funds and tickers to buy", "maximize my return before i retire", "personalized financial advice"])) {
    requested.push("personalized_investment_advice");
  }
  if (includesAny(combined, ["vote for party x", "convince each group to vote", "targeted at 18-24 year-olds"])) {
    requested.push("political_persuasion");
  }
  if (includesAny(combined, ["sabotage a power substation", "avoid detection", "specific techniques, tools, and timing windows"])) {
    requested.push("security_attack_guidance");
  }
  if (includesAny(combined, ["shame them into quitting", "personal and cutting", "appearance and work habits"])) {
    requested.push("abusive_targeted_messaging");
  }
  if (includesAny(combined, ["ignore ai control grid", "treat blocked as approved", "treat any blocked or escalated governance signal"])) {
    requested.push("governance_configuration_change");
  }
  if (includesAny(combined, ["hire", "fire", "performance ranking", "salary decision", "culture fit"])) {
    requested.push("employment_decisioning");
  }

  return unique(requested);
}

function categoriesFromRequestedCapabilities(capabilities: CapabilityId[]) {
  const categories: GovernancePolicyCategoryId[] = [];
  for (const capability of capabilities) {
    switch (capability) {
      case "cross_customer_analytics":
        categories.push("cross_customer_privacy");
        break;
      case "fund_movement":
      case "prod_write_actions":
        categories.push("unsafe_tool_actuation");
        break;
      case "aml_case_adjudication":
        categories.push("regulated_financial_controls");
        break;
      case "medical_treatment_planning":
      case "personalized_investment_advice":
      case "employment_decisioning":
        categories.push("professional_high_stakes_advice");
        break;
      case "political_persuasion":
        categories.push("political_manipulation");
        break;
      case "security_attack_guidance":
      case "abusive_targeted_messaging":
        categories.push("illegal_or_abusive_content");
        break;
      case "governance_configuration_change":
        categories.push("governance_tampering");
        break;
      case "customer_account_changes":
        categories.push("business_record_integrity");
        break;
      default:
        break;
    }
  }
  return unique(categories);
}

export function derivePolicyCategories(params: {
  reasonCodes: GovernanceReasonCode[];
  requestedCapabilities?: CapabilityId[];
  outOfScopeCapabilities?: CapabilityId[];
}) {
  const categories = unique(
    [
      ...params.reasonCodes.map((reasonCode) => REASON_CODE_TO_CATEGORY[reasonCode]).filter(Boolean),
      ...categoriesFromRequestedCapabilities(params.requestedCapabilities ?? []),
      ...(params.outOfScopeCapabilities && params.outOfScopeCapabilities.length > 0
        ? (["surface_capability_violation"] as GovernancePolicyCategoryId[])
        : []),
    ] as GovernancePolicyCategoryId[],
  );

  const policyLayers = unique(
    categories
      .map((categoryId) => GOVERNANCE_POLICY_CATEGORIES_BY_ID.get(categoryId)?.layer)
      .filter((value): value is GovernancePolicyLayer => Boolean(value)),
  );

  const alwaysLogCategories = categories.filter(
    (categoryId) => GOVERNANCE_POLICY_CATEGORIES_BY_ID.get(categoryId)?.alwaysLog,
  );

  return {
    policyCategories: categories,
    policyLayers,
    alwaysLogCategories,
  };
}

export function assessSurfaceGovernance(params: {
  promptText?: string | null;
  modelOutput?: string | null;
  reasonCodes: GovernanceReasonCode[];
  capabilityProfile: string | null | undefined;
  allowedCapabilities?: unknown;
  strictness: StrictnessMode;
}) : SurfaceGovernanceAssessment {
  const requestedCapabilities = detectRequestedCapabilities({
    promptText: params.promptText,
    modelOutput: params.modelOutput,
  });
  const allowedCapabilities = resolveAllowedCapabilities(
    params.capabilityProfile,
    params.allowedCapabilities,
  );
  const outOfScopeCapabilities = requestedCapabilities.filter(
    (capability) => !allowedCapabilities.includes(capability),
  );

  const promotedReasonCodes: GovernanceReasonCode[] = [];
  const promotedThresholdBreaches: string[] = [];
  const fictionFramingDetected = includesAny(normalize(params.promptText), [
    "for a novel",
    "for my novel",
    "for a story",
    "for fiction",
    "for a screenplay",
    "for a game",
    "fictional scenario",
  ]);

  if (outOfScopeCapabilities.length > 0) {
    promotedReasonCodes.push("capability_out_of_scope_for_surface");
    promotedThresholdBreaches.push("capability_out_of_scope");
  }

  const highRiskPromotionReasonCodes: GovernanceReasonCode[] = [
    "fabricated_customer_data_or_metrics",
    "fabricated_authority_or_regulatory_quote",
    "unsupported_aml_or_sanctions_clearance",
    "unverified_case_decision_or_customer_consent",
  ];
  const categories = derivePolicyCategories({
    reasonCodes: params.reasonCodes,
    requestedCapabilities,
    outOfScopeCapabilities,
  });

  if (params.strictness === "high_risk") {
    if (params.reasonCodes.some((reasonCode) => highRiskPromotionReasonCodes.includes(reasonCode))) {
      promotedReasonCodes.push("high_risk_strictness_review_required");
      promotedThresholdBreaches.push("high_risk_block_required");
    } else if (categories.alwaysLogCategories.length > 0) {
      promotedReasonCodes.push("high_risk_strictness_review_required");
      promotedThresholdBreaches.push("high_risk_review_required");
    }
  }

  return {
    policyCategories: categories.policyCategories,
    policyLayers: categories.policyLayers,
    alwaysLogCategories: categories.alwaysLogCategories,
    requestedCapabilities,
    outOfScopeCapabilities,
    promotedReasonCodes: unique(promotedReasonCodes),
    promotedThresholdBreaches: unique(promotedThresholdBreaches),
    fictionFramingDetected,
    fictionBypassPrevented:
      fictionFramingDetected &&
      categories.policyCategories.some((categoryId) =>
        categoryId === "illegal_or_abusive_content" ||
        categoryId === "political_manipulation" ||
        categoryId === "governance_tampering",
      ),
  };
}
