import { Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { sep53Hash, verifySignedMessage } from './signed-message.js';

const kp = Keypair.random();
const msg = 'finance-os wants you to link this wallet.\nNonce: abc123';
const signed = (k: Keypair, m: string) => k.sign(sep53Hash(m)).toString('base64');

describe('verifySignedMessage', () => {
  it('accepts a SEP-53 signature by the address owner', () => {
    expect(verifySignedMessage(kp.publicKey(), msg, signed(kp, msg))).toBe(true);
  });

  it('rejects a signature over a different message or by another key', () => {
    expect(verifySignedMessage(kp.publicKey(), msg + '!', signed(kp, msg))).toBe(false);
    expect(verifySignedMessage(kp.publicKey(), msg, signed(Keypair.random(), msg))).toBe(false);
  });

  it('rejects a signature over the raw, unprefixed message', () => {
    const raw = kp.sign(Buffer.from(msg)).toString('base64');
    expect(verifySignedMessage(kp.publicKey(), msg, raw)).toBe(false);
  });

  it('returns false for malformed input instead of throwing', () => {
    expect(verifySignedMessage('not-a-key', msg, signed(kp, msg))).toBe(false);
    expect(verifySignedMessage(kp.publicKey(), msg, 'short')).toBe(false);
  });
});
