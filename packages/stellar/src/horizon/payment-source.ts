import type { ObservedPayment, PaymentPage, PaymentSource } from '../payment-source.js';
import type { HorizonClient } from './client.js';
import { normalizePaymentRecord } from './normalize.js';
import type { HorizonPaymentRecord } from './records.js';

/**
 * PaymentSource backed by Horizon's `/accounts/{id}/payments` endpoint,
 * joined with transactions so memos are available (README §6).
 */
export class HorizonPaymentSource implements PaymentSource {
  constructor(private readonly horizon: HorizonClient) {}

  /** account_merge amounts only appear in the operation's effects. */
  private async mergedAmount(record: HorizonPaymentRecord): Promise<string | undefined> {
    if (record.type !== 'account_merge') return undefined;
    const effects = await this.horizon.server.effects().forOperation(record.id).call();
    const credited = effects.records.find((e) => e.type === 'account_credited') as
      | { amount?: string }
      | undefined;
    return credited?.amount;
  }

  private async toPayment(record: HorizonPaymentRecord): Promise<ObservedPayment | null> {
    return normalizePaymentRecord(record, await this.mergedAmount(record));
  }

  async page(account: string, cursor: string | undefined, limit = 200): Promise<PaymentPage> {
    let req = this.horizon.server
      .payments()
      .forAccount(account)
      .join('transactions')
      .order('asc')
      .limit(limit);
    if (cursor) req = req.cursor(cursor);
    const res = await req.call();
    const records = res.records as unknown as HorizonPaymentRecord[];
    const payments: ObservedPayment[] = [];
    for (const r of records) {
      const p = await this.toPayment(r);
      if (p) payments.push(p);
    }
    return { payments, nextCursor: records.at(-1)?.paging_token ?? null };
  }

  stream(
    account: string,
    cursor: string | undefined,
    onPayment: (payment: ObservedPayment) => Promise<void>,
    onError: (err: unknown) => void = () => {},
  ): () => void {
    // Horizon pushes records faster than we may persist them; chain them so
    // each is fully handled before the next (cursor stays monotonic). If one
    // fails we stop: skipping it would let the cursor move past a gap.
    let chain: Promise<void> = Promise.resolve();
    let stopped = false;
    const fail = (err: unknown) => {
      if (stopped) return;
      stopped = true;
      close();
      onError(err);
    };
    const close: () => void = this.horizon.server
      .payments()
      .forAccount(account)
      .join('transactions')
      .cursor(cursor ?? 'now')
      .stream({
        onmessage: (record) => {
          chain = chain
            .then(async () => {
              if (stopped) return;
              const p = await this.toPayment(record as unknown as HorizonPaymentRecord);
              if (p) await onPayment(p);
            })
            .catch(fail);
        },
        onerror: fail,
      });
    return () => {
      stopped = true;
      close();
    };
  }
}
