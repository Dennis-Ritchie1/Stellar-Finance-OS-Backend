import { describe, expect, it } from 'vitest';
import { EnvValidationError, parseEnv } from './load-env.js';

const valid = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/finance_os',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'change-me',
  HORIZON_URL: 'https://horizon-testnet.stellar.org',
  STELLAR_RPC_URL: 'https://soroban-testnet.stellar.org',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);
    expect(env.STELLAR_NETWORK).toBe('testnet');
    expect(env.API_PORT).toBe(3000);
    expect(env.INDEXER_POLL_INTERVAL_MS).toBe(30_000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects unknown networks', () => {
    expect(() => parseEnv({ ...valid, STELLAR_NETWORK: 'futurenet' })).toThrow(EnvValidationError);
  });

  it('lists every missing variable', () => {
    try {
      parseEnv({});
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(EnvValidationError);
      expect((err as EnvValidationError).issues.length).toBeGreaterThanOrEqual(5);
    }
  });
});
