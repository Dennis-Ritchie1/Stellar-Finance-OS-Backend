import { parseArgs } from 'node:util';
import { PublicKeySchema } from '@finance-os/shared';

export interface BackfillArgs {
  account: string;
  /** Horizon paging token, or `ledger:<n>`. Omitted = from the beginning. */
  from?: string;
}

/** Parse `--account G... --from <cursor|ledger>`. */
export function parseBackfillArgs(argv: string[]): BackfillArgs {
  const { values } = parseArgs({
    args: argv,
    options: { account: { type: 'string' }, from: { type: 'string' } },
    strict: true,
  });
  const account = PublicKeySchema.parse(values.account);
  return values.from ? { account, from: values.from } : { account };
}
