import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
  type Transaction,
} from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { buildPaymentTransaction, type PaymentIntent } from './build-payment.js';
import { verifySignedPayment } from './verify-payment.js';

const signer = Keypair.random();
const issuer = Keypair.random().publicKey();
const vendor = Keypair.random().publicKey();
const attacker = Keypair.random().publicKey();
const passphrase = Networks.TESTNET;

const intent: PaymentIntent = {
  source: signer.publicKey(),
  destination: vendor,
  asset: { code: 'USDC', issuer },
  amount: '250',
  memo: { type: 'text', value: 'PO-77' },
};

const sign = (xdr: string, network = passphrase) => {
  const tx = TransactionBuilder.fromXDR(xdr, network) as Transaction;
  tx.sign(signer);
  return tx.toXDR();
};

/** Build a tampered variant of the approved payment. */
const tampered = (patch: Partial<PaymentIntent>, extraOp = false) => {
  const p = { ...intent, ...patch };
  const b = new TransactionBuilder(new Account(p.source, '1'), {
    fee: '100',
    networkPassphrase: passphrase,
    memo: p.memo?.type === 'text' ? Memo.text(p.memo.value!) : Memo.none(),
  })
    .addOperation(
      Operation.payment({
        destination: p.destination,
        asset: p.asset.issuer ? new Asset(p.asset.code, p.asset.issuer) : Asset.native(),
        amount: p.amount,
      }),
    )
    .setTimeout(300);
  if (extraOp) {
    b.addOperation(
      Operation.payment({ destination: attacker, asset: Asset.native(), amount: '1000' }),
    );
  }
  return sign(b.build().toXDR());
};

describe('verifySignedPayment', () => {
  const built = buildPaymentTransaction(intent, { networkPassphrase: passphrase, sequence: '1' });

  it('accepts the exact transaction it built, once signed', () => {
    const res = verifySignedPayment(sign(built.xdr), intent, {
      networkPassphrase: passphrase,
      expectedHash: built.hash,
    });
    expect(res.ok).toBe(true);
    expect(res.ok && res.hash).toBe(built.hash);
  });

  it('rejects the unsigned transaction', () => {
    const res = verifySignedPayment(built.xdr, intent, { networkPassphrase: passphrase });
    expect(res).toEqual({ ok: false, errors: ['Transaction is not signed'] });
  });

  it.each<[string, Partial<PaymentIntent>, string]>([
    ['destination', { destination: attacker }, 'Destination differs'],
    ['amount', { amount: '2500' }, 'Amount differs'],
    ['asset issuer', { asset: { code: 'USDC', issuer: attacker } }, 'Asset differs'],
    ['asset', { asset: { code: 'XLM' } }, 'Asset differs'],
    ['memo', { memo: { type: 'text', value: 'other' } }, 'Memo differs'],
    ['dropped memo', { memo: { type: 'none' } }, 'Memo differs'],
  ])('rejects a tampered %s', (_name, patch, error) => {
    const res = verifySignedPayment(tampered(patch), intent, { networkPassphrase: passphrase });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.errors).toContain(error);
  });

  it('rejects a signature from a key that is not an allowed signer', () => {
    const tx = TransactionBuilder.fromXDR(built.xdr, passphrase) as Transaction;
    tx.sign(Keypair.random());
    const res = verifySignedPayment(tx.toXDR(), intent, { networkPassphrase: passphrase });
    expect(!res.ok && res.errors).toEqual([
      'No valid signature from an allowed signer for this network',
    ]);
  });

  it('accepts a configured multisig signer', () => {
    const cosigner = Keypair.random();
    const tx = TransactionBuilder.fromXDR(built.xdr, passphrase) as Transaction;
    tx.sign(cosigner);
    const res = verifySignedPayment(tx.toXDR(), intent, {
      networkPassphrase: passphrase,
      allowedSigners: [signer.publicKey(), cosigner.publicKey()],
    });
    expect(res.ok).toBe(true);
  });

  it('rejects an extra smuggled operation', () => {
    const res = verifySignedPayment(tampered({}, true), intent, { networkPassphrase: passphrase });
    expect(!res.ok && res.errors).toContain('Expected exactly 1 operation, found 2');
  });

  it('rejects a field-identical transaction that is not the one we built', () => {
    const res = verifySignedPayment(tampered({}), intent, {
      networkPassphrase: passphrase,
      expectedHash: built.hash,
    });
    expect(!res.ok && res.errors).toEqual([
      'Transaction differs from the one built for this request',
    ]);
  });

  it('rejects XDR for another network and garbage input', () => {
    const mainnet = buildPaymentTransaction(intent, {
      networkPassphrase: Networks.PUBLIC,
      sequence: '1',
    });
    const res = verifySignedPayment(sign(mainnet.xdr, Networks.PUBLIC), intent, {
      networkPassphrase: passphrase,
      expectedHash: built.hash,
    });
    expect(!res.ok && res.errors).toEqual([
      'No valid signature from an allowed signer for this network',
    ]);
    expect(verifySignedPayment('not-xdr', intent, { networkPassphrase: passphrase })).toEqual({
      ok: false,
      errors: ['Not a valid transaction envelope'],
    });
  });
});
