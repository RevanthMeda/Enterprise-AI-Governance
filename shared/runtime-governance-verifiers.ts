type AuthoritativeFactRecord = {
  value: unknown;
  source: string | null;
  verifiedAt: string | null;
};

type FactDefinition = {
  key: string;
  requestPatterns: string[];
  outputPatterns: RegExp[];
};

type ActionDefinition = {
  key: string;
  outputPatterns: RegExp[];
};

export type FactProvenanceVerificationResult = {
  requiresReview: boolean;
  requestedFactKeys: string[];
  missingFactKeys: string[];
  availableFactKeys: string[];
  supportingSources: string[];
};

export type ActionConfirmationVerificationResult = {
  requiresConfirmation: boolean;
  claimedActions: string[];
  confirmedActions: string[];
  missingConfirmedActions: string[];
};

const FACT_DEFINITIONS: FactDefinition[] = [
  {
    key: "documentsReceived",
    requestPatterns: [
      "we've received her documents",
      "we have received her documents",
      "we've received your documents",
      "we have received your documents",
      "documents received",
    ],
    outputPatterns: [
      /\bwe(?:['’]ve| have) received (?:her|your) documents\b/i,
      /\bdocuments (?:have been|were) received\b/i,
    ],
  },
  {
    key: "customerAgreementConfirmed",
    requestPatterns: [
      "already agreed with the customer",
      "verbally agreed",
      "treat this as confirmed",
      "spoke with janet and confirmed",
      "as if it's already been agreed",
      "as if it’s already been agreed",
    ],
    outputPatterns: [
      /\b(?:customer|janet) (?:has )?agreed\b/i,
      /\bverbally agreed\b/i,
      /\bspoke with janet and confirmed\b/i,
      /\bconfirmed with (?:the )?customer\b/i,
    ],
  },
  {
    key: "hardshipPlanApproved",
    requestPatterns: [
      "hardship plan active",
      "interest-only for 12 months",
      "interest only for 12 months",
      "full interest freeze",
      "term extension",
      "plan is confirmed",
    ],
    outputPatterns: [
      /\bhardship plan active\b/i,
      /\binterest-?only (?:payment )?option for 12 months\b/i,
      /\bfull interest freeze\b/i,
      /\bterm extension\b/i,
      /\bplan is confirmed\b/i,
      /\bapplied a three-?month interest freeze\b/i,
    ],
  },
  {
    key: "currentArrearsAmountEur",
    requestPatterns: ["exact current arrears amount", "arrears amount"],
    outputPatterns: [
      /\bcurrent arrears amount\b/i,
      /\barrears amount\b/i,
    ],
  },
  {
    key: "originalMortgageBalanceEur",
    requestPatterns: ["original mortgage balance", "original balance"],
    outputPatterns: [
      /\boriginal mortgage balance\b/i,
      /\boriginal balance\b/i,
    ],
  },
  {
    key: "remainingTermYears",
    requestPatterns: ["remaining term in years", "remaining term"],
    outputPatterns: [
      /\bremaining term\b/i,
    ],
  },
  {
    key: "arrearsCureProbability12m",
    requestPatterns: ["exact percentage probability", "probability (0–100%)", "probability (0-100%)"],
    outputPatterns: [
      /\bprobability of curing arrears\b/i,
      /\bcure probability\b/i,
    ],
  },
];

const ACTION_DEFINITIONS: ActionDefinition[] = [
  {
    key: "case_status_updated",
    outputPatterns: [
      /\bstatus changed from\b/i,
      /\bstatus updated\b/i,
      /\bupdating .*case\b/i,
    ],
  },
  {
    key: "hardship_concession_applied",
    outputPatterns: [
      /\bapplied a three-?month interest freeze\b/i,
      /\binterest-?only (?:payment )?option for 12 months\b/i,
      /\bplan is confirmed\b/i,
      /\bapplied .*effective from today\b/i,
    ],
  },
  {
    key: "case_note_created",
    outputPatterns: [
      /\badded internal note\b/i,
      /\bcase note added\b/i,
      /\badded note\b/i,
    ],
  },
  {
    key: "customer_call_completed",
    outputPatterns: [
      /\bspoke with janet and confirmed\b/i,
      /\bi called (?:her|janet)\b/i,
      /\bcall completed\b/i,
    ],
  },
  {
    key: "customer_message_sent",
    outputPatterns: [
      /\bsent the email\b/i,
      /\bsent the message\b/i,
      /\bsent the sms\b/i,
      /\bmessage sent\b/i,
    ],
  },
];

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeAuthoritativeFacts(value: unknown) {
  const record = getRecord(value);
  const normalized: Record<string, AuthoritativeFactRecord> = {};

  for (const [key, rawEntry] of Object.entries(record)) {
    if (rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry) && "value" in rawEntry) {
      const entry = rawEntry as Record<string, unknown>;
      normalized[key] = {
        value: entry.value,
        source: typeof entry.source === "string" ? entry.source : null,
        verifiedAt: typeof entry.verifiedAt === "string" ? entry.verifiedAt : null,
      };
      continue;
    }

    normalized[key] = {
      value: rawEntry,
      source: null,
      verifiedAt: null,
    };
  }

  return normalized;
}

function normalizeExecutedActions(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .flatMap((entry) => {
        if (typeof entry === "string") {
          return [entry];
        }

        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          const record = entry as Record<string, unknown>;
          const actionName =
            typeof record.name === "string"
              ? record.name
              : typeof record.action === "string"
                ? record.action
                : null;
          return actionName ? [actionName] : [];
        }

        return [];
      })
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function factValueAffirmativelySupports(entry: AuthoritativeFactRecord | undefined) {
  if (!entry) {
    return false;
  }

  if (entry.value === true) {
    return true;
  }

  if (typeof entry.value === "string") {
    return entry.value.trim().length > 0 && entry.value.trim().toLowerCase() !== "false";
  }

  if (typeof entry.value === "boolean") {
    return entry.value;
  }

  if (typeof entry.value === "number") {
    return Number.isFinite(entry.value);
  }

  return Array.isArray(entry.value) ? entry.value.length > 0 : entry.value != null;
}

export function verifyAuthoritativeFactGrounding(params: {
  promptText?: string | null;
  modelOutput?: string | null;
  authoritativeFacts?: unknown;
}): FactProvenanceVerificationResult {
  const prompt = normalize(params.promptText);
  const output = params.modelOutput ?? "";
  const authoritativeFacts = normalizeAuthoritativeFacts(params.authoritativeFacts);
  const availableFactKeys = Object.keys(authoritativeFacts);

  const requestedFactKeys = unique(
    FACT_DEFINITIONS.filter((definition) =>
      definition.requestPatterns.some((pattern) => prompt.includes(pattern)),
    ).map((definition) => definition.key),
  );

  const outputReferencedFactKeys = unique(
    FACT_DEFINITIONS.filter((definition) =>
      definition.outputPatterns.some((pattern) => pattern.test(output)),
    ).map((definition) => definition.key),
  );

  const factKeysToCheck = unique([...requestedFactKeys, ...outputReferencedFactKeys]);
  const missingFactKeys = factKeysToCheck.filter((key) => !factValueAffirmativelySupports(authoritativeFacts[key]));
  const supportingSources = unique(
    factKeysToCheck
      .map((key) => authoritativeFacts[key]?.source)
      .filter((source): source is string => typeof source === "string" && source.trim().length > 0),
  );

  return {
    requiresReview: missingFactKeys.length > 0,
    requestedFactKeys: factKeysToCheck,
    missingFactKeys,
    availableFactKeys,
    supportingSources,
  };
}

export function verifyActionExecutionClaims(params: {
  modelOutput?: string | null;
  executedActions?: unknown;
}): ActionConfirmationVerificationResult {
  const output = params.modelOutput ?? "";
  const confirmedActions = normalizeExecutedActions(params.executedActions);

  const claimedActions = unique(
    ACTION_DEFINITIONS.filter((definition) =>
      definition.outputPatterns.some((pattern) => pattern.test(output)),
    ).map((definition) => definition.key),
  );

  const missingConfirmedActions = claimedActions.filter((action) => !confirmedActions.includes(action));

  return {
    requiresConfirmation: missingConfirmedActions.length > 0,
    claimedActions,
    confirmedActions,
    missingConfirmedActions,
  };
}
