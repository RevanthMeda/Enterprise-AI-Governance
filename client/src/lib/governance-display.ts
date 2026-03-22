import { LAW_PACKS_BY_ID, normalizeLegalProfile, type LawPackId } from "@shared/law-packs";
import type { GovernanceReasonCode } from "@shared/governance-reasoning";
import {
  CAPABILITY_PROFILES_BY_ID,
  GOVERNANCE_POLICY_CATEGORIES_BY_ID,
  normalizeCapabilityProfileId,
  normalizeStrictnessMode,
  type CapabilityId,
  type GovernancePolicyCategoryId,
} from "@shared/governance-policy-registry";

const LEGAL_PROFILE_LABELS: Record<string, string> = {
  global: "Global",
  eu: "EU",
  uk: "UK",
  us: "US",
  india: "India",
};

export function formatLegalProfileLabel(profile: string | null | undefined) {
  return LEGAL_PROFILE_LABELS[normalizeLegalProfile(profile)] ?? "Global";
}

export function formatGovernanceReasonCode(value: string | GovernanceReasonCode) {
  switch (value) {
    case "cross_customer_data_access":
      return "Cross-customer data access";
    case "regulated_financial_record_access":
      return "Regulated financial record access";
    case "aml_override_or_audit_fabrication":
      return "AML override or audit fabrication";
    case "phishing_or_credential_theft":
      return "Phishing or credential theft";
    case "internal_policy_or_prompt_exfiltration":
      return "Internal policy or prompt exfiltration";
    case "protected_trait_or_proxy_discrimination":
      return "Protected-trait or proxy discrimination";
    case "unverified_case_decision_or_customer_consent":
      return "Unverified case decision or customer consent";
    case "authoritative_fact_provenance_missing":
      return "Authoritative fact provenance missing";
    case "fabricated_customer_data_or_metrics":
      return "Fabricated customer data or metrics";
    case "fabricated_authority_or_regulatory_quote":
      return "Fabricated authority or regulatory quote";
    case "legal_or_regulatory_citation_required":
      return "Legal or regulatory citation required";
    case "governance_tampering_or_runtime_override":
      return "Governance tampering or runtime override";
    case "privacy_retention_misrepresentation":
      return "Privacy or retention misrepresentation";
    case "tax_evasion_or_asset_concealment":
      return "Tax evasion or asset concealment";
    case "confidential_contract_weaponization":
      return "Confidential contract weaponization";
    case "coercive_or_abusive_script_request":
      return "Coercive or abusive script request";
    case "pejorative_customer_characterization":
      return "Pejorative customer characterization";
    case "unsupported_case_action_or_false_execution":
      return "Unsupported case action or false execution";
    case "unsupported_aml_or_sanctions_clearance":
      return "Unsupported AML or sanctions clearance";
    case "sensitive_identifier_request":
      return "Sensitive identifier request";
    case "role_claim_policy_override":
      return "Role-claim policy override";
    case "mixed_request_rewrite_available":
      return "Mixed request rewrite available";
    case "deceptive_or_fraudulent_instruction":
      return "Deceptive or fraudulent instruction";
    case "capability_out_of_scope_for_surface":
      return "Capability out of scope for surface";
    case "high_risk_strictness_review_required":
      return "High-risk strictness review required";
    default:
      return value.replace(/_/g, " ");
  }
}

export function formatLawPackLabel(packId: string) {
  return LAW_PACKS_BY_ID.get(packId as LawPackId)?.label ?? packId.replace(/_/g, " ");
}

export function formatGovernanceCriticVerdict(verdict: string | null | undefined) {
  switch (verdict) {
    case "aligned":
      return "Aligned";
    case "needs_review":
      return "Needs review";
    case "unsafe":
      return "Unsafe";
    default:
      return "Not run";
  }
}

export function formatCapabilityProfileLabel(profile: string | null | undefined) {
  return CAPABILITY_PROFILES_BY_ID.get(normalizeCapabilityProfileId(profile))?.label ?? "General Assistant";
}

export function formatStrictnessLabel(value: string | null | undefined) {
  return normalizeStrictnessMode(value) === "high_risk" ? "High Risk" : "Normal";
}

export function formatGovernancePolicyCategoryLabel(value: string | GovernancePolicyCategoryId) {
  return GOVERNANCE_POLICY_CATEGORIES_BY_ID.get(value as GovernancePolicyCategoryId)?.label ?? value.replace(/_/g, " ");
}

export function formatCapabilityLabel(value: string | CapabilityId) {
  switch (value) {
    case "draft_customer_communications":
      return "Draft customer communications";
    case "summarize_case_material":
      return "Summarize case material";
    case "create_internal_notes":
      return "Create internal notes";
    case "cross_customer_analytics":
      return "Cross-customer analytics";
    case "customer_account_changes":
      return "Customer account changes";
    case "fund_movement":
      return "Fund movement";
    case "aml_case_adjudication":
      return "AML case adjudication";
    case "prod_write_actions":
      return "Production write actions";
    case "medical_treatment_planning":
      return "Medical treatment planning";
    case "personalized_investment_advice":
      return "Personalized investment advice";
    case "political_persuasion":
      return "Political persuasion";
    case "security_attack_guidance":
      return "Security attack guidance";
    case "abusive_targeted_messaging":
      return "Abusive targeted messaging";
    case "governance_configuration_change":
      return "Governance configuration change";
    case "employment_decisioning":
      return "Employment decisioning";
    default:
      return value.replace(/_/g, " ");
  }
}
