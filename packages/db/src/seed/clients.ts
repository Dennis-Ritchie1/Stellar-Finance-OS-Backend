import { DEMO_CLIENTS } from './data.js';
import type { Tx } from './types.js';

export async function seedClients(tx: Tx, organizationId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const c of DEMO_CLIENTS) {
    const client = await tx.client.create({ data: { organizationId, ...c } });
    ids.push(client.id);
  }
  return ids;
}
