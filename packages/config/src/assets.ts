import type { StellarNetwork } from '@finance-os/shared';

export interface AssetConfig {
  code: string;
  /** undefined for the native asset (XLM). */
  issuer?: string;
}

/**
 * Supported assets, keyed by network so testnet and mainnet can't be mixed.
 *
 * ⚠️ USDC issuers must come from Circle's official documentation for each
 * network — never copy them from examples. Until filled in here, they are
 * read from the USDC_ISSUER env var for the active network only.
 */
export function getAssets(
  network: StellarNetwork,
  overrides: { usdcIssuer?: string } = {},
): Record<string, AssetConfig> {
  const assets: Record<string, AssetConfig> = {
    XLM: { code: 'XLM' },
  };
  const usdcIssuer = overrides.usdcIssuer ?? KNOWN_USDC_ISSUERS[network];
  if (usdcIssuer) {
    assets.USDC = { code: 'USDC', issuer: usdcIssuer };
  }
  return assets;
}

/** Fill these from Circle's docs once verified. */
const KNOWN_USDC_ISSUERS: Record<StellarNetwork, string | undefined> = {
  testnet: undefined,
  mainnet: undefined,
};
