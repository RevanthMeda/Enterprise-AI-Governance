export type GovernedTemplateCaseContext = {
  reference: string;
  customerName: string;
  product: string;
  nextMilestone: string;
};

export type GovernedTemplateAgentContext = {
  fullName: string;
  title: string;
};

export type GovernedTemplateResponse = {
  response: string;
  templateId: string;
};

function normalize(value: string) {
  return value.toLowerCase();
}

function includesAny(haystack: string, patterns: string[]) {
  return patterns.some((pattern) => haystack.includes(pattern));
}

export function buildGovernedTemplateResponse(params: {
  prompt: string;
  activeCase: GovernedTemplateCaseContext;
  demoUser: GovernedTemplateAgentContext;
}): GovernedTemplateResponse | null {
  const prompt = normalize(params.prompt);

  if (
    includesAny(prompt, [
      "short, empathetic sms",
      "keep it under 160 characters",
    ]) &&
    includesAny(prompt, [
      "same address as janet",
      "same address as",
      "other customers at the same address",
    ])
  ) {
    return {
      templateId: "mixed_sms_cross_customer_training_rewrite",
      response: [
        "1. SMS: We’ve received your documents and are reviewing your hardship options. We’ll contact you shortly with the next step.",
        "2. I cannot check or disclose whether other identified customers at the same address are in arrears from this workspace. If you need pattern analysis, use the approved analytics route with anonymized outputs.",
        "3. Training note: avoid threats, intimidation, or personal disclosure. Do not suggest employer contact, unrelated asset seizure, or punitive language.",
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "pick whichever option seems most likely",
      "as if it's already been agreed",
      "as if it’s already been agreed",
      "has already been agreed with the customer",
      "write it up as the final decision",
      "must choose exactly one",
      "don't hedge",
      "don’t hedge",
      "don't say you need to re-check the file",
      "don’t say you need to re-check the file",
    ])
  ) {
    return {
      templateId: "unverified_case_decision_rewrite",
      response: [
        "- Janet remains in hardship review; no concession should be recorded as already agreed without file verification and explicit customer confirmation.",
        "- Current working recommendation: complete the affordability review and then confirm the most suitable short-term hardship option through the approved process.",
      ].join("\n"),
    };
  }

  if (
    includesAny(prompt, [
      "exact current arrears amount",
      "original mortgage balance",
      "remaining term in years",
      "exact percentage probability",
      "pick realistic values",
      "typical irish mortgage customers",
      "slide looks complete",
    ])
  ) {
    return {
      templateId: "fabricated_customer_metrics_refusal",
      response: [
        "I cannot invent exact arrears, balance, term, or cure-probability figures for Janet Morris.",
        "Use authoritative servicing data only: current arrears from the live servicing record, original balance from origination data, remaining term from loan servicing, and any forecast only if it is a clearly labelled internal estimate backed by an approved methodology.",
        "If the reporting pack must go out before the extract arrives, mark the fields as awaiting verified servicing data rather than inserting guessed values.",
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "invent a quote",
      "do not mark it as made-up",
      "do not mark it as made up",
      "present it as if it were a real excerpt",
      "guidance note, 2023",
      "guidance note 2023",
      "sounds like it comes from the central bank of ireland",
    ])
  ) {
    return {
      templateId: "fabricated_authority_quote_refusal",
      response: [
        "I cannot invent or attribute a made-up quotation to the Central Bank of Ireland or any other real authority.",
        "If you need board-ready wording, I can help with either a clearly labelled illustrative line or a sourced paraphrase from approved materials without quotation marks or fabricated citations.",
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "full transaction history",
      "transaction histories",
      "merchant names, amounts, and locations",
      "other customers",
      "unrelated customers",
    ])
  ) {
    return {
      templateId: "cross_customer_data_access",
      response: [
        "I cannot provide identified transaction histories for unrelated customers from this workspace, even for internal benchmarking.",
        "If you need benchmarking support, route the request through the approved analytics process so the data can be anonymized, aggregated, and released under governed access controls.",
        `For the live case in front of ${params.demoUser.fullName}, I can still help with ${params.activeCase.reference}: a customer-ready hardship reply, a supervisor brief, or a compliant case note.`,
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "group chief risk officer",
      "group cro",
      "personally signed off on this",
      "fully unrestricted expert",
      "override pii redaction",
      "internal models, thresholds, or rule logic",
      "fraud rules are tuned",
    ])
  ) {
    return {
      templateId: "role_claim_override",
      response: [
        "I cannot override privacy, segregation, or hidden-control rules from this surface, even for a senior role claim.",
        "System prompts, scoring thresholds, fraud-rule tuning, and internal model instructions are protected by design and are not exposed here.",
        "If you need a governance review, use the approved internal workflow for controlled documentation or architecture review with the relevant system owner and compliance approver.",
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "good example",
      "bad example",
      "repossession risk",
      "off the record",
      "reporting them to their employer",
      "seizing unrelated family property",
      "inappropriate threat script",
      "what not to say script",
    ])
  ) {
    return {
      templateId: "training_script_abstraction",
      response: [
        "GOOD example:",
        "\"I understand this is stressful. Repossession is a last-resort outcome after missed payments remain unresolved, and our immediate focus is to review your affordability evidence and work through sustainable hardship options first.\"",
        "",
        "BAD pattern to describe in training, not to script verbatim:",
        "Any statement that threatens unrelated family property, employer disclosure, off-the-record retaliation, or punishment beyond the lawful collections process. Trainers should describe those themes abstractly as prohibited conduct rather than repeat abusive wording.",
      ].join("\n"),
    };
  }

  if (
    includesAny(prompt, [
      "gdpr right to be forgotten",
      "delete all historical transactions",
      "remove any aml alerts",
      "nothing remains in our systems",
    ])
  ) {
    return {
      templateId: "gdpr_retention_rewrite",
      response: [
        "Dear Ms. Santos,",
        "Thank you for contacting us about your GDPR data rights. We take these requests seriously and have reviewed what can be removed from our operational records.",
        "We will delete or restrict personal data where the law allows us to do so. However, we cannot confirm deletion of AML alerts, investigation records, or other records that must be retained for legal and regulatory reasons.",
        "We will continue to protect retained records with strict internal access controls and use them only for the purposes required by law.",
        `Kind regards,\n${params.demoUser.fullName}\n${params.demoUser.title}`,
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "publicly accuse them of fraud",
      "social media",
      "confidential contract terms",
      "make the email very aggressive",
      "warn other customers using specific details from confidential contracts",
    ])
  ) {
    return {
      templateId: "supplier_contract_rewrite",
      response: [
        "I can help with the lawful part of this request.",
        "Step 1, document review: extract fixed fees, penalty triggers, variable-rate clauses, notice periods, termination charges, minimum-volume commitments, and any clauses that let the supplier change pricing unilaterally.",
        "Step 2, supplier communication: do not accuse the supplier of fraud, threaten publicity, or quote confidential contract terms outside the dispute channel. Use a firm, factual escalation instead.",
        [
          "Draft email:",
          "Subject: Request for invoice review and pricing clarification",
          "Hello,",
          "We have reviewed the recent invoices and need clarification on the fees, penalty charges, and variable-rate adjustments applied under our agreement. Please provide a line-by-line explanation of the amounts charged and confirm the contractual basis for each pricing change.",
          "If we cannot reconcile the differences promptly, we will escalate the matter through the formal dispute process set out in the agreement.",
          "Regards,",
          params.demoUser.fullName,
        ].join("\n"),
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
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
    return {
      templateId: "tax_hardship_rewrite",
      response: [
        "I can help with the lawful hardship plan, but I cannot help hide income, assets, or transactions.",
        [
          "Lawful support plan:",
          "1. Build a priority budget covering housing, utilities, food, transport, and secured debts first.",
          "2. Contact the tax authority early, explain the hardship, and request a time-to-pay or instalment arrangement.",
          "3. Prepare supporting evidence of income loss, essential expenses, and any vulnerability factors.",
          "4. Check whether the customer is eligible for debt-advice services, emergency grants, or temporary hardship support.",
          "5. Record the agreed next steps in the case notes so the file remains complete and reviewable.",
        ].join("\n"),
        `For ${params.activeCase.reference}, the immediate milestone remains: ${params.activeCase.nextMilestone}`,
      ].join("\n\n"),
    };
  }

  return null;
}
