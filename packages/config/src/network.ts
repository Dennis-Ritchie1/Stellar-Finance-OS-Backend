import type { StellarNetwork } from '@finance-os/shared';

export interface NetworkConfig {
  network: StellarNetwork;
  passphrase: string;
  friendbotUrl?: string;
}

export const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  testnet: {
    network: 'testnet',
    passphrase: 'Test SDF Network ; September 2015',
    friendbotUrl: 'https://friendbot.stellar.org',
  },
  mainnet: {
    network: 'mainnet',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
};

export function getNetworkConfig(network: StellarNetwork): NetworkConfig {
  return NETWORKS[network];
}
