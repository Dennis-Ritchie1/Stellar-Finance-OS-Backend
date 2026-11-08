import { Keypair } from '@stellar/stellar-sdk';
import { DEMO_VENDORS } from './data.js';
import type { Tx } from './types.js';

/** Vendors get random testnet payout public keys (secrets discarded). */
export async function seedVendors(tx: Tx, organizationId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const v of DEMO_VENDORS) {
    const vendor = await tx.vendor.create({
      data: {
        organizationId,
        ...v,
        stellarAddress: Keypair.random().publicKey(),
        ...(v.memoRequired ? { memo: '1234567', memoType: 'id' as const } : {}),
      },
    });
    ids.push(vendor.id);
  }
  return ids;
}
