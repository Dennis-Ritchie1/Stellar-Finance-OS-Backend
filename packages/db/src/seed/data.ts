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

export const DEMO_CLIENTS = [
  { name: 'Lagos Logistics Ltd', email: 'ap@lagoslogistics.test' },
  { name: 'Accra Retail Group', email: 'finance@accraretail.test' },
] as const;

export const DEMO_VENDORS = [
  { name: 'Cloud Hosting Inc', email: 'billing@cloudhost.test', memoRequired: false },
  { name: 'Exchange Deposit Desk', email: 'ops@exchange.test', memoRequired: true },
] as const;

/** clientIndex refers to DEMO_CLIENTS. Amounts are decimal strings, never floats. */
export const DEMO_INVOICES = [
  {
    number: 'INV-2026-0001',
    clientIndex: 0,
    status: 'draft',
    dueInDays: 30,
    lineItems: [
      { description: 'Freight handling', quantity: '1', unitPrice: '1500' },
      { description: 'Customs documentation', quantity: '2', unitPrice: '125.5' },
    ],
  },
  {
    number: 'INV-2026-0002',
    clientIndex: 0,
    status: 'sent',
    dueInDays: 14,
    lineItems: [{ description: 'Warehousing — October', quantity: '1', unitPrice: '800' }],
  },
  {
    number: 'INV-2026-0003',
    clientIndex: 1,
    status: 'partially_paid',
    dueInDays: 7,
    lineItems: [{ description: 'Last-mile delivery', quantity: '40', unitPrice: '25' }],
  },
] as const;

/** Partial payment received against INV-2026-0003 (via its muxed address). */
export const DEMO_PARTIAL_PAYMENT = { invoiceNumber: 'INV-2026-0003', amount: '250' } as const;
