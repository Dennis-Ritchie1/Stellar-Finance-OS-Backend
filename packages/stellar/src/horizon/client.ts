import { Horizon, TransactionBuilder } from '@stellar/stellar-sdk';
import { NATIVE_CODE, type AssetRef } from '../asset/asset.js';

export interface Balance extends AssetRef {
  /** Decimal string, 7 places. */
  balance: string;
}

export type SubmitResult =
  | { ok: true; hash: string; ledger: number }
  | { ok: false; hash: string | null; reason: string; resultCodes?: unknown };

/** Thin, typed wrapper over the Horizon calls the backend needs. */
export class HorizonClient {
  readonly server: Horizon.Server;

  constructor(
    url: string,
    private readonly networkPassphrase: string,
  ) {
    this.server = new Horizon.Server(url, { allowHttp: url.startsWith('http://') });
  }

  /** Current sequence number, for building the next transaction. */
  async loadSequence(address: string): Promise<string> {
    const account = await this.server.loadAccount(address);
    return account.sequenceNumber();
  }

  async getBalances(address: string): Promise<Balance[]> {
    const account = await this.server.loadAccount(address);
    return account.balances.flatMap((b): Balance[] => {
      if (b.asset_type === 'native') return [{ code: NATIVE_CODE, balance: b.balance }];
      if (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') {
        return [{ code: b.asset_code, issuer: b.asset_issuer, balance: b.balance }];
      }
      return []; // liquidity pool shares are not treasury balances
    });
  }

  /** Submit a signed envelope. Never throws for a rejected transaction. */
  async submit(signedXdr: string): Promise<SubmitResult> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const hash = Buffer.from(tx.hash()).toString('hex');
    try {
      const res = await this.server.submitTransaction(tx);
      return { ok: true, hash: res.hash, ledger: res.ledger };
    } catch (err) {
      const extras = (err as { response?: { data?: { extras?: { result_codes?: unknown } } } })
        .response?.data?.extras;
      return {
        ok: false,
        hash,
        reason: extras?.result_codes ? 'Transaction rejected by the network' : String(err),
        resultCodes: extras?.result_codes,
      };
    }
  }
}
