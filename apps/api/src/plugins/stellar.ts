import type { AssetConfig } from '@finance-os/config';
import type { StellarNetwork } from '@finance-os/shared';
import type { Balance, SubmitResult } from '@finance-os/stellar';
import type { FastifyInstance } from 'fastify';

/** The network calls the API makes. Tests inject a fake. */
export interface StellarGateway {
  loadSequence(address: string): Promise<string>;
  getBalances(address: string): Promise<Balance[]>;
  submit(signedXdr: string): Promise<SubmitResult>;
}

export interface StellarContext {
  network: StellarNetwork;
  networkPassphrase: string;
  /** Assets invoices and payments may use on this network, keyed by code. */
  assets: Record<string, AssetConfig>;
  gateway: StellarGateway;
}

declare module 'fastify' {
  interface FastifyInstance {
    stellar: StellarContext;
  }
}

export function registerStellar(app: FastifyInstance, ctx: StellarContext): void {
  app.decorate('stellar', ctx);
}
