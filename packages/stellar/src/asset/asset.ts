import { Asset } from '@stellar/stellar-sdk';

/** How the rest of the codebase refers to an asset: XLM has no issuer. */
export interface AssetRef {
  code: string;
  issuer?: string | null;
}

export const NATIVE_CODE = 'XLM';

export function isNative(asset: AssetRef): boolean {
  return asset.code === NATIVE_CODE && !asset.issuer;
}

export function toSdkAsset(asset: AssetRef): Asset {
  if (isNative(asset)) return Asset.native();
  if (!asset.issuer) throw new Error(`Asset ${asset.code} needs an issuer`);
  return new Asset(asset.code, asset.issuer);
}

export function fromSdkAsset(asset: Asset): AssetRef {
  return asset.isNative()
    ? { code: NATIVE_CODE }
    : { code: asset.getCode(), issuer: asset.getIssuer() };
}

/** Same code AND same issuer. A USDC from the wrong issuer is a different asset. */
export function assetsEqual(a: AssetRef, b: AssetRef): boolean {
  return a.code === b.code && (a.issuer ?? null) === (b.issuer ?? null);
}

/** Stable string key, e.g. "XLM" or "USDC:GA...". */
export function assetKey(asset: AssetRef): string {
  return asset.issuer ? `${asset.code}:${asset.issuer}` : asset.code;
}
