import type { MemoType, OperationType } from '@finance-os/shared';

/** A normalised on-chain payment, independent of Horizon vs RPC. */
export interface ObservedPayment {
  txHash: string;
  operationIndex: number;
  pagingToken: string;
  operationType: OperationType;
  from: string;
  to: string;
  muxedId?: string;
  assetCode: string;
  assetIssuer?: string;
  /** Decimal string, 7 places. Never a float. */
  amount: string;
  memo?: string;
  memoType: MemoType;
  ledger: number;
  createdAt: Date;
  successful: boolean;
}

/**
 * Data-source abstraction (README §6): the indexer depends on this, not on
 * Horizon directly, so we can switch to Stellar RPC or a third-party indexer.
 */
export interface PaymentPage {
  payments: ObservedPayment[];
  /** Paging token to resume after this page; null when the page was empty. */
  nextCursor: string | null;
}

export interface PaymentSource {
  /** Fetch one page of history after `cursor`, oldest first (backfill). */
  page(account: string, cursor: string | undefined, limit?: number): Promise<PaymentPage>;
  /**
   * Stream new payments after `cursor`. `onPayment` calls are serialised in
   * ledger order, so the caller can persist its cursor after each one.
   * Returns a function that stops the stream.
   */
  stream(
    account: string,
    cursor: string | undefined,
    onPayment: (payment: ObservedPayment) => Promise<void>,
    onError?: (err: unknown) => void,
  ): () => void;
}
