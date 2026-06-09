import { randomBytes } from "crypto";

// Crockford base32, lowercased, minus ambiguous chars (i, l, o, u already excluded).
// Exactly 32 symbols → a uniform byte % 32 has no modulo bias (256 = 8 × 32).
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Generate a collision-resistant, URL-safe survey code (the bearer token in
 * /survey/<code>). Default length 10 ≈ 50 bits of entropy. Always lowercase.
 *
 * Uniqueness is ultimately enforced by the UNIQUE constraint on
 * survey_recipients.code — callers should insert-and-retry on conflict.
 */
export function generateSurveyCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % 32];
  }
  return out;
}

/** Normalize an incoming code from a URL for lookup (lowercase, trimmed). */
export function normalizeSurveyCode(code: string): string {
  return code.trim().toLowerCase();
}
