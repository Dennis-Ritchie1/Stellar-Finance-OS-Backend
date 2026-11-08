import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Walk up from `startDir` to find the nearest `.env`. Apps run with their own
 * package dir as cwd under turbo, but the `.env` lives at the monorepo root.
 */
export function findEnvFile(startDir: string = process.cwd()): string | undefined {
  let dir = startDir;
  for (;;) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
