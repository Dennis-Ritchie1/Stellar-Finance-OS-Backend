import { Keypair, MuxedAccount } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { deriveMuxedAddress, invoiceMemo, newPublicToken } from './references.js';

describe('seed payment references', () => {
  it('derives a muxed address that round-trips to base account and id', () => {
    const g = Keypair.random().publicKey();
    const m = deriveMuxedAddress(g, 42n);
    const parsed = MuxedAccount.fromAddress(m, '0');
    expect(m.startsWith('M')).toBe(true);
    expect(parsed.baseAccount().accountId()).toBe(g);
    expect(parsed.id()).toBe('42');
  });

  it('builds short memo text from the payment ref id', () => {
    expect(invoiceMemo(42n)).toBe('INV42');
  });

  it('creates unguessable, url-safe public tokens', () => {
    const a = newPublicToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(a).not.toBe(newPublicToken());
  });
});
