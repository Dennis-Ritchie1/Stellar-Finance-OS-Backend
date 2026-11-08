import type { MatchMethod } from '@finance-os/shared';

/** Result of matching one transaction. Pure data — produced without I/O. */
export type MatchResult =
  | { kind: 'matched'; invoiceId: string; amount: string; method: MatchMethod; confidence: number }
  | { kind: 'suggested'; candidates: { invoiceId: string; score: number }[] }
  | { kind: 'flagged'; reason: 'wrong_asset' | 'overpayment' | 'unknown_reference' }
  | { kind: 'unmatched' };
