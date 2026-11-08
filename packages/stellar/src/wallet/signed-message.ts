import { createHash } from 'node:crypto';
import { Keypair } from '@stellar/stellar-sdk';

/** SEP-53 prefix: wallets sign SHA-256(prefix + message), never raw bytes. */
const SEP53_PREFIX = 'Stellar Signed Message:\n';

export function sep53Hash(message: string): Buffer {
  return createHash('sha256')
    .update(SEP53_PREFIX + message, 'utf8')
    .digest();
}

/**
 * Verify a SEP-53 signed message (e.g. Freighter `signMessage`).
 * `signature` is base64. Returns false for any malformed input.
 */
export function verifySignedMessage(address: string, message: string, signature: string): boolean {
  try {
    const sig = Buffer.from(signature, 'base64');
    if (sig.length !== 64) return false;
    return Keypair.fromPublicKey(address).verify(sep53Hash(message), sig);
  } catch {
    return false;
  }
}
