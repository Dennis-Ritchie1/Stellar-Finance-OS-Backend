import { z } from 'zod';

export const StellarNetworkSchema = z.enum(['testnet', 'mainnet']);
export type StellarNetwork = z.infer<typeof StellarNetworkSchema>;
export const StellarNetworkValues = StellarNetworkSchema.options;
