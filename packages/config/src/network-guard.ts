import type { Env } from './env.schema.js';

/**
 * AGENTS.md rule 8: testnet only until a human explicitly opts in.
 * Mainnet requires STELLAR_NETWORK=mainnet *and* ALLOW_MAINNET=true.
 */
export function assertNetworkAllowed(
  env: Pick<Env, 'STELLAR_NETWORK'>,
  source: Record<string, string | undefined> = process.env,
): void {
  if (env.STELLAR_NETWORK === 'mainnet' && source.ALLOW_MAINNET !== 'true') {
    throw new Error('Mainnet is disabled. Set ALLOW_MAINNET=true to opt in explicitly.');
  }
}
