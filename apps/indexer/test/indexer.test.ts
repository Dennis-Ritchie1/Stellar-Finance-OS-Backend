import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBackfill } from '../src/backfill-run.js';
import { ledgerToCursor, resolveFrom } from '../src/cursor.js';
import { persistPayment } from '../src/persist.js';
import { Supervisor } from '../src/supervisor.js';
import {
  FakePaymentSource,
  RecordingQueue,
  newAddress,
  payment,
  seedAccount,
  startRedis,
  startTestDatabase,
  waitFor,
  type TestDatabase,
} from './helpers.js';
import { deriveMuxedAddress } from '@finance-os/stellar';

let db: TestDatabase;
let redis: Awaited<ReturnType<typeof startRedis>>;
const quiet = { info() {}, warn() {}, error() {} };

beforeAll(async () => {
  [db, redis] = await Promise.all([startTestDatabase(), startRedis()]);
});
afterAll(async () => {
  await Promise.all([db.stop(), redis.stop()]);
});

const cursorOf = async (id: string) =>
  (await db.prisma.treasuryAccount.findUniqueOrThrow({ where: { id } })).indexerCursor;

describe('persistPayment', () => {
  it('delivered twice → one Transaction row and one queued job', async () => {
    const { account } = await seedAccount(db);
    const p = payment(1, account.stellarAddress);
    await persistPayment(db.prisma, account, p, redis.queue);
    await persistPayment(db.prisma, account, p, redis.queue);

    expect(await db.prisma.transaction.count({ where: { txHash: p.txHash } })).toBe(1);
    const row = await db.prisma.transaction.findFirstOrThrow({ where: { txHash: p.txHash } });
    expect(row).toMatchObject({
      organizationId: account.organizationId,
      treasuryAccountId: account.id,
      direction: 'in',
      status: 'success',
    });
    expect(row.amount.toFixed(7)).toBe('12.5000000');

    const inspect = new Queue('match-transaction', { connection: new Redis(redis.url) });
    const jobs = await inspect.getJobs(['waiting', 'delayed', 'active', 'completed']);
    expect(jobs.filter((j) => j.id === `${p.txHash}-0`)).toHaveLength(1);
    await inspect.close();
  });

  it('never moves the cursor backwards', async () => {
    const { account } = await seedAccount(db);
    const q = new RecordingQueue();
    const [a, b] = [payment(2, account.stellarAddress), payment(3, account.stellarAddress)];
    await persistPayment(db.prisma, account, b, q);
    await persistPayment(db.prisma, account, a, q);
    expect(await cursorOf(account.id)).toBe(b.pagingToken);
  });

  it('stores muxedId and classifies a muxed destination as in', async () => {
    const { account } = await seedAccount(db);
    const muxed = deriveMuxedAddress(account.stellarAddress, 18446744073709551615n);
    const p = payment(4, muxed, { muxedId: '18446744073709551615' });
    await persistPayment(db.prisma, account, p, new RecordingQueue());
    const row = await db.prisma.transaction.findFirstOrThrow({ where: { txHash: p.txHash } });
    expect(row).toMatchObject({ direction: 'in', muxedId: '18446744073709551615' });
  });

  it('records outgoing, failed and self payments', async () => {
    const { account } = await seedAccount(db);
    const q = new RecordingQueue();
    const out = payment(5, newAddress(), { from: account.stellarAddress, successful: false });
    const self = payment(6, account.stellarAddress, { from: account.stellarAddress });
    await persistPayment(db.prisma, account, out, q);
    await persistPayment(db.prisma, account, self, q);
    const rows = await db.prisma.transaction.findMany({ where: { treasuryAccountId: account.id } });
    expect(rows.find((r) => r.txHash === out.txHash)).toMatchObject({
      direction: 'out',
      status: 'failed',
    });
    expect(rows.filter((r) => r.txHash === self.txHash)).toHaveLength(1);
    expect(rows.find((r) => r.txHash === self.txHash)?.direction).toBe('in');
  });
});

describe('Supervisor', () => {
  const make = (source: FakePaymentSource, queue = new RecordingQueue(), prisma = db.prisma) =>
    new Supervisor({
      prisma,
      source,
      queue,
      network: 'testnet',
      log: quiet,
      pollIntervalMs: 100,
      backoffBaseMs: 20,
      backoffMaxMs: 100,
    });

  it('failure persisting N leaves cursor at N-1; restart processes N and N+1', async () => {
    const { account } = await seedAccount(db);
    const addr = account.stellarAddress;
    const [p1, p2, p3] = [1, 2, 3].map((n) => payment(10 + n, addr));
    const source = new FakePaymentSource();
    source.push(addr, p1!, p2!, p3!);

    // The DB transaction for p2 fails once (armed after p1 is enqueued).
    let armed = false;
    let failed = false;
    let cursorAtFailure: string | null | undefined;
    const flaky = new Proxy(db.prisma, {
      get(target, prop, receiver) {
        if (prop === '$transaction') {
          return (...args: unknown[]) => {
            if (armed && !failed) {
              failed = true;
              return cursorOf(account.id).then((c) => {
                cursorAtFailure = c;
                throw new Error('boom');
              });
            }
            return (target.$transaction as (...a: unknown[]) => unknown)(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const queue = new RecordingQueue();
    const origEnqueue = queue.enqueue.bind(queue);
    queue.enqueue = async (job) => {
      await origEnqueue(job);
      if (job.txHash === p1!.txHash) armed = true;
    };

    const sup = make(source, queue, flaky);
    await sup.start();
    await waitFor(async () => cursorAtFailure !== undefined);
    expect(cursorAtFailure).toBe(p1!.pagingToken);

    // Supervisor restarts the stream from the persisted cursor.
    await waitFor(
      async () =>
        (await db.prisma.transaction.count({ where: { treasuryAccountId: account.id } })) === 3,
    );
    await sup.stop();
    expect(await cursorOf(account.id)).toBe(p3!.pagingToken);
    expect(source.streams.filter((s) => s.account === addr).map((s) => s.cursor)).toEqual([
      undefined,
      p1!.pagingToken,
    ]);
    expect(queue.jobs.map((j) => j.txHash)).toEqual([p1!.txHash, p2!.txHash, p3!.txHash]);
  });

  it('starts streaming an account created after start within one poll', async () => {
    const source = new FakePaymentSource();
    const sup = make(source);
    await sup.start();
    const { account } = await seedAccount(db);
    const p = payment(20, account.stellarAddress);
    source.push(account.stellarAddress, p);
    await waitFor(async () =>
      db.prisma.transaction.findFirst({ where: { treasuryAccountId: account.id } }),
    );
    expect(sup.activeAccountIds).toContain(account.id);

    // Deleted accounts lose their stream.
    await db.prisma.transaction.deleteMany({ where: { treasuryAccountId: account.id } });
    await db.prisma.treasuryAccount.delete({ where: { id: account.id } });
    await waitFor(async () => !sup.activeAccountIds.includes(account.id));
    await sup.stop();
  });
});

describe('backfill', () => {
  it('imports every page, and a second run creates no duplicates', async () => {
    const { account } = await seedAccount(db);
    const addr = account.stellarAddress;
    const source = new FakePaymentSource();
    source.push(addr, ...Array.from({ length: 450 }, (_, i) => payment(100 + i, addr)));
    const q = new RecordingQueue();
    const run = () =>
      runBackfill({
        prisma: db.prisma,
        source,
        queue: q,
        network: 'testnet',
        log: quiet,
        address: addr,
      });

    expect(await run()).toEqual({ payments: 450, pages: 3 });
    await run();
    expect(await db.prisma.transaction.count({ where: { treasuryAccountId: account.id } })).toBe(
      450,
    );
  });

  it('rejects an address that is not a treasury account', async () => {
    await expect(
      runBackfill({
        prisma: db.prisma,
        source: new FakePaymentSource(),
        queue: new RecordingQueue(),
        network: 'testnet',
        log: quiet,
        address: newAddress(),
      }),
    ).rejects.toThrow(/not a TreasuryAccount/);
  });
});

describe('cursor helpers', () => {
  it('resolves ledger:<n> and raw tokens', () => {
    expect(ledgerToCursor(1)).toBe('4294967296');
    expect(resolveFrom('ledger:2')).toBe('8589934592');
    expect(resolveFrom('123')).toBe('123');
    expect(resolveFrom(undefined)).toBeUndefined();
    expect(() => resolveFrom('nope')).toThrow();
  });
});
