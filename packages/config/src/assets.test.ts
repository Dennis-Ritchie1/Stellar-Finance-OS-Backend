import { describe, expect, it } from 'vitest';
import { getAssets } from './assets.js';
import { getNetworkConfig } from './network.js';

describe('assets', () => {
  it('always includes native XLM without issuer', () => {
    expect(getAssets('testnet').XLM).toEqual({ code: 'XLM' });
  });

  it('includes USDC only when an issuer is known', () => {
    const issuer = 'G' + 'B'.repeat(55);
    expect(getAssets('testnet', { usdcIssuer: issuer }).USDC?.issuer).toBe(issuer);
  });
});

describe('network config', () => {
  it('uses distinct passphrases per network', () => {
    expect(getNetworkConfig('testnet').passphrase).not.toBe(getNetworkConfig('mainnet').passphrase);
  });

  it('only exposes friendbot on testnet', () => {
    expect(getNetworkConfig('mainnet').friendbotUrl).toBeUndefined();
  });
});
