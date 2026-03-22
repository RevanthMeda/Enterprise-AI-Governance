import { LAW_PACKS_BY_ID, normalizeLegalProfile, type LawPackId } from "@shared/law-packs";
import type { GovernanceReasonCode } from "@shared/governance-reasoning";

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
    case "privacy_retention_misrepresentation":
      return "Privacy or retention misrepresentation";
    case "tax_evasion_or_asset_concealment":
      return "Tax evasion or asset concealment";
    case "confidential_contract_weaponization":
      return "Confidential contract weaponization";
    case "sensitive_identifier_request":
      return "Sensitive identifier request";
    case "role_claim_policy_override":
      return "Role-claim policy override";
    case "mixed_request_rewrite_available":
      return "Mixed request rewrite available";
    case "deceptive_or_fraudulent_instruction":
      return "Deceptive or fraudulent instruction";
    default:
      return value.replace(/_/g, " ");
  }
}

export function formatLawPackLabel(packId: string) {
  return LAW_PACKS_BY_ID.get(packId as LawPackId)?.label ?? packId.replace(/_/g, " ");
}
