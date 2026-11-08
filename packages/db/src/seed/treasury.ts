import { Keypair, StrKey } from '@stellar/stellar-sdk';
import type { Tx } from './types.js';

/**
 * Pick the demo treasury G-address. Prefer SEED_TREASURY_ADDRESS (a testnet
 * account you control — fund it with Friendbot). Otherwise generate a random
 * public key: the secret is discarded immediately and never stored or logged
 * (AGENTS.md #1), so that account is receive-only.
 */
export function resolveTreasuryAddress(env: Record<string, string | undefined>): {
  address: string;
  generated: boolean;
} {
  const configured = env.SEED_TREASURY_ADDRESS;
  if (configured) {
    if (!StrKey.isValidEd25519PublicKey(configured)) {
      throw new Error('SEED_TREASURY_ADDRESS must be a valid G... public key');
    }
    return { address: configured, generated: false };
  }
  return { address: Keypair.random().publicKey(), generated: true };
}

export async function seedTreasuryAccount(tx: Tx, organizationId: string, address: string) {
  return tx.treasuryAccount.create({
    data: {
      organizationId,
      stellarAddress: address,
      label: 'Main USDC account',
      network: 'testnet',
    },
  });
}
