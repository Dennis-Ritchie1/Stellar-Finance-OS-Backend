import { describe, expect, it } from 'vitest';
import * as f from './fixtures/records.js';
import { directionFor, normalizePaymentRecord } from './normalize.js';

describe('normalizePaymentRecord', () => {
  it('maps an issued-asset payment to a muxed address', () => {
    expect(normalizePaymentRecord(f.usdcToMuxed)).toEqual({
      txHash: 'a'.repeat(64),
      operationIndex: 1,
      pagingToken: f.usdcToMuxed.paging_token,
      ledger: 1234,
      createdAt: new Date('2026-11-01T10:00:00Z'),
      successful: true,
      memoType: 'none',
      operationType: 'payment',
      from: f.PAYER,
      to: f.TREASURY,
      muxedId: '18446744073709551615',
      assetCode: 'USDC',
      assetIssuer: f.ISSUER,
      amount: '100.5000000',
    });
  });

  it('maps native XLM and keeps the text memo', () => {
    const p = normalizePaymentRecord(f.xlmWithTextMemo)!;
    expect(p).toMatchObject({ assetCode: 'XLM', memo: 'INV0042', memoType: 'text' });
    expect(p.assetIssuer).toBeUndefined();
    expect(p.muxedId).toBeUndefined();
  });

  it('converts base64 hash memos to hex', () => {
    expect(normalizePaymentRecord(f.hashMemo)).toMatchObject({
      memoType: 'hash',
      memo: 'ab'.repeat(32),
    });
  });

  it('records failed path payments with their type', () => {
    expect(normalizePaymentRecord(f.pathPaymentOut)).toMatchObject({
      operationType: 'path_payment_strict_send',
      successful: false,
    });
  });

  it('needs the merged amount for account merges', () => {
    expect(normalizePaymentRecord(f.merge)).toBeNull();
    expect(normalizePaymentRecord(f.merge, '9.99')).toMatchObject({
      operationType: 'account_merge',
      from: f.PAYER,
      to: f.TREASURY,
      assetCode: 'XLM',
      amount: '9.9900000',
    });
  });

  it('ignores record types we do not track', () => {
    expect(normalizePaymentRecord(f.createAccount)).toBeNull();
  });

  it('derives direction relative to the watched account', () => {
    expect(directionFor(normalizePaymentRecord(f.usdcToMuxed)!, f.TREASURY)).toBe('in');
    expect(directionFor(normalizePaymentRecord(f.pathPaymentOut)!, f.TREASURY)).toBe('out');
  });
});
