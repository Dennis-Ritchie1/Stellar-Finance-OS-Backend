/**
 * The subset of Horizon `/accounts/{id}/payments?join=transactions` record
 * fields we rely on. Declared here so normalisation stays pure and testable.
 */
export interface HorizonTransactionJoin {
  hash: string;
  ledger: number;
  memo?: string;
  memo_type: 'none' | 'text' | 'id' | 'hash' | 'return';
  successful: boolean;
  created_at: string;
}

interface BaseRecord {
  id: string;
  paging_token: string;
  transaction_hash: string;
  transaction_successful: boolean;
  created_at: string;
  source_account: string;
  transaction?: HorizonTransactionJoin;
}

interface AssetFields {
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
  asset_code?: string;
  asset_issuer?: string;
}

export interface PaymentRecord extends BaseRecord, AssetFields {
  type: 'payment' | 'path_payment_strict_receive' | 'path_payment_strict_send';
  from: string;
  to: string;
  to_muxed?: string;
  to_muxed_id?: string;
  amount: string;
}

export interface AccountMergeRecord extends BaseRecord {
  type: 'account_merge';
  account: string;
  into: string;
  into_muxed_id?: string;
}

export interface CreateAccountRecord extends BaseRecord {
  type: 'create_account';
  funder: string;
  account: string;
  starting_balance: string;
}

export type HorizonPaymentRecord =
  | PaymentRecord
  | AccountMergeRecord
  | CreateAccountRecord
  | (BaseRecord & { type: string });
