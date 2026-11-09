import { startTestDatabase, type TestDatabase } from '@finance-os/db/testing';
import type { ObservedPayment, PaymentPage, PaymentSource } from '@finance-os/stellar';
import { Keypair } from '@stellar/stellar-sdk';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import type { MatchJob, MatchQueue } from '../src/queue.js';
import { createBullMatchQueue } from '../src/queue.js';

export { startTestDatabase, type TestDatabase };

export const newAddress = () => Keypair.random().publicKey();

/** Build a payment whose paging token grows with `n` (TOID-sized numbers). */
export function payment(
  n: number,
  to: string,
  overrides: Partial<ObservedPayment> = {},
): ObservedPayment {
  return {
    txHash: n.toString(16).padStart(64, '0'),
    operationIndex: 0,
    pagingToken: ((BigInt(1000 + n) << 32n) | 4097n).toString(),
    operationType: 'payment',
    from: newAddress(),
    to,
    assetCode: 'XLM',
    amount: '12.5000000',
    memoType: 'none',
    ledger: 1000 + n,
    createdAt: new Date('2026-11-01T10:00:00Z'),
    successful: true,
    ...overrides,
  };
}

/** Records jobs; optionally dedupes by id like BullMQ. */
export class RecordingQueue implements MatchQueue {
  jobs: MatchJob[] = [];
  async enqueue(job: MatchJob) {
    this.jobs.push(job);
  }
  async close() {}
}

/**
 * Behaves like HorizonPaymentSource.stream: serialised in-order delivery,
 * stops at the first failed handler and reports it via onError.
 */
export class FakePaymentSource implements PaymentSource {
  readonly streams: Array<{ account: string; cursor: string | undefined }> = [];
  private readonly history = new Map<string, ObservedPayment[]>();
  private readonly pumps = new Set<() => void>();

  push(account: string, ...payments: ObservedPayment[]) {
    this.history.set(account, [...(this.history.get(account) ?? []), ...payments]);
    for (const pump of this.pumps) pump();
  }

  async page(account: string, cursor: string | undefined, limit = 200): Promise<PaymentPage> {
    const all = (this.history.get(account) ?? []).filter(
      (p) => cursor === undefined || BigInt(p.pagingToken) > BigInt(cursor),
    );
    const payments = all.slice(0, limit);
    return { payments, nextCursor: payments.at(-1)?.pagingToken ?? null };
  }

  stream(
    account: string,
    cursor: string | undefined,
    onPayment: (p: ObservedPayment) => Promise<void>,
    onError: (err: unknown) => void = () => {},
  ): () => void {
    this.streams.push({ account, cursor });
    let last = cursor;
    let stopped = false;
    let running = false;
    const pump = () => {
      if (running || stopped) return;
      running = true;
      void (async () => {
        try {
          for (;;) {
            const next = (this.history.get(account) ?? []).find(
              (p) => last === undefined || BigInt(p.pagingToken) > BigInt(last),
            );
            if (!next || stopped) break;
            await onPayment(next);
            last = next.pagingToken;
          }
        } catch (err) {
          stopped = true;
          this.pumps.delete(pump);
          onError(err);
        } finally {
          running = false;
        }
      })();
    };
    this.pumps.add(pump);
    queueMicrotask(pump);
    return () => {
      stopped = true;
      this.pumps.delete(pump);
    };
  }
}

export async function waitFor<T>(
  fn: () => Promise<T | false | undefined> | T | false | undefined,
  ms = 10_000,
): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

export async function startRedis() {
  const container: StartedTestContainer = await new GenericContainer('redis:7-alpine')
    .withExposedPorts(6379)
    .start();
  const url = `redis://${container.getHost()}:${container.getMappedPort(6379)}`;
  const queue = createBullMatchQueue(url);
  return {
    url,
    queue,
    stop: async () => {
      await queue.close();
      await container.stop();
    },
  };
}

export async function seedAccount(db: TestDatabase, address = newAddress()) {
  const org = await db.prisma.organization.create({
    data: { name: 'Acme', slug: `acme-${Math.random().toString(36).slice(2)}` },
  });
  const account = await db.prisma.treasuryAccount.create({
    data: { organizationId: org.id, stellarAddress: address, label: 'Main', network: 'testnet' },
  });
  return { org, account };
}
