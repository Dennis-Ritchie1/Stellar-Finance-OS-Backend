import {
  addAmounts,
  compareAmounts,
  parseInvoiceMemo,
  subtractAmounts,
  type MatchMethod,
} from '@finance-os/shared';
import type {
  ClientHistory,
  MatchableTransaction,
  MatchOptions,
  MatchResult,
  OpenInvoice,
  SuggestedCandidate,
} from './types.js';

const DEFAULT_DATE_WINDOW_DAYS = 14;
const MAX_CANDIDATES = 5;
const DAY_MS = 86_400_000;

/** Heuristic weights; same asset is a hard requirement, not a score. */
const SCORE_EXACT_AMOUNT = 0.5;
const SCORE_KNOWN_SENDER = 0.3;
const SCORE_DATE_WINDOW = 0.2;

/** Statuses that can receive a payment. draft/void/paid are treated as "not open". */
const PAYABLE = new Set<OpenInvoice['status']>(['sent', 'partially_paid', 'overdue']);

const sameAsset = (tx: MatchableTransaction, inv: OpenInvoice): boolean =>
  tx.assetCode === inv.assetCode && (tx.assetIssuer ?? null) === (inv.assetIssuer ?? null);

const outstanding = (inv: OpenInvoice): string =>
  compareAmounts(inv.amountPaid, inv.amount) >= 0 ? '0' : subtractAmounts(inv.amount, inv.amountPaid);

/**
 * Match one transaction to an invoice. Pure: no I/O, no clock. Priority order:
 * outgoing → muxed id → INV<ref> memo → heuristic suggestions → unmatched.
 */
export function matchTransaction(
  tx: MatchableTransaction,
  openInvoices: OpenInvoice[],
  history: ClientHistory,
  opts: MatchOptions = {},
): MatchResult {
  if (tx.direction !== 'in') return { kind: 'unmatched' };

  const ref = extractReference(tx);
  if (ref) {
    const invoice = openInvoices.find((i) => i.paymentRefId === ref.id);
    if (!invoice || !PAYABLE.has(invoice.status)) {
      return { kind: 'flagged', reason: 'unknown_reference' };
    }
    if (!sameAsset(tx, invoice)) {
      return { kind: 'flagged', reason: 'wrong_asset', invoiceId: invoice.id };
    }
    return applyPayment(tx, invoice, ref.method);
  }

  const candidates = suggest(tx, openInvoices, history, opts);
  return candidates.length > 0 ? { kind: 'suggested', candidates } : { kind: 'unmatched' };
}

/** Muxed id wins over memo; a reference that is present but unparseable is ignored. */
function extractReference(tx: MatchableTransaction): { id: string; method: MatchMethod } | null {
  if (tx.muxedId) return { id: tx.muxedId, method: 'muxed' };
  if (tx.memoType === 'text' && tx.memo) {
    const parsed = parseInvoiceMemo(tx.memo);
    if (parsed !== null) return { id: parsed.toString(), method: 'memo' };
  }
  return null;
}

function applyPayment(
  tx: MatchableTransaction,
  invoice: OpenInvoice,
  method: MatchMethod,
): MatchResult {
  const owed = outstanding(invoice);
  const over = compareAmounts(tx.amount, owed) > 0;
  const appliedAmount = over ? owed : tx.amount;
  const remaining = subtractAmounts(owed, appliedAmount);
  const paidInFull = compareAmounts(addAmounts(invoice.amountPaid, appliedAmount), invoice.amount) >= 0;
  return {
    kind: 'matched',
    invoiceId: invoice.id,
    amount: tx.amount,
    appliedAmount,
    remaining,
    newStatus: paidInFull ? 'paid' : 'partially_paid',
    ...(over ? { overpaidBy: subtractAmounts(tx.amount, owed) } : {}),
    method,
    confidence: 1,
  };
}

function suggest(
  tx: MatchableTransaction,
  invoices: OpenInvoice[],
  history: ClientHistory,
  opts: MatchOptions,
): SuggestedCandidate[] {
  const windowMs = (opts.dateWindowDays ?? DEFAULT_DATE_WINDOW_DAYS) * DAY_MS;
  const scored: SuggestedCandidate[] = [];
  for (const inv of invoices) {
    if (!PAYABLE.has(inv.status) || !sameAsset(tx, inv)) continue;
    let score = 0;
    if (compareAmounts(tx.amount, outstanding(inv)) === 0) score += SCORE_EXACT_AMOUNT;
    if (history[inv.clientId]?.knownAddresses.includes(tx.from)) score += SCORE_KNOWN_SENDER;
    if (Math.abs(tx.createdAt.getTime() - inv.dueDate.getTime()) <= windowMs) {
      score += SCORE_DATE_WINDOW;
    }
    // Same asset alone is not evidence; require at least one real signal.
    if (score > 0) scored.push({ invoiceId: inv.id, score: Math.round(score * 100) / 100 });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.invoiceId.localeCompare(b.invoiceId))
    .slice(0, MAX_CANDIDATES);
}
