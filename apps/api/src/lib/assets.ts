import { badRequest } from '@finance-os/shared';
import type { StellarContext } from '../plugins/stellar.js';

export interface ResolvedAsset {
  assetCode: string;
  assetIssuer: string | null;
}

/**
 * Resolve an asset code to the issuer configured for this network
 * (packages/config/assets.ts). Clients never choose the issuer, so a USDC
 * from a lookalike issuer can't be invoiced or paid.
 */
export function resolveAsset(stellar: StellarContext, code: string): ResolvedAsset {
  const asset = stellar.assets[code];
  if (!asset) {
    throw badRequest(`Unsupported asset ${code} on ${stellar.network}`, {
      supported: Object.keys(stellar.assets),
    });
  }
  return { assetCode: asset.code, assetIssuer: asset.issuer ?? null };
}
