import argon2 from 'argon2';

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

// Verified against when the email is unknown, so login takes the same time
// whether or not the account exists (no user enumeration via timing).
let dummyHash: Promise<string> | undefined;

/** Constant-work password check. `hash` is null when no user matched. */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword('not-a-real-password');
    await argon2.verify(await dummyHash, password);
    return false;
  }
  return argon2.verify(hash, password);
}
