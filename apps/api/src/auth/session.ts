import { createHash, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@finance-os/db';

export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Only the SHA-256 of a session token is stored; the raw token goes to the client once. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  prisma: PrismaClient,
  userId: string,
  ttlMs: number = DEFAULT_SESSION_TTL_MS,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlMs);
  await prisma.session.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });
  return { token, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  userId: string;
}

/** Returns the live (unexpired, unrevoked) session for a raw token, or null. */
export async function resolveSession(
  prisma: PrismaClient,
  token: string,
): Promise<ResolvedSession | null> {
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, revokedAt: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) return null;
  return { sessionId: session.id, userId: session.userId };
}

export async function revokeSession(prisma: PrismaClient, sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
