// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/.turbo/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // AGENTS.md rule 2: amounts are strings/Decimal, never JS floats.
      'no-restricted-globals': [
        'error',
        { name: 'parseFloat', message: 'Amounts must use Decimal, never floats (AGENTS.md #2).' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Number', property: 'parseFloat', message: 'Use Decimal for amounts.' },
      ],
    },
  },
  {
    // AGENTS.md rule 4: the matching engine stays pure.
    files: ['packages/matching/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@prisma/*', '@finance-os/db'], message: 'matching must not touch the DB.' },
            { group: ['@stellar/stellar-sdk', 'node:http', 'node:https'], message: 'matching must not do I/O.' },
          ],
        },
      ],
    },
  },
  prettier,
);
