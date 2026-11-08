import { Keypair, Networks, TransactionBuilder, type Transaction } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { deriveMuxedAddress } from '../address/muxed.js';
import { fromSdkMemo } from '../memo/memo.js';
import { buildPaymentTransaction } from './build-payment.js';

const SOURCE = Keypair.random().publicKey();
const DEST = Keypair.random().publicKey();
const ISSUER = Keypair.random().publicKey();
const opts = { networkPassphrase: Networks.TESTNET, sequence: '100' };

const decode = (xdr: string) =>
  TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

describe('buildPaymentTransaction', () => {
  it('builds an unsigned single payment with the exact amount and asset', () => {
    const built = buildPaymentTransaction(
      { source: SOURCE, destination: DEST, asset: { code: 'USDC', issuer: ISSUER }, amount: '125.5' },
      opts,
    );
    const tx = decode(built.xdr);
    expect(tx.signatures).toHaveLength(0);
    expect(tx.source).toBe(SOURCE);
    expect(tx.sequence).toBe('101');
    expect(tx.operations).toHaveLength(1);
    const op = tx.operations[0]!;
    expect(op).toMatchObject({ type: 'payment', destination: DEST, amount: '125.5000000' });
    expect(op.type === 'payment' && op.asset.getIssuer()).toBe(ISSUER);
    expect(built.hash).toBe(tx.hash().toString('hex'));
  });

  it('sets the memo and supports muxed destinations', () => {
    const m = deriveMuxedAddress(DEST, 9n);
    const tx = decode(
      buildPaymentTransaction(
        {
          source: SOURCE,
          destination: m,
          asset: { code: 'XLM' },
          amount: '1',
          memo: { type: 'text', value: 'INV0042' },
        },
        opts,
      ).xdr,
    );
    expect(fromSdkMemo(tx.memo)).toEqual({ type: 'text', value: 'INV0042' });
    expect(tx.operations[0]).toMatchObject({ destination: m });
  });

  it('expires after the requested timeout', () => {
    const before = Math.floor(Date.now() / 1000);
    const tx = decode(
      buildPaymentTransaction(
        { source: SOURCE, destination: DEST, asset: { code: 'XLM' }, amount: '1' },
        { ...opts, timeoutSeconds: 60 },
      ).xdr,
    );
    const max = Number(tx.timeBounds?.maxTime);
    expect(max).toBeGreaterThanOrEqual(before + 60);
    expect(max).toBeLessThanOrEqual(before + 62);
  });

  it('rejects amounts with more than 7 decimals instead of rounding', () => {
    expect(() =>
      buildPaymentTransaction(
        { source: SOURCE, destination: DEST, asset: { code: 'XLM' }, amount: '1.00000001' },
        opts,
      ),
    ).toThrow();
  });
});
