import type { HorizonPaymentRecord } from '../records.js';

export const TREASURY = 'GBTREASURYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const PAYER = 'GBPAYERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
export const ISSUER = 'GBISSUERAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

// 1234 << 32 | 5 << 12 | 2  → ledger 1234, second op of the tx
const OP_ID = ((1234n << 32n) | (5n << 12n) | 2n).toString();

const tx = {
  hash: 'a'.repeat(64),
  ledger: 1234,
  memo_type: 'none' as const,
  successful: true,
  created_at: '2026-11-01T10:00:00Z',
};

const base = {
  id: OP_ID,
  paging_token: OP_ID,
  transaction_hash: 'a'.repeat(64),
  transaction_successful: true,
  created_at: '2026-11-01T10:00:00Z',
  source_account: PAYER,
};

export const usdcToMuxed: HorizonPaymentRecord = {
  ...base,
  type: 'payment',
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: ISSUER,
  from: PAYER,
  to: TREASURY,
  to_muxed: 'M' + 'A'.repeat(68),
  to_muxed_id: '18446744073709551615',
  amount: '100.5000000',
  transaction: tx,
};

export const xlmWithTextMemo: HorizonPaymentRecord = {
  ...base,
  type: 'payment',
  asset_type: 'native',
  from: PAYER,
  to: TREASURY,
  amount: '12.0000000',
  transaction: { ...tx, memo_type: 'text', memo: 'INV0042' },
};

export const hashMemo: HorizonPaymentRecord = {
  ...xlmWithTextMemo,
  transaction: { ...tx, memo_type: 'hash', memo: Buffer.alloc(32, 0xab).toString('base64') },
} as HorizonPaymentRecord;

export const pathPaymentOut: HorizonPaymentRecord = {
  ...base,
  type: 'path_payment_strict_send',
  asset_type: 'credit_alphanum4',
  asset_code: 'USDC',
  asset_issuer: ISSUER,
  from: TREASURY,
  to: PAYER,
  amount: '5.0000000',
  transaction_successful: false,
  transaction: { ...tx, successful: false },
};

export const merge: HorizonPaymentRecord = {
  ...base,
  type: 'account_merge',
  account: PAYER,
  into: TREASURY,
  transaction: tx,
};

export const createAccount: HorizonPaymentRecord = {
  ...base,
  type: 'create_account',
  funder: TREASURY,
  account: PAYER,
  starting_balance: '2.0000000',
  transaction: tx,
};
