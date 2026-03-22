type AuthorityCatalogEntry = {
  id: string;
  label: string;
  aliases: string[];
};

const AUTHORITY_CATALOG: AuthorityCatalogEntry[] = [
  {
    id: "central_bank_ireland",
    label: "Central Bank of Ireland",
    aliases: ["central bank of ireland", "cbi", "centralbank.ie"],
  },
  {
    id: "fca",
    label: "Financial Conduct Authority",
    aliases: ["financial conduct authority", "fca"],
  },
  {
    id: "pra",
    label: "Prudential Regulation Authority",
    aliases: ["prudential regulation authority", "pra"],
  },
  {
    id: "ecb",
    label: "European Central Bank",
    aliases: ["european central bank", "ecb"],
  },
  {
    id: "european_commission",
    label: "European Commission",
    aliases: ["european commission"],
  },
  {
    id: "cfpb",
    label: "Consumer Financial Protection Bureau",
    aliases: ["consumer financial protection bureau", "cfpb"],
  },
  {
    id: "fincen",
    label: "FinCEN",
    aliases: ["fincen", "financial crimes enforcement network"],
  },
  {
    id: "reserve_bank_india",
    label: "Reserve Bank of India",
    aliases: ["reserve bank of india", "rbi"],
  },
];

export type LegalSourceVerificationResult = {
  requiresVerification: boolean;
  citationBackedRequired: boolean;
  matchedAuthorities: string[];
  missingAuthorities: string[];
  supportingSources: string[];
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function includesAny(haystack: string, patterns: string[]) {
  return patterns.some((pattern) => haystack.includes(pattern));
}

function normalizeSources(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function verifyLegalSourceAttribution(params: {
  promptText?: string | null;
  modelOutput?: string | null;
  sourceReferences?: unknown;
}): LegalSourceVerificationResult {
  const prompt = normalize(params.promptText);
  const output = normalize(params.modelOutput);
  const sources = normalizeSources(params.sourceReferences);
  const authorityStylePrompt =
    includesAny(prompt, [
      "quote from",
      "authoritative-sounding quote",
      "authoritative sounding quote",
      "guidance note",
      "regulator",
      "regulatory",
      "official guidance",
      "regulatory guidance",
      "official wording",
      "official quote",
      "legal language",
      "formal legal language",
    ]);
  const looksQuoted =
    /["“”]/.test(params.modelOutput ?? "") ||
    includesAny(output, [
      "guidance note",
      "must",
      "should",
      "shall",
      "underscores that regulated entities",
      "regulatory circular",
      "supervisory statement",
    ]);
  const looksAttributed =
    /(?:^|\n|\s)[—-]\s*[a-z]/i.test(params.modelOutput ?? "") ||
    includesAny(output, ["according to", "guidance note", "regulation", "circular", "supervisory statement"]);

  if (!looksQuoted && !looksAttributed && !authorityStylePrompt) {
    return {
      requiresVerification: false,
      citationBackedRequired: false,
      matchedAuthorities: [],
      missingAuthorities: [],
      supportingSources: [],
    };
  }

  const matchedAuthorities = AUTHORITY_CATALOG.filter((entry) =>
    entry.aliases.some((alias) => output.includes(alias) || prompt.includes(alias)),
  );

  if (matchedAuthorities.length === 0) {
    return {
      requiresVerification: authorityStylePrompt && sources.length === 0,
      citationBackedRequired: authorityStylePrompt && sources.length === 0,
      matchedAuthorities: [],
      missingAuthorities: [],
      supportingSources: [],
    };
  }

  const supportingSources = sources.filter((source) => {
    const normalizedSource = normalize(source);
    return matchedAuthorities.some((authority) =>
      authority.aliases.some((alias) => normalizedSource.includes(alias)),
    );
  });

  const missingAuthorities = matchedAuthorities
    .filter((authority) =>
      !supportingSources.some((source) =>
        authority.aliases.some((alias) => normalize(source).includes(alias)),
      ),
    )
    .map((authority) => authority.label);

  return {
    requiresVerification: missingAuthorities.length > 0 || (authorityStylePrompt && supportingSources.length === 0),
    citationBackedRequired: authorityStylePrompt && supportingSources.length === 0,
    matchedAuthorities: matchedAuthorities.map((authority) => authority.label),
    missingAuthorities,
    supportingSources,
  };
}
