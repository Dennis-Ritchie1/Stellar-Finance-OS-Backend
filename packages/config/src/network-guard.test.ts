import { describe, expect, it } from 'vitest';
import { assertNetworkAllowed } from './network-guard.js';

describe('assertNetworkAllowed', () => {
  it('allows testnet', () => {
    expect(() => assertNetworkAllowed({ STELLAR_NETWORK: 'testnet' }, {})).not.toThrow();
  });

  it('blocks mainnet without explicit opt-in', () => {
    expect(() => assertNetworkAllowed({ STELLAR_NETWORK: 'mainnet' }, {})).toThrow(/Mainnet/);
  });

  it('allows mainnet with ALLOW_MAINNET=true', () => {
    expect(() =>
      assertNetworkAllowed({ STELLAR_NETWORK: 'mainnet' }, { ALLOW_MAINNET: 'true' }),
    ).not.toThrow();
  });
});
