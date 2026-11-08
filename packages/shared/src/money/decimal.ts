import DecimalJs from 'decimal.js';

/**
 * Isolated Decimal constructor for money math. Never use JS floats for amounts.
 * Precision is high enough for Decimal(38,7) values.
 */
export const Decimal = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_DOWN,
  toExpNeg: -40,
  toExpPos: 40,
});

export type Decimal = InstanceType<typeof Decimal>;
