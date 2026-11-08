import { getNetworkConfig } from '@finance-os/config';
import type { Balance, SubmitResult } from '@finance-os/stellar';
import { Keypair } from '@stellar/stellar-sdk';
import type { StellarContext, StellarGateway } from '../src/plugins/stellar.js';

/** A testnet issuer generated per run — never a real Circle issuer. */
export const TEST_USDC_ISSUER = Keypair.random().publicKey();

/** In-memory gateway: records submissions, returns canned balances/sequence. */
export class FakeGateway implements StellarGateway {
  sequence = '1000';
  balances = new Map<string, Balance[]>();
  submitted: string[] = [];
  nextSubmit: SubmitResult | null = null;

  async loadSequence(): Promise<string> {
    return this.sequence;
  }
  async getBalances(address: string): Promise<Balance[]> {
    return this.balances.get(address) ?? [];
  }
  async submit(xdr: string): Promise<SubmitResult> {
    this.submitted.push(xdr);
    return this.nextSubmit ?? { ok: true, hash: 'f'.repeat(64), ledger: 1 };
  }
}

export function testStellarContext(gateway: StellarGateway = new FakeGateway()): StellarContext {
  return {
    network: 'testnet',
    networkPassphrase: getNetworkConfig('testnet').passphrase,
    assets: { XLM: { code: 'XLM' }, USDC: { code: 'USDC', issuer: TEST_USDC_ISSUER } },
    gateway,
  };
}
