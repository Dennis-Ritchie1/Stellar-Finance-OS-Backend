// Implementation lives in @finance-os/shared (pure string parsing, also used by matching).
// Pure string logic lives in @finance-os/shared so the matching engine can use it
// without pulling in the Stellar SDK. Re-exported here for existing consumers.
export { invoiceMemo, parseInvoiceMemo } from '@finance-os/shared';
