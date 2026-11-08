/**
 * Demo data for local development. Testnet only.
 * Passwords here are for local dev logins and must never be used elsewhere.
 */
export const DEMO_ORG = { name: 'Demo Trading Co', slug: 'demo' } as const;

export const DEMO_PASSWORD = 'demo-password';

export const DEMO_USERS = [
  { email: 'owner@demo.test', name: 'Olu Owner', role: 'owner' },
  { email: 'admin@demo.test', name: 'Ada Admin', role: 'admin' },
  { email: 'approver1@demo.test', name: 'Ayo Approver', role: 'approver' },
  { email: 'approver2@demo.test', name: 'Bisi Approver', role: 'approver' },
  { email: 'accountant@demo.test', name: 'Chidi Accountant', role: 'accountant' },
  { email: 'viewer@demo.test', name: 'Vic Viewer', role: 'viewer' },
] as const;

export type DemoRole = (typeof DEMO_USERS)[number]['role'];
