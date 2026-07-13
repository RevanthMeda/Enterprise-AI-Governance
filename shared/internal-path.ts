const INTERNAL_PATH_BASE = "https://internal.invalid";

/**
 * Normalizes post-authentication navigation to a path on the current public
 * app origin. Backslashes are rejected because browsers treat them as URL
 * authority separators in otherwise path-looking values such as `/\\evil`.
 */
export function normalizeInternalPath(value?: string | null, fallback = "/"): string {
  if (!value || value.length > 2_000 || value !== value.trim()) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) return fallback;

  try {
    const parsed = new URL(value, INTERNAL_PATH_BASE);
    if (parsed.origin !== INTERNAL_PATH_BASE || parsed.username || parsed.password) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
