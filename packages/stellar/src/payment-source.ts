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
export interface PaymentSource {
  stream(
    account: string,
    cursor: string | undefined,
    onPayment: (payment: ObservedPayment) => Promise<void>,
  ): () => void;
}
