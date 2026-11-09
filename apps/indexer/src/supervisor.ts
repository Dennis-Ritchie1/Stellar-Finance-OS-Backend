import type { PrismaClient } from '@finance-os/db';
import type { PaymentSource } from '@finance-os/stellar';
import type { StellarNetwork } from '@finance-os/shared';
import type { Logger } from './logger.js';
import { persistPayment, type WatchedAccount } from './persist.js';
import type { MatchQueue } from './queue.js';

export interface SupervisorOptions {
  prisma: PrismaClient;
  source: PaymentSource;
  queue: MatchQueue;
  network: StellarNetwork;
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
  pollIntervalMs: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
}

interface Entry {
  account: WatchedAccount;
  stopStream?: () => void;
  retryTimer?: NodeJS.Timeout;
  failures: number;
  stopped: boolean;
}

/** Exponential backoff: base * 2^failures, capped. */
export function backoffDelay(failures: number, base: number, max: number): number {
  return Math.min(max, base * 2 ** Math.min(failures, 30));
}

/**
 * Runs one payment stream per TreasuryAccount on the configured network,
 * picking up new accounts and dropping deleted ones every poll interval.
 */
export class Supervisor {
  private readonly entries = new Map<string, Entry>();
  private readonly inflight = new Set<Promise<unknown>>();
  private pollTimer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly backoffBase: number;
  private readonly backoffMax: number;

  constructor(private readonly opts: SupervisorOptions) {
    this.backoffBase = opts.backoffBaseMs ?? 1_000;
    this.backoffMax = opts.backoffMaxMs ?? 60_000;
  }

  get activeAccountIds(): string[] {
    return [...this.entries.keys()];
  }

  async start(): Promise<void> {
    this.running = true;
    await this.sync();
    this.scheduleNextPoll();
  }

  /** Stop streams and wait for in-flight writes to commit. */
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.pollTimer);
    for (const entry of this.entries.values()) this.halt(entry);
    this.entries.clear();
    await Promise.allSettled([...this.inflight]);
  }

  private scheduleNextPoll(): void {
    if (!this.running) return;
    this.pollTimer = setTimeout(() => {
      this.sync()
        .catch((err) => this.opts.log.error({ err }, 'account poll failed'))
        .finally(() => this.scheduleNextPoll());
    }, this.opts.pollIntervalMs);
  }

  /** Reconcile running streams with the TreasuryAccount table. */
  async sync(): Promise<void> {
    const rows = await this.opts.prisma.treasuryAccount.findMany({
      where: { network: this.opts.network },
      select: { id: true, organizationId: true, stellarAddress: true },
    });
    if (!this.running) return;
    const live = new Set(rows.map((r) => r.id));
    for (const [id, entry] of this.entries) {
      if (live.has(id)) continue;
      this.opts.log.info({ accountId: id }, 'treasury account removed; stopping stream');
      this.halt(entry);
      this.entries.delete(id);
    }
    for (const account of rows) {
      if (this.entries.has(account.id)) continue;
      this.opts.log.info({ accountId: account.id }, 'treasury account added; starting stream');
      const entry: Entry = { account, failures: 0, stopped: false };
      this.entries.set(account.id, entry);
      void this.open(entry);
    }
  }

  private halt(entry: Entry): void {
    entry.stopped = true;
    clearTimeout(entry.retryTimer);
    entry.stopStream?.();
    entry.stopStream = undefined;
  }

  /** (Re)open a stream from the last *persisted* cursor. */
  private async open(entry: Entry): Promise<void> {
    if (entry.stopped) return;
    try {
      const row = await this.opts.prisma.treasuryAccount.findUnique({
        where: { id: entry.account.id },
        select: { indexerCursor: true },
      });
      if (entry.stopped) return;
      if (!row) return; // deleted; the next poll drops the entry
      const stopStream = this.opts.source.stream(
        entry.account.stellarAddress,
        row.indexerCursor ?? undefined,
        (payment) => {
          const write = persistPayment(this.opts.prisma, entry.account, payment, this.opts.queue);
          this.inflight.add(write);
          return write
            .then(() => {
              entry.failures = 0;
            })
            .finally(() => this.inflight.delete(write));
        },
        (err) => this.onStreamError(entry, err),
      );
      if (entry.stopped) stopStream();
      else entry.stopStream = stopStream;
    } catch (err) {
      this.onStreamError(entry, err);
    }
  }

  private onStreamError(entry: Entry, err: unknown): void {
    if (entry.stopped) return;
    entry.stopStream = undefined;
    const delay = backoffDelay(entry.failures, this.backoffBase, this.backoffMax);
    entry.failures += 1;
    this.opts.log.error(
      { err, accountId: entry.account.id, retryInMs: delay, failures: entry.failures },
      'payment stream failed; will restart from persisted cursor',
    );
    entry.retryTimer = setTimeout(() => void this.open(entry), delay);
  }
}
