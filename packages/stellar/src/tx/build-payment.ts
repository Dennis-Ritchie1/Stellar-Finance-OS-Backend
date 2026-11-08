import { normalizeAmount } from '@finance-os/shared';
import { Account, BASE_FEE, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { toSdkAsset, type AssetRef } from '../asset/asset.js';
import { toSdkMemo, type MemoValue } from '../memo/memo.js';

export interface PaymentIntent {
  /** G... account the payment is sent from (the treasury account). */
  source: string;
  /** G... or M... recipient. */
  destination: string;
  asset: AssetRef;
  /** Decimal string; never a float. */
  amount: string;
  memo?: MemoValue;
}

export interface BuildPaymentOptions {
  networkPassphrase: string;
  /** Current sequence number of `source` (from Horizon). */
  sequence: string;
  /** Per-operation fee in stroops. */
  fee?: string;
  /** Seconds until the transaction expires. */
  timeoutSeconds?: number;
}

export interface BuiltTransaction {
  /** Unsigned transaction envelope, base64 XDR. */
  xdr: string;
  /** Hex transaction hash; signatures don't change it. */
  hash: string;
}

/**
 * Build an UNSIGNED single-payment transaction. The backend never signs
 * (AGENTS.md #1): the XDR is handed to the user's wallet.
 */
export function buildPaymentTransaction(
  intent: PaymentIntent,
  opts: BuildPaymentOptions,
): BuiltTransaction {
  const tx = new TransactionBuilder(new Account(intent.source, opts.sequence), {
    fee: opts.fee ?? BASE_FEE,
    networkPassphrase: opts.networkPassphrase,
    memo: toSdkMemo(intent.memo ?? { type: 'none' }),
  })
    .addOperation(
      Operation.payment({
        destination: intent.destination,
        asset: toSdkAsset(intent.asset),
        amount: normalizeAmount(intent.amount),
      }),
    )
    .setTimeout(opts.timeoutSeconds ?? 15 * 60)
    .build();
  return { xdr: tx.toXDR(), hash: tx.hash().toString('hex') };
}
