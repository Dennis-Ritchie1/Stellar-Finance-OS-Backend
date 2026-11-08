import { describe, expect, it, vi } from 'vitest';
import type { HorizonClient } from './client.js';
import * as f from './fixtures/records.js';
import { HorizonPaymentSource } from './payment-source.js';
import type { HorizonPaymentRecord } from './records.js';

/** Minimal fake of the Horizon call builder chain. */
function fakeHorizon(opts: {
  pages?: HorizonPaymentRecord[];
  effects?: Array<{ type: string; amount?: string }>;
}) {
  const calls: Record<string, unknown> = {};
  let handlers: { onmessage: (r: unknown) => void; onerror: (e: unknown) => void } | undefined;
  const close = vi.fn();
  const builder = {
    forAccount: (a: string) => ((calls.account = a), builder),
    join: (j: string) => ((calls.join = j), builder),
    order: (o: string) => ((calls.order = o), builder),
    limit: (l: number) => ((calls.limit = l), builder),
    cursor: (c: string) => ((calls.cursor = c), builder),
    call: async () => ({ records: opts.pages ?? [] }),
    stream: (h: typeof handlers) => ((handlers = h), close),
  };
  const server = {
    payments: () => builder,
    effects: () => ({
      forOperation: () => ({ call: async () => ({ records: opts.effects ?? [] }) }),
    }),
  };
  return {
    client: { server } as unknown as HorizonClient,
    calls,
    close,
    emit: (r: HorizonPaymentRecord) => handlers!.onmessage(r),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const withToken = (r: HorizonPaymentRecord, token: string) =>
  ({ ...r, paging_token: token }) as HorizonPaymentRecord;

describe('HorizonPaymentSource', () => {
  it('pages oldest-first with joined transactions and returns the next cursor', async () => {
    const h = fakeHorizon({
      pages: [f.usdcToMuxed, f.createAccount, withToken(f.xlmWithTextMemo, '99')],
    });
    const page = await new HorizonPaymentSource(h.client).page(f.TREASURY, '10', 50);
    expect(h.calls).toEqual({
      account: f.TREASURY,
      join: 'transactions',
      order: 'asc',
      limit: 50,
      cursor: '10',
    });
    expect(page.payments).toHaveLength(2); // create_account skipped
    expect(page.nextCursor).toBe('99');
  });

  it('returns a null cursor for an empty page', async () => {
    const page = await new HorizonPaymentSource(fakeHorizon({}).client).page(f.TREASURY, undefined);
    expect(page).toEqual({ payments: [], nextCursor: null });
  });

  it('resolves account_merge amounts from effects', async () => {
    const h = fakeHorizon({
      pages: [f.merge],
      effects: [{ type: 'account_debited' }, { type: 'account_credited', amount: '3.5' }],
    });
    const page = await new HorizonPaymentSource(h.client).page(f.TREASURY, undefined);
    expect(page.payments[0]).toMatchObject({ operationType: 'account_merge', amount: '3.5000000' });
  });

  it('streams from "now" without a cursor and handles payments strictly in order', async () => {
    const h = fakeHorizon({});
    const seen: string[] = [];
    new HorizonPaymentSource(h.client).stream(f.TREASURY, undefined, async (p) => {
      await new Promise((r) => setTimeout(r, p.pagingToken === '1' ? 10 : 0));
      seen.push(p.pagingToken);
    });
    expect(h.calls.cursor).toBe('now');
    h.emit(withToken(f.usdcToMuxed, '1'));
    h.emit(withToken(f.usdcToMuxed, '2'));
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toEqual(['1', '2']);
  });

  it('stops at the first failure so the cursor never skips a payment', async () => {
    const h = fakeHorizon({});
    const seen: string[] = [];
    const onError = vi.fn();
    new HorizonPaymentSource(h.client).stream(
      f.TREASURY,
      '5',
      async (p) => {
        if (p.pagingToken === '2') throw new Error('db down');
        seen.push(p.pagingToken);
      },
      onError,
    );
    for (const t of ['1', '2', '3']) h.emit(withToken(f.usdcToMuxed, t));
    await flush();
    await flush();
    expect(seen).toEqual(['1']);
    expect(onError).toHaveBeenCalledOnce();
    expect(h.close).toHaveBeenCalled();
  });
});
