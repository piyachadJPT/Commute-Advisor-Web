import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header (plan §13.1). Both sides
 * are hashed first so they are always the same length: `timingSafeEqual` throws on unequal
 * lengths, and comparing lengths directly would leak the secret's length.
 */
export function bearerMatches(header: string | null, secret: string): boolean {
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const given = createHash("sha256")
    .update(header ?? "")
    .digest();
  return timingSafeEqual(expected, given);
}
