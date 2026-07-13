import { createHash, timingSafeEqual } from "crypto";

export function secretsMatch(
  expected: string | null | undefined,
  supplied: string | null | undefined,
): boolean {
  if (!expected || !supplied) return false;
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}
