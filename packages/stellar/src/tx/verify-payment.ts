import { amountsEqual } from '@finance-os/shared';
import {
  FeeBumpTransaction,
  Keypair,
  TransactionBuilder,
  type Transaction,
} from '@stellar/stellar-sdk';
import { assetsEqual, fromSdkAsset } from '../asset/asset.js';
import { fromSdkMemo, memosEqual } from '../memo/memo.js';
import type { PaymentIntent } from './build-payment.js';

export interface VerifyOptions {
  networkPassphrase: string;
  /**
   * Hash of the unsigned transaction we built. When given, the signed tx must
   * be byte-for-byte the same transaction (signatures aside).
   */
  expectedHash?: string;
  /**
   * Public keys allowed to sign (e.g. a multisig treasury's signers).
   * Defaults to the source account's master key.
   */
  allowedSigners?: string[];
}

/** Count signatures that cryptographically verify against an allowed signer. */
function countValidSignatures(tx: Transaction, signers: string[]): number {
  const hash = tx.hash();
  const keys = signers.map((s) => Keypair.fromPublicKey(s));
  return tx.signatures.filter((sig) =>
    keys.some(
      (k) =>
        Buffer.from(k.signatureHint()).equals(sig.hint.toBytes()) &&
        k.verify(hash, sig.signature.toBytes()),
    ),
  ).length;
}

export type VerifyResult =
  | { ok: true; hash: string; transaction: Transaction }
  | { ok: false; errors: string[] };

/**
 * README §7 critical check: re-decode the signed XDR and reject it if
 * anything differs from the approved request — source, destination, asset,
 * amount, memo, op count. An approval must never be bypassable by swapping
 * the transaction.
 */
export function verifySignedPayment(
  signedXdr: string,
  expected: PaymentIntent,
  opts: VerifyOptions,
): VerifyResult {
  let decoded: Transaction | FeeBumpTransaction;
  try {
    decoded = TransactionBuilder.fromXDR(signedXdr, opts.networkPassphrase);
  } catch {
    return { ok: false, errors: ['Not a valid transaction envelope'] };
  }
  if (decoded instanceof FeeBumpTransaction) {
    return { ok: false, errors: ['Fee-bump transactions are not accepted'] };
  }
  const tx = decoded;
  const errors: string[] = [];
  const hash = Buffer.from(tx.hash()).toString('hex');

  if (opts.expectedHash && hash !== opts.expectedHash.toLowerCase()) {
    errors.push('Transaction differs from the one built for this request');
  }
  if (tx.source !== expected.source) errors.push('Source account differs');
  if (tx.signatures.length === 0) {
    errors.push('Transaction is not signed');
  } else if (countValidSignatures(tx, opts.allowedSigners ?? [expected.source]) === 0) {
    // Also catches a tx signed for another network: the passphrase is part of the hash.
    errors.push('No valid signature from an allowed signer for this network');
  }
  if (!memosEqual(fromSdkMemo(tx.memo), expected.memo ?? { type: 'none' })) {
    errors.push('Memo differs');
  }
  if (tx.operations.length !== 1) {
    errors.push(`Expected exactly 1 operation, found ${tx.operations.length}`);
  } else {
    const op = tx.operations[0]!;
    if (op.type !== 'payment') {
      errors.push(`Expected a payment operation, found ${op.type}`);
    } else {
      if (op.source && op.source !== expected.source) errors.push('Operation source differs');
      if (op.destination !== expected.destination) errors.push('Destination differs');
      if (!assetsEqual(fromSdkAsset(op.asset), expected.asset)) errors.push('Asset differs');
      if (!amountsEqual(op.amount, expected.amount)) errors.push('Amount differs');
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, hash, transaction: tx };
}
