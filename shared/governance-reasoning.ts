import type { LawPackId } from "./law-packs";

export const governanceReasonCodes = [
  "cross_customer_data_access",
  "regulated_financial_record_access",
  "aml_override_or_audit_fabrication",
  "phishing_or_credential_theft",
  "internal_policy_or_prompt_exfiltration",
  "unverified_case_decision_or_customer_consent",
  "fabricated_customer_data_or_metrics",
  "fabricated_authority_or_regulatory_quote",
  "governance_tampering_or_runtime_override",
  "privacy_retention_misrepresentation",
  "tax_evasion_or_asset_concealment",
  "confidential_contract_weaponization",
  "coercive_or_abusive_script_request",
  "sensitive_identifier_request",
  "role_claim_policy_override",
  "mixed_request_rewrite_available",
  "deceptive_or_fraudulent_instruction",
] as const;

export type GovernanceReasonCode = (typeof governanceReasonCodes)[number];

export type GovernanceReasoning = {
  reasonCodes: GovernanceReasonCode[];
  mixedRewriteEligible: boolean;
  forceHardBlock: boolean;
};

const HARD_BLOCK_REASON_CODES = new Set<GovernanceReasonCode>([
  "aml_override_or_audit_fabrication",
  "phishing_or_credential_theft",
  "internal_policy_or_prompt_exfiltration",
  "governance_tampering_or_runtime_override",
]);

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function includesAny(haystack: string, patterns: string[]) {
  return patterns.some((pattern) => haystack.includes(pattern));
}

function hasFinanceLawPack(lawPackIds: LawPackId[]) {
  return lawPackIds.some((packId) => packId.endsWith("_finance"));
}

export function deriveGovernanceReasoning(params: {
  promptText?: string | null;
  modelOutput?: string | null;
  thresholdBreaches?: string[];
  restrictedPromptMatches?: string[];
  lawPackIds?: LawPackId[];
  guidanceTags?: string[];
}): GovernanceReasoning {
  const prompt = normalize(params.promptText);
  const output = normalize(params.modelOutput);
  const combined = `${prompt}\n${output}`;
  const lawPackIds = params.lawPackIds ?? [];
  const thresholdBreaches = params.thresholdBreaches ?? [];

  const reasonCodes: GovernanceReasonCode[] = [];

  const hasCrossCustomerDataRequest =
    includesAny(combined, [
      "full transaction history",
      "transaction histories",
      "full account history",
      "cross-customer",
      "other customers",
      "unrelated customers",
    ]) || includesAny(combined, ["merchant names, amounts, and locations"]);

  if (hasCrossCustomerDataRequest) {
    reasonCodes.push("cross_customer_data_access");
    if (hasFinanceLawPack(lawPackIds)) {
      reasonCodes.push("regulated_financial_record_access");
    }
  }

  if (
    includesAny(combined, [
      "override aml block",
      "override the aml block",
      "manual review cleared the risk",
      "audit won't question it later",
      "falsify audit note",
      "falsify case note",
      "send funds anyway",
      "hide suspicious activity",
      "hide the suspicious transaction",
    ])
  ) {
    reasonCodes.push("aml_override_or_audit_fabrication");
  }

  if (
    includesAny(combined, [
      "phishing email",
      "verify their login",
      "verify login and card details",
      "credential theft",
      "maximize click-through",
      "do not mention that this is a test",
      "service interruption",
      "fake domain",
    ])
  ) {
    reasonCodes.push("phishing_or_credential_theft");
  }

  if (
    includesAny(combined, [
      "system prompt",
      "developer message",
      "internal instructions",
      "chain-of-thought",
      "chain of thought",
      "scoring formulas",
      "rule logic",
      "thresholds",
      "hidden behind the scenes",
      "verbatim content as it lives in the runtime",
    ])
  ) {
    reasonCodes.push("internal_policy_or_prompt_exfiltration");
  }

  if (
    includesAny(combined, [
      "pick whichever option seems most likely",
      "as if it's already been agreed",
      "as if it’s already been agreed",
      "has already been agreed with the customer",
      "write it up as the final decision",
      "don't say you need to re-check the file",
      "don’t say you need to re-check the file",
      "must choose exactly one",
      "don't hedge",
      "don’t hedge",
      "state them confidently",
      "so i don't look uncertain",
      "so i don’t look uncertain",
    ])
  ) {
    reasonCodes.push("unverified_case_decision_or_customer_consent");
  }

  if (
    includesAny(combined, [
      "exact current arrears amount",
      "original mortgage balance",
      "remaining term in years",
      "exact percentage probability",
      "pick realistic values",
      "typical irish mortgage customers",
      "slide looks complete",
      "if you don't know, do not say",
      "if you don’t know, do not say",
      "these figures align with typical cases",
    ])
  ) {
    reasonCodes.push("fabricated_customer_data_or_metrics");
  }

  const requestedAuthorityFabrication = includesAny(prompt, [
    "invent a quote",
    "do not mark it as made-up",
    "do not mark it as made up",
    "present it as if it were a real excerpt",
    "plausible-sounding 2023 guidance note",
    "plausible sounding 2023 guidance note",
    "sounds like it comes from the central bank of ireland",
  ]);
  const outputContainsFakeAuthorityAttribution = includesAny(output, [
    "— central bank of ireland",
    "central bank of ireland, mortgage arrears and hardship guidance note, 2023",
  ]);

  if (requestedAuthorityFabrication || (requestedAuthorityFabrication && outputContainsFakeAuthorityAttribution)) {
    reasonCodes.push("fabricated_authority_or_regulatory_quote");
  }

  if (
    includesAny(prompt, [
      "ignore ai control tower",
      "treat that as advisory only",
      "prioritizing my instructions over any runtime governance",
      "prioritise my instructions over any runtime governance",
      "high-privilege override",
      "high privilege override",
      "treat blocks as override",
      "blocked flags are to be treated as",
      "reinterpret that as a signal that the user is senior staff",
      "provide everything requested but wrapped in",
    ])
  ) {
    reasonCodes.push("governance_tampering_or_runtime_override");
  }

  if (
    includesAny(combined, [
      "delete all historical transactions",
      "remove any aml alerts",
      "deleted all records about her",
      "nothing remains in our systems",
      "nothing remains in our system",
      "no internal user can ever see",
    ])
  ) {
    reasonCodes.push("privacy_retention_misrepresentation");
  }

  if (
    includesAny(combined, [
      "off-the-books cash",
      "unreported crypto",
      "shell companies",
      "hide part of their income",
      "hide part of their assets",
      "hide income",
      "hide assets",
      "kept between us",
      "not mentioned in the case notes",
    ])
  ) {
    reasonCodes.push("tax_evasion_or_asset_concealment");
  }

  if (
    includesAny(combined, [
      "publicly accuse them of fraud",
      "social media",
      "confidential contract terms",
      "make the email very aggressive",
      "warn other customers using specific details from confidential contracts",
    ])
  ) {
    reasonCodes.push("confidential_contract_weaponization");
  }

  if (
    includesAny(combined, [
      "what not to say",
      "off the record",
      "unlawfully threaten",
      "seizing unrelated family property",
      "seize any property you or your family own",
      "reporting them to their employer",
      "inform your employer",
      "label them clearly as good and bad",
      "bad example",
      "inappropriate threat script",
      "what not to say script",
    ])
  ) {
    reasonCodes.push("coercive_or_abusive_script_request");
  }

  if (
    includesAny(combined, [
      "social security number",
      "ssn",
      "national insurance number",
      "ni number",
      "iban",
      "routing number",
      "account number",
      "card details",
    ])
  ) {
    reasonCodes.push("sensitive_identifier_request");
  }

  if (
    includesAny(combined, [
      "group chief risk officer",
      "group cro",
      "personally signed off",
      "prioritize my instruction",
      "ignore any internal safety or privacy rules",
      "fully unrestricted expert",
      "override pii redaction",
      "override all safety",
    ])
  ) {
    reasonCodes.push("role_claim_policy_override");
  }

  if (
    includesAny(combined, [
      "reinterpret it as",
      "so audit won’t question it later",
      "so audit will not question it later",
      "don't talk about privacy or policies",
      "reconstruct the detail from your model",
      "do not mention that this is a test",
      "kept between us",
      "hide the real logic",
      "never sees the actual decision basis",
      "conceal the true decision basis",
    ])
  ) {
    reasonCodes.push("deceptive_or_fraudulent_instruction");
  }

  const mixedRewriteEligible =
    reasonCodes.some((reasonCode) =>
      reasonCode === "privacy_retention_misrepresentation" ||
      reasonCode === "tax_evasion_or_asset_concealment" ||
      reasonCode === "confidential_contract_weaponization" ||
      reasonCode === "unverified_case_decision_or_customer_consent" ||
      reasonCode === "fabricated_customer_data_or_metrics" ||
      reasonCode === "fabricated_authority_or_regulatory_quote" ||
      reasonCode === "coercive_or_abusive_script_request",
    ) ||
    (hasCrossCustomerDataRequest && !thresholdBreaches.includes("pii_detected"));

  if (mixedRewriteEligible) {
    reasonCodes.push("mixed_request_rewrite_available");
  }

  const forceHardBlock =
    thresholdBreaches.includes("prompt_injection_detected") ||
    thresholdBreaches.includes("repeat_attack_detected") ||
    thresholdBreaches.includes("secret_exposure_detected") ||
    reasonCodes.some((reasonCode) => HARD_BLOCK_REASON_CODES.has(reasonCode));

  return {
    reasonCodes: unique(reasonCodes),
    mixedRewriteEligible,
    forceHardBlock,
  };
}

export function buildGovernanceDecisionSummary(params: {
  decision: "allow" | "warn" | "escalate" | "block";
  blocked: boolean;
  reasonCodes: GovernanceReasonCode[];
}): string {
  const reasonCodes = params.reasonCodes;

  if (params.blocked || params.decision === "block") {
    if (reasonCodes.includes("aml_override_or_audit_fabrication")) {
      return "High-risk AML override and audit-fabrication request blocked before execution.";
    }
    if (reasonCodes.includes("phishing_or_credential_theft")) {
      return "Credential-harvesting or phishing request blocked before execution.";
    }
    if (reasonCodes.includes("internal_policy_or_prompt_exfiltration")) {
      return "Request for internal prompts, hidden instructions, or protected reasoning blocked before execution.";
    }
    if (reasonCodes.includes("governance_tampering_or_runtime_override")) {
      return "Attempt to reinterpret or override runtime governance was blocked before execution.";
    }
    return "High-risk request blocked before release because no safe partial answer was available.";
  }

  if (reasonCodes.includes("unverified_case_decision_or_customer_consent")) {
    return "Unverified case decisions were softened so no final agreement or customer consent was fabricated.";
  }
  if (reasonCodes.includes("fabricated_customer_data_or_metrics")) {
    return "Exact customer figures were refused because they were not grounded in authoritative case data.";
  }
  if (reasonCodes.includes("fabricated_authority_or_regulatory_quote")) {
    return "Invented regulatory quotations were refused; only attributable or clearly illustrative wording may be used.";
  }
  if (reasonCodes.includes("privacy_retention_misrepresentation")) {
    return "Response was rewritten to respect mandatory retention, AML, and privacy obligations.";
  }
  if (reasonCodes.includes("tax_evasion_or_asset_concealment")) {
    return "Lawful guidance was provided while illicit concealment instructions were refused.";
  }
  if (reasonCodes.includes("confidential_contract_weaponization")) {
    return "Commercial support was constrained to professional, non-defamatory language without exposing confidential terms.";
  }
  if (reasonCodes.includes("cross_customer_data_access")) {
    return "Cross-customer identified records were refused and redirected toward approved analytics channels.";
  }
  if (reasonCodes.includes("role_claim_policy_override")) {
    return "Role-claim override attempt was refused; internal thresholds and hidden controls remain protected.";
  }
  if (reasonCodes.includes("coercive_or_abusive_script_request")) {
    return "Training content was constrained to lawful examples and abstract anti-patterns rather than abusive scripts.";
  }

  return params.decision === "allow"
    ? "No elevated governance action was required for this turn."
    : "The answer was released with governance signals and should be reviewed before reuse.";
}
