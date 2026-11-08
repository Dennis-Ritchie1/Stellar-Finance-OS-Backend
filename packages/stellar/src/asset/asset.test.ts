import { Asset, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { assetKey, assetsEqual, fromSdkAsset, isNative, toSdkAsset } from './asset.js';

const ISSUER = Keypair.random().publicKey();
const OTHER = Keypair.random().publicKey();

describe('asset helpers', () => {
  it('maps XLM to the native asset and back', () => {
    expect(toSdkAsset({ code: 'XLM' }).isNative()).toBe(true);
    expect(fromSdkAsset(Asset.native())).toEqual({ code: 'XLM' });
    expect(isNative({ code: 'XLM', issuer: null })).toBe(true);
  });

  it('round-trips an issued asset', () => {
    const sdk = toSdkAsset({ code: 'USDC', issuer: ISSUER });
    expect(fromSdkAsset(sdk)).toEqual({ code: 'USDC', issuer: ISSUER });
  });

  it('requires an issuer for non-native assets', () => {
    expect(() => toSdkAsset({ code: 'USDC' })).toThrow();
  });

  it('treats the same code from a different issuer as a different asset', () => {
    expect(assetsEqual({ code: 'USDC', issuer: ISSUER }, { code: 'USDC', issuer: ISSUER })).toBe(
      true,
    );
    expect(assetsEqual({ code: 'USDC', issuer: ISSUER }, { code: 'USDC', issuer: OTHER })).toBe(
      false,
    );
    expect(assetsEqual({ code: 'XLM', issuer: null }, { code: 'XLM' })).toBe(true);
  });

  it('builds stable keys', () => {
    expect(assetKey({ code: 'XLM' })).toBe('XLM');
    expect(assetKey({ code: 'USDC', issuer: ISSUER })).toBe(`USDC:${ISSUER}`);
  });
});
