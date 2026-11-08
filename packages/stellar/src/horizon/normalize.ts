import type { MemoType, OperationType } from '@finance-os/shared';
import { normalizeAmount } from '@finance-os/shared';
import { NATIVE_CODE } from '../asset/asset.js';
import type { ObservedPayment } from '../payment-source.js';
import { parseOperationId } from './operation-id.js';
import type { AccountMergeRecord, HorizonPaymentRecord, PaymentRecord } from './records.js';

const PAYMENT_TYPES = new Set(['payment', 'path_payment_strict_receive', 'path_payment_strict_send']);

function memoOf(record: HorizonPaymentRecord): { memo?: string; memoType: MemoType } {
  const tx = record.transaction;
  if (!tx || tx.memo_type === 'none' || tx.memo === undefined) return { memoType: 'none' };
  if (tx.memo_type === 'hash' || tx.memo_type === 'return') {
    // Horizon returns hash memos base64-encoded; we store hex.
    return { memoType: tx.memo_type, memo: Buffer.from(tx.memo, 'base64').toString('hex') };
  }
  return { memoType: tx.memo_type, memo: tx.memo };
}

function common(record: HorizonPaymentRecord) {
  const { ledger, operationIndex } = parseOperationId(record.id);
  return {
    txHash: record.transaction_hash,
    operationIndex,
    pagingToken: record.paging_token,
    ledger: record.transaction?.ledger ?? ledger,
    createdAt: new Date(record.created_at),
    successful: record.transaction_successful,
    ...memoOf(record),
  };
}

/**
 * Map one Horizon payments-endpoint record to an ObservedPayment.
 * Returns null for record types we don't track (e.g. create_account).
 * `mergedAmount` supplies the XLM amount of an account_merge, which Horizon
 * only exposes through the operation's effects.
 */
export function normalizePaymentRecord(
  record: HorizonPaymentRecord,
  mergedAmount?: string,
): ObservedPayment | null {
  if (PAYMENT_TYPES.has(record.type)) {
    const r = record as PaymentRecord;
    const native = r.asset_type === 'native';
    return {
      ...common(r),
      operationType: r.type as OperationType,
      from: r.from,
      to: r.to,
      ...(r.to_muxed_id ? { muxedId: r.to_muxed_id } : {}),
      assetCode: native ? NATIVE_CODE : r.asset_code!,
      ...(native ? {} : { assetIssuer: r.asset_issuer! }),
      amount: normalizeAmount(r.amount),
    };
  }
  if (record.type === 'account_merge') {
    const r = record as AccountMergeRecord;
    if (mergedAmount === undefined) return null;
    return {
      ...common(r),
      operationType: 'account_merge',
      from: r.account,
      to: r.into,
      ...(r.into_muxed_id ? { muxedId: r.into_muxed_id } : {}),
      assetCode: NATIVE_CODE,
      amount: normalizeAmount(mergedAmount),
    };
  }
  return null;
}

/** in = money arriving at `account`; out = leaving it. */
export function directionFor(payment: ObservedPayment, account: string): 'in' | 'out' {
  return payment.to === account ? 'in' : 'out';
}
