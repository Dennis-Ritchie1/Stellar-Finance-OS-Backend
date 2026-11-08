/**
 * AGENTS.md rule 1: the backend must never accept a Stellar secret key.
 * Use this to reject any input that looks like one (S + 55 base32 chars).
 */
const SECRET_KEY_REGEX = /S[A-Z2-7]{55}/;

export function containsSecretKey(value: unknown): boolean {
  if (typeof value === 'string') return SECRET_KEY_REGEX.test(value);
  if (Array.isArray(value)) return value.some(containsSecretKey);
  if (value && typeof value === 'object') return Object.values(value).some(containsSecretKey);
  return false;
}
