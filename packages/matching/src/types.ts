import type { InvoiceStatus, MatchMethod, MemoType, TransactionDirection } from '@finance-os/shared';

/** The slice of a Transaction the engine needs. `amount` is a decimal string. */
export interface MatchableTransaction {
  id: string;
  direction: TransactionDirection;
  assetCode: string;
  assetIssuer?: string | null;
  amount: string;
  memo?: string | null;
  memoType: MemoType;
  /** Decimal string of the muxed id (as stored by the indexer). */
  muxedId?: string | null;
  from: string;
  createdAt: Date;
}

/** The slice of an Invoice the engine needs. Amounts are decimal strings. */
export interface OpenInvoice {
  id: string;
  clientId: string;
  /** Decimal string of the globally unique paymentRefId. */
  paymentRefId: string;
  assetCode: string;
  assetIssuer?: string | null;
  amount: string;
  amountPaid: string;
  status: InvoiceStatus;
  dueDate: Date;
}

/** Per-client known sender addresses. */
export type ClientHistory = Record<string, { knownAddresses: string[] }>;

export interface MatchOptions {
  /** Max distance (days) between tx.createdAt and invoice.dueDate for the date signal. Default 14. */
  dateWindowDays?: number;
}

export interface SuggestedCandidate {
  invoiceId: string;
  score: number;
}

/**
 * Result of matching one transaction. Pure data — produced without I/O.
 *
 * Overpayments are *applied and flagged*: the result is `matched` (invoice becomes `paid`,
 * `appliedAmount` = what was owed) and carries `overpaidBy` so the caller can surface the excess.
 * `suggested` is never auto-applied.
 */
export type MatchResult =
  | {
      kind: 'matched';
      invoiceId: string;
      /** Full transaction amount. */
      amount: string;
      /** Amount credited to the invoice (capped at the outstanding balance). */
      appliedAmount: string;
      /** Invoice balance still owed after this payment. */
      remaining: string;
      newStatus: 'partially_paid' | 'paid';
      /** Set only on overpayment: tx amount minus appliedAmount. */
      overpaidBy?: string;
      method: MatchMethod;
      confidence: number;
    }
  | { kind: 'suggested'; candidates: SuggestedCandidate[] }
  | {
      kind: 'flagged';
      reason: 'wrong_asset' | 'overpayment' | 'unknown_reference';
      /** Present for wrong_asset (the referenced invoice). */
      invoiceId?: string;
    }
  | { kind: 'unmatched' };
