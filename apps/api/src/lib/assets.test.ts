import { AppError } from '@finance-os/shared';
import { describe, expect, it } from 'vitest';
import { TEST_USDC_ISSUER, testStellarContext } from '../../test/fake-stellar.js';
import { resolveAsset } from './assets.js';

describe('resolveAsset', () => {
  const ctx = testStellarContext();

  it('fills in the configured issuer', () => {
    expect(resolveAsset(ctx, 'USDC')).toEqual({ assetCode: 'USDC', assetIssuer: TEST_USDC_ISSUER });
    expect(resolveAsset(ctx, 'XLM')).toEqual({ assetCode: 'XLM', assetIssuer: null });
  });

  it('rejects assets not configured for the network', () => {
    expect(() => resolveAsset(ctx, 'EURC')).toThrow(AppError);
    expect(() => resolveAsset({ ...ctx, assets: { XLM: { code: 'XLM' } } }, 'USDC')).toThrow(
      /Unsupported/,
    );
  });
});
