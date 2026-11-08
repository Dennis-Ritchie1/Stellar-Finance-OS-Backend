import type { MemoType } from '@finance-os/shared';
import { Memo } from '@stellar/stellar-sdk';

/** A memo as stored in the DB: hash/return values are hex strings. */
export interface MemoValue {
  type: MemoType;
  value?: string | null;
}

const MAX_TEXT_BYTES = 28;
const UINT64_MAX = 2n ** 64n - 1n;

/** Returns an error message, or null if the memo is valid. */
export function validateMemo(memo: MemoValue): string | null {
  const v = memo.value ?? '';
  switch (memo.type) {
    case 'none':
      return v ? 'A memo of type none cannot have a value' : null;
    case 'text':
      if (!v) return 'Text memo is empty';
      return Buffer.byteLength(v, 'utf8') > MAX_TEXT_BYTES ? 'Text memo exceeds 28 bytes' : null;
    case 'id':
      if (!/^\d+$/.test(v)) return 'ID memo must be an unsigned integer';
      return BigInt(v) > UINT64_MAX ? 'ID memo exceeds uint64' : null;
    case 'hash':
    case 'return':
      return /^[0-9a-f]{64}$/i.test(v) ? null : `${memo.type} memo must be 32 bytes of hex`;
  }
}

export function toSdkMemo(memo: MemoValue): Memo {
  const error = validateMemo(memo);
  if (error) throw new Error(error);
  const v = memo.value ?? '';
  switch (memo.type) {
    case 'none':
      return Memo.none();
    case 'text':
      return Memo.text(v);
    case 'id':
      return Memo.id(v);
    case 'hash':
      return Memo.hash(v.toLowerCase());
    case 'return':
      return Memo.return(v.toLowerCase());
  }
}

/** Normalise an SDK memo into the DB representation. */
export function fromSdkMemo(memo: Memo): MemoValue {
  switch (memo.type) {
    case 'none':
      return { type: 'none', value: null };
    case 'text':
      return {
        type: 'text',
        // Decoded envelopes carry text memos as raw bytes (Uint8Array), not strings.
        value:
          typeof memo.value === 'string'
            ? memo.value
            : Buffer.from(memo.value as Uint8Array).toString('utf8'),
      };
    case 'id':
      return { type: 'id', value: String(memo.value) };
    case 'hash':
    case 'return':
      return { type: memo.type, value: Buffer.from(memo.value as Uint8Array).toString('hex') };
  }
}

export function memosEqual(a: MemoValue, b: MemoValue): boolean {
  const norm = (m: MemoValue) =>
    m.type === 'hash' || m.type === 'return' ? (m.value ?? '').toLowerCase() : (m.value ?? '');
  return a.type === b.type && norm(a) === norm(b);
}
