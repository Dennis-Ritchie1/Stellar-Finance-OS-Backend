import * as shared from '@finance-os/shared';
import { describe, expect, it } from 'vitest';
import * as db from './generated/prisma/enums.js';

/** The DB enums and the shared Zod enums must never drift apart. */
const pairs: [string, Record<string, string>, readonly string[]][] = [
  ['MemberRole', db.MemberRole, shared.MemberRoleValues],
  ['StellarNetwork', db.StellarNetwork, shared.StellarNetworkValues],
  ['InvoiceStatus', db.InvoiceStatus, shared.InvoiceStatusValues],
  ['PaymentRequestStatus', db.PaymentRequestStatus, shared.PaymentRequestStatusValues],
  ['TransactionDirection', db.TransactionDirection, shared.TransactionDirectionValues],
  ['TransactionStatus', db.TransactionStatus, shared.TransactionStatusValues],
  ['OperationType', db.OperationType, shared.OperationTypeValues],
  ['MatchMethod', db.MatchMethod, shared.MatchMethodValues],
  ['MemoType', db.MemoType, shared.MemoTypeValues],
  ['ApprovalDecision', db.ApprovalDecision, shared.ApprovalDecisionValues],
  ['ExportStatus', db.ExportStatus, shared.ExportStatusValues],
];

describe('enum parity between prisma and @finance-os/shared', () => {
  it.each(pairs)('%s matches', (_name, prismaEnum, sharedValues) => {
    expect(Object.values(prismaEnum).sort()).toEqual([...sharedValues].sort());
  });
});
