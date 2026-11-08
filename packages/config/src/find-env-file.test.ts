import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findEnvFile } from './find-env-file.js';

describe('findEnvFile', () => {
  it('finds a .env in an ancestor directory', () => {
    const root = mkdtempSync(join(tmpdir(), 'env-'));
    writeFileSync(join(root, '.env'), 'X=1');
    const nested = join(root, 'apps', 'api');
    mkdirSync(nested, { recursive: true });
    expect(findEnvFile(nested)).toBe(join(root, '.env'));
  });
});
