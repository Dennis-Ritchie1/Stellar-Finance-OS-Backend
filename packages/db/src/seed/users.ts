import argon2 from 'argon2';
import { DEMO_PASSWORD, DEMO_USERS } from './data.js';
import type { Tx } from './types.js';

/** Upsert demo users. Returns a map of email → user id. */
export async function seedUsers(tx: Tx): Promise<Map<string, string>> {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  const ids = new Map<string, string>();
  for (const u of DEMO_USERS) {
    const user = await tx.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, name: u.name, passwordHash },
    });
    ids.set(u.email, user.id);
  }
  return ids;
}
