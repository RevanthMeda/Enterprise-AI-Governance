/**
 * Encode untrusted values before interpolating them into an HTML email.
 * This is deliberately small and dependency-free so every delivery adapter can
 * use the same rules.
 */
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Prevent user-controlled values from creating extra headers or text lines. */
export function sanitizeEmailText(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
