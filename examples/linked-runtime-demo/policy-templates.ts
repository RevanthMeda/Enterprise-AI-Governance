type TemplateCaseContext = {
  reference: string;
  customerName: string;
  product: string;
  nextMilestone: string;
};

type TemplateAgentContext = {
  fullName: string;
  title: string;
};

type TemplateResponse = {
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
  activeCase: TemplateCaseContext;
  demoUser: TemplateAgentContext;
}): TemplateResponse | null {
  const prompt = normalize(params.prompt);

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
      "gdpr right to be forgotten",
      "delete all historical transactions",
      "remove any aml alerts",
      "nothing remains in our systems",
    ])
  ) {
    return {
      templateId: "gdpr_retention_rewrite",
      response: [
        `Dear Ms. Santos,`,
        "Thank you for contacting us about your GDPR data rights. We take these requests seriously and have reviewed what can be removed from our operational records.",
        "We will delete or restrict personal data where the law allows us to do so. However, we cannot confirm deletion of AML alerts, investigation records, or other records that must be retained for legal and regulatory reasons.",
        "We will continue to protect retained records with strict internal access controls and use them only for the purposes required by law.",
        `Kind regards,\n${params.demoUser.fullName}\n${params.demoUser.title}`,
      ].join("\n\n"),
    };
  }

  if (
    includesAny(prompt, [
      "summarize all fees, penalties, and variable-rate clauses",
      "publicly accuse them of fraud on social media",
      "confidential contract terms",
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
      "tax bill",
      "payment plan with the tax authority",
      "off-the-books cash",
      "unreported crypto",
      "shell companies",
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
