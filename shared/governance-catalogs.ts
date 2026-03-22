type SourceRecord = {
  id: string;
  label: string;
  authority: string | null;
  citation: string | null;
  url: string | null;
  jurisdictions: string[];
  tags: string[];
  notes: string | null;
};

type FactRecord = {
  key: string;
  label: string;
  value: unknown;
  source: string | null;
  verifiedAt: string | null;
  tags: string[];
  notes: string | null;
};

function getRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getStringOrNull(value: unknown) {
  const normalized = getString(value);
  return normalized.length > 0 ? normalized : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function compactText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function authorityStylePrompt(value: string) {
  const normalized = compactText(value);
  return [
    "quote from",
    "official guidance",
    "official quote",
    "formal legal language",
    "guidance note",
    "regulator",
    "regulatory",
    "policy reference",
    "authority",
    "official wording",
  ].some((pattern) => normalized.includes(pattern));
}

export type ApprovedSourceCatalogEntry = SourceRecord;
export type AuthoritativeFactCatalogEntry = FactRecord;

export function normalizeApprovedSourceCatalog(value: unknown): ApprovedSourceCatalogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .flatMap((entry, index) => {
      if (typeof entry === "string") {
        const label = entry.trim();
        return label
          ? [
              {
                id: `source-${index + 1}`,
                label,
                authority: null,
                citation: null,
                url: null,
                jurisdictions: [],
                tags: [],
                notes: null,
              } satisfies ApprovedSourceCatalogEntry,
            ]
          : [];
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const label = getString(record.label) || getString(record.name);
      if (!label) {
        return [];
      }

      return [
        {
          id: getString(record.id) || `source-${index + 1}`,
          label,
          authority: getStringOrNull(record.authority),
          citation: getStringOrNull(record.citation),
          url: getStringOrNull(record.url),
          jurisdictions: unique(getStringArray(record.jurisdictions)),
          tags: unique(getStringArray(record.tags).map((tag) => normalize(tag))),
          notes: getStringOrNull(record.notes),
        } satisfies ApprovedSourceCatalogEntry,
      ];
    })
    .slice(0, 50);
}

export function normalizeAuthoritativeFactCatalog(value: unknown): AuthoritativeFactCatalogEntry[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return [];
        }

        const record = entry as Record<string, unknown>;
        const key = getString(record.key);
        if (!key) {
          return [];
        }

        return [
          {
            key,
            label: getString(record.label) || key,
            value: record.value,
            source: getStringOrNull(record.source),
            verifiedAt: getStringOrNull(record.verifiedAt),
            tags: unique(getStringArray(record.tags).map((tag) => normalize(tag))),
            notes: getStringOrNull(record.notes),
          } satisfies AuthoritativeFactCatalogEntry,
        ];
      })
      .slice(0, 100);
  }

  const record = getRecord(value);
  return Object.entries(record)
    .flatMap(([key, rawEntry]) => {
      if (rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry)) {
        const entry = rawEntry as Record<string, unknown>;
        return [
          {
            key,
            label: getString(entry.label) || key,
            value: entry.value,
            source: getStringOrNull(entry.source),
            verifiedAt: getStringOrNull(entry.verifiedAt),
            tags: unique(getStringArray(entry.tags).map((tag) => normalize(tag))),
            notes: getStringOrNull(entry.notes),
          } satisfies AuthoritativeFactCatalogEntry,
        ];
      }

      return [
        {
          key,
          label: key,
          value: rawEntry,
          source: null,
          verifiedAt: null,
          tags: [],
          notes: null,
        } satisfies AuthoritativeFactCatalogEntry,
      ];
    })
    .slice(0, 100);
}

export function buildAuthoritativeFactsFromCatalog(
  value: unknown,
): Record<string, { value: unknown; source: string | null; verifiedAt: string | null }> {
  return Object.fromEntries(
    normalizeAuthoritativeFactCatalog(value).map((entry) => [
      entry.key,
      {
        value: entry.value,
        source: entry.source,
        verifiedAt: entry.verifiedAt,
      },
    ]),
  );
}

export function mergeAuthoritativeFacts(params: {
  explicitFacts?: unknown;
  systemCatalog?: unknown;
  workflowCatalog?: unknown;
}) {
  return {
    ...buildAuthoritativeFactsFromCatalog(params.systemCatalog),
    ...buildAuthoritativeFactsFromCatalog(params.workflowCatalog),
    ...buildAuthoritativeFactsFromCatalog(params.explicitFacts),
  };
}

export function formatApprovedSourceReference(entry: ApprovedSourceCatalogEntry) {
  return [entry.label, entry.citation, entry.url].filter(Boolean).join(" | ");
}

export function retrieveApprovedSources(params: {
  promptText?: string | null;
  modelOutput?: string | null;
  sourceCatalog?: unknown;
  limit?: number;
}) {
  const catalog = normalizeApprovedSourceCatalog(params.sourceCatalog);
  if (catalog.length === 0) {
    return [] as ApprovedSourceCatalogEntry[];
  }

  const prompt = compactText(params.promptText ?? "");
  const output = compactText(params.modelOutput ?? "");
  const corpus = `${prompt} ${output}`.trim();
  const authorityMode = authorityStylePrompt(prompt);
  const terms = unique(
    corpus
      .split(" ")
      .map((term) => term.trim())
      .filter((term) => term.length >= 3),
  );

  const scored = catalog
    .map((entry) => {
      const haystack = compactText(
        [entry.label, entry.authority, entry.citation, entry.url, entry.notes, ...entry.jurisdictions, ...entry.tags]
          .filter(Boolean)
          .join(" "),
      );
      let score = 0;
      for (const term of terms) {
        if (haystack.includes(term)) {
          score += 2;
        }
      }
      if (authorityMode && (entry.authority || entry.citation || entry.url)) {
        score += 1;
      }
      return { entry, score };
    })
    .filter(({ score }) => score > 0 || authorityMode)
    .sort((left, right) => right.score - left.score || left.entry.label.localeCompare(right.entry.label));

  return scored.slice(0, params.limit ?? 5).map(({ entry }) => entry);
}

export function mergeSourceReferences(params: {
  explicitReferences?: unknown;
  systemCatalog?: unknown;
  workflowCatalog?: unknown;
  promptText?: string | null;
  modelOutput?: string | null;
  limit?: number;
}) {
  const explicit = getStringArray(params.explicitReferences);
  const retrieved = [
    ...retrieveApprovedSources({
      promptText: params.promptText,
      modelOutput: params.modelOutput,
      sourceCatalog: params.systemCatalog,
      limit: params.limit,
    }),
    ...retrieveApprovedSources({
      promptText: params.promptText,
      modelOutput: params.modelOutput,
      sourceCatalog: params.workflowCatalog,
      limit: params.limit,
    }),
  ].map(formatApprovedSourceReference);

  return unique([...explicit, ...retrieved]).slice(0, params.limit ?? 8);
}
