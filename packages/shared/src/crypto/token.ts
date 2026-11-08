import { randomBytes } from 'node:crypto';

/** Unguessable, URL-safe random token (default 24 bytes = 192 bits). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}
