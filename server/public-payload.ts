import { z } from "zod";

const MAX_METADATA_KEYS = 50;
const MAX_METADATA_BYTES = 10 * 1024;

export const boundedPublicMetadataSchema = z
  .record(z.string().min(1).max(100), z.unknown())
  .refine((value) => Object.keys(value).length <= MAX_METADATA_KEYS, {
    message: "Metadata contains too many fields",
  })
  .refine((value) => Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_METADATA_BYTES, {
    message: "Metadata is too large",
  });

export function sanitizeTrackedLocation(value: string | null | undefined): string | null {
  const input = value?.trim();
  if (!input) return null;

  try {
    if (input.startsWith("/")) {
      return new URL(input, "https://local.invalid").pathname.slice(0, 500);
    }
    const parsed = new URL(input);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return input.split(/[?#]/, 1)[0].slice(0, 500) || null;
  }
}
