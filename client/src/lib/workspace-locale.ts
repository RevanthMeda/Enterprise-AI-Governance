import {
  DEFAULT_WORKSPACE_LOCALE,
  workspaceLocaleOptions,
  type WorkspaceLocale,
} from "@shared/operator-preferences";

const SUPPORTED_LOCALES = workspaceLocaleOptions as readonly WorkspaceLocale[];

function coerceWorkspaceLocale(input?: string | null): WorkspaceLocale | null {
  if (!input) {
    return null;
  }

  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const exact = SUPPORTED_LOCALES.find(
    (locale) => locale.toLowerCase() === normalized.toLowerCase(),
  );
  if (exact) {
    return exact;
  }

  const language = normalized.split(/[-_]/)[0]?.toLowerCase();
  if (!language) {
    return null;
  }

  return (
    SUPPORTED_LOCALES.find((locale) => locale.toLowerCase().startsWith(`${language}-`)) ??
    null
  );
}

export function resolveRuntimeWorkspaceLocale(
  preferredLocale?: string | null,
): WorkspaceLocale {
  const browserCandidates =
    typeof navigator === "undefined"
      ? []
      : [navigator.language, ...(navigator.languages ?? [])];
  const documentLang =
    typeof document === "undefined" ? undefined : document.documentElement.lang;

  for (const candidate of [preferredLocale, documentLang, ...browserCandidates]) {
    const locale = coerceWorkspaceLocale(candidate);
    if (locale) {
      return locale;
    }
  }

  return DEFAULT_WORKSPACE_LOCALE;
}
