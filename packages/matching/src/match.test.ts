import { describe, expect, it } from 'vitest';
import { matchTransaction } from './match.js';
import type { MatchableTransaction, OpenInvoice } from './types.js';

const inv = (o: Partial<OpenInvoice> = {}): OpenInvoice => ({
  id: 'inv-1',
  clientId: 'c1',
  paymentRefId: '42',
  assetCode: 'USDC',
  assetIssuer: 'GISSUER',
  amount: '100',
  amountPaid: '0',
  status: 'sent',
  dueDate: new Date('2026-12-01T00:00:00Z'),
  ...o,
});
const tx = (o: Partial<MatchableTransaction> = {}): MatchableTransaction => ({
  id: 't1',
  direction: 'in',
  assetCode: 'USDC',
  assetIssuer: 'GISSUER',
  amount: '100',
  memoType: 'none',
  from: 'GSENDER',
  createdAt: new Date('2026-12-01T00:00:00Z'),
  ...o,
});

describe('matchTransaction', () => {
  it('matches an exact muxed payment', () => {
    expect(matchTransaction(tx({ muxedId: '42' }), [inv()], {})).toMatchObject({
      kind: 'matched',
      invoiceId: 'inv-1',
      method: 'muxed',
      confidence: 1,
      newStatus: 'paid',
      appliedAmount: '100.0000000',
      overpaidBy: '0.0000000',
    });
  });

  it('matches by memo, tolerating case and whitespace', () => {
    const r = matchTransaction(tx({ memoType: 'text', memo: ' inv42 ' }), [inv()], {});
    expect(r).toMatchObject({ kind: 'matched', method: 'memo' });
  });

  it('applies a partial payment', () => {
    expect(matchTransaction(tx({ muxedId: '42', amount: '30' }), [inv()], {})).toMatchObject({
      newStatus: 'partially_paid',
      appliedAmount: '30.0000000',
      remaining: '70.0000000',
    });
  });

  it('a second partial completes the invoice', () => {
    const r = matchTransaction(
      tx({ muxedId: '42', amount: '70' }),
      [inv({ amountPaid: '30', status: 'partially_paid' })],
      {},
    );
    expect(r).toMatchObject({ newStatus: 'paid', remaining: '0.0000000' });
  });

  it('applies and reports an overpayment', () => {
    expect(matchTransaction(tx({ muxedId: '42', amount: '125.5' }), [inv()], {})).toMatchObject({
      newStatus: 'paid',
      appliedAmount: '100.0000000',
      overpaidBy: '25.5000000',
    });
  });

  it('flags a wrong asset code and a wrong issuer, never matching', () => {
    expect(matchTransaction(tx({ muxedId: '42', assetCode: 'XLM' }), [inv()], {})).toEqual({
      kind: 'flagged',
      reason: 'wrong_asset',
      invoiceId: 'inv-1',
    });
    expect(
      matchTransaction(tx({ muxedId: '42', assetIssuer: 'GOTHER' }), [inv()], {}),
    ).toMatchObject({
      kind: 'flagged',
      reason: 'wrong_asset',
    });
  });

  it.each(['void', 'draft', 'paid'] as const)('flags a reference to a %s invoice', (status) => {
    expect(matchTransaction(tx({ muxedId: '42' }), [inv({ status })], {})).toEqual({
      kind: 'flagged',
      reason: 'unknown_reference',
    });
  });

  it('flags an unknown reference', () => {
    expect(matchTransaction(tx({ muxedId: '999' }), [inv()], {})).toMatchObject({
      reason: 'unknown_reference',
    });
  });

  it('ignores outgoing transactions', () => {
    expect(matchTransaction(tx({ direction: 'out', muxedId: '42' }), [inv()], {})).toEqual({
      kind: 'unmatched',
    });
  });

  it('muxed id wins over a conflicting memo', () => {
    const invoices = [inv(), inv({ id: 'inv-2', paymentRefId: '7' })];
    const r = matchTransaction(tx({ muxedId: '42', memoType: 'text', memo: 'INV7' }), invoices, {});
    expect(r).toMatchObject({ kind: 'matched', invoiceId: 'inv-1', method: 'muxed' });
  });

  it('suggests (never matches) when there is no reference', () => {
    const r = matchTransaction(tx(), [inv()], { c1: { knownAddresses: ['GSENDER'] } });
    expect(r).toEqual({ kind: 'suggested', candidates: [{ invoiceId: 'inv-1', score: 1 }] });
  });

  it('returns unmatched when nothing is plausible', () => {
    expect(matchTransaction(tx({ assetCode: 'XLM' }), [inv()], {})).toEqual({ kind: 'unmatched' });
    const far = tx({ amount: '5', createdAt: new Date('2025-01-01T00:00:00Z') });
    expect(matchTransaction(far, [inv()], {})).toEqual({ kind: 'unmatched' });
import type { ClientHistory, MatchableTransaction, OpenInvoice } from './types.js';

const ISSUER = 'GISSUER';
const tx = (o: Partial<MatchableTransaction> = {}): MatchableTransaction => ({
  id: 'tx1',
  direction: 'in',
  assetCode: 'USDC',
  assetIssuer: ISSUER,
  amount: '100.0000000',
  memo: null,
  memoType: 'none',
  muxedId: null,
  from: 'GSENDER',
  createdAt: new Date('2026-06-10T00:00:00Z'),
  ...o,
});
const inv = (o: Partial<OpenInvoice> = {}): OpenInvoice => ({
  id: 'inv42',
  clientId: 'c1',
  paymentRefId: '42',
  assetCode: 'USDC',
  assetIssuer: ISSUER,
  amount: '100.0000000',
  amountPaid: '0.0000000',
  status: 'sent',
  dueDate: new Date('2026-06-15T00:00:00Z'),
  ...o,
});
const history: ClientHistory = { c1: { knownAddresses: ['GSENDER'] } };

describe('matchTransaction — deterministic', () => {
  const cases: [string, MatchableTransaction, OpenInvoice[], object][] = [
    ['muxed exact', tx({ muxedId: '42' }), [inv()],
      { kind: 'matched', invoiceId: 'inv42', method: 'muxed', confidence: 1, appliedAmount: '100.0000000', remaining: '0.0000000', newStatus: 'paid' }],
    ['memo exact', tx({ memoType: 'text', memo: 'INV42' }), [inv()],
      { kind: 'matched', method: 'memo', newStatus: 'paid' }],
    ['memo lowercase + whitespace', tx({ memoType: 'text', memo: '  inv42 ' }), [inv()],
      { kind: 'matched', method: 'memo', newStatus: 'paid' }],
    ['partial payment', tx({ muxedId: '42', amount: '40' }), [inv()],
      { kind: 'matched', appliedAmount: '40', remaining: '60.0000000', newStatus: 'partially_paid' }],
    ['second partial completes invoice', tx({ muxedId: '42', amount: '60' }), [inv({ status: 'partially_paid', amountPaid: '40' })],
      { kind: 'matched', appliedAmount: '60', remaining: '0.0000000', newStatus: 'paid' }],
    ['overpayment applied and flagged via overpaidBy', tx({ muxedId: '42', amount: '130.5' }), [inv()],
      { kind: 'matched', amount: '130.5', appliedAmount: '100.0000000', remaining: '0.0000000', newStatus: 'paid', overpaidBy: '30.5000000' }],
    ['wrong asset code', tx({ muxedId: '42', assetCode: 'EURC' }), [inv()],
      { kind: 'flagged', reason: 'wrong_asset', invoiceId: 'inv42' }],
    ['wrong issuer, same code', tx({ muxedId: '42', assetIssuer: 'GOTHER' }), [inv()],
      { kind: 'flagged', reason: 'wrong_asset', invoiceId: 'inv42' }],
    ['voided invoice', tx({ muxedId: '42' }), [inv({ status: 'void' })],
      { kind: 'flagged', reason: 'unknown_reference' }],
    ['draft invoice', tx({ muxedId: '42' }), [inv({ status: 'draft' })],
      { kind: 'flagged', reason: 'unknown_reference' }],
    ['already paid invoice', tx({ muxedId: '42' }), [inv({ status: 'paid', amountPaid: '100' })],
      { kind: 'flagged', reason: 'unknown_reference' }],
    ['unknown id', tx({ muxedId: '999' }), [inv()],
      { kind: 'flagged', reason: 'unknown_reference' }],
    ['outgoing transaction', tx({ direction: 'out', muxedId: '42' }), [inv()], { kind: 'unmatched' }],
    ['muxed beats conflicting memo',
      tx({ muxedId: '42', memoType: 'text', memo: 'INV7' }),
      [inv(), inv({ id: 'inv7', paymentRefId: '7' })],
      { kind: 'matched', invoiceId: 'inv42', method: 'muxed' }],
  ];
  it.each(cases)('%s', (_n, t, invoices, expected) => {
    expect(matchTransaction(t, invoices, history)).toMatchObject(expected);
  });

  it('does not set overpaidBy on exact payment', () => {
    const r = matchTransaction(tx({ muxedId: '42' }), [inv()], history);
    expect(r).not.toHaveProperty('overpaidBy');
  });
});

describe('matchTransaction — suggestions', () => {
  it('one strong candidate, never "matched"', () => {
    const r = matchTransaction(tx(), [inv()], history);
    expect(r.kind).toBe('suggested');
    if (r.kind === 'suggested') expect(r.candidates).toEqual([{ invoiceId: 'inv42', score: 1 }]);
  });

  it('no candidates → unmatched', () => {
    expect(matchTransaction(tx(), [], history)).toEqual({ kind: 'unmatched' });
    expect(matchTransaction(tx({ assetCode: 'EURC' }), [inv()], history)).toEqual({ kind: 'unmatched' });
  });

  it('same asset with no other signal is not suggested', () => {
    const r = matchTransaction(
      tx({ amount: '5', from: 'GSTRANGER', createdAt: new Date('2027-01-01') }),
      [inv()],
      history,
    );
    expect(r.kind).toBe('unmatched');
  });

  it('sorts by score desc and caps at 5', () => {
    const invoices = Array.from({ length: 7 }, (_, i) =>
      inv({ id: `i${i}`, paymentRefId: `${i}`, amount: i === 3 ? '100' : '999' }),
    );
    const r = matchTransaction(tx(), invoices, history);
    expect(r.kind).toBe('suggested');
    if (r.kind === 'suggested') {
      expect(r.candidates).toHaveLength(5);
      expect(r.candidates[0]!.invoiceId).toBe('i3');
    }
  });
});
