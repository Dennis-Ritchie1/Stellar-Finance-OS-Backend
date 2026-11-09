import type {
  InvoiceStatus,
  MatchMethod,
  MemoType,
  TransactionDirection,
} from '@finance-os/shared';

/** The slice of a Transaction the matcher needs. Amounts are decimal strings. */
export interface MatchableTransaction {
  id: string;
  direction: TransactionDirection;
  assetCode: string;
  assetIssuer?: string | null;
  amount: string;
  memo?: string | null;
  memoType: MemoType;
  /** uint64 muxed id as a decimal string. */
  muxedId?: string | null;
  from: string;
  createdAt: Date;
}

export interface OpenInvoice {
  id: string;
  clientId: string;
  /** uint64 payment reference as a decimal string (Invoice.paymentRefId). */
  paymentRefId: string;
  assetCode: string;
  assetIssuer?: string | null;
  amount: string;
  amountPaid: string;
  status: InvoiceStatus;
  dueDate: Date;
}

export type ClientHistory = Record<string, { knownAddresses: string[] }>;

export interface MatchOptions {
  /** Max distance in days between payment time and invoice due date for a suggestion. Default 14. */
  suggestionWindowDays?: number;
  /** Max suggestions returned. Default 5. */
  maxSuggestions?: number;
}
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
      /** Amount credited to the invoice (capped at what was outstanding). */
      appliedAmount: string;
      /** Invoice balance still outstanding after this payment. */
      remaining: string;
      newStatus: 'partially_paid' | 'paid';
      /**
       * Excess over the outstanding balance, "0.0000000" when none. Overpayments are
       * applied (invoice → paid) and carry a non-zero overpaidBy so callers can flag them.
       */
      overpaidBy: string;
      method: MatchMethod;
      confidence: number;
    }
  | { kind: 'suggested'; candidates: { invoiceId: string; score: number }[] }
  | {
      kind: 'flagged';
      reason: 'wrong_asset' | 'overpayment' | 'unknown_reference';
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
