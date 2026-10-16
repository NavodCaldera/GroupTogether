import Decimal from "decimal.js";

/**
 * The one Decimal constructor for money: never use a JS number for an amount.
 * High precision for unrounded intermediate values; half-up rounding applies only
 * where a value is shown or charged.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type D = InstanceType<typeof D>;

/** Convert a stored value (e.g. a Prisma Decimal) to D without passing through a JS number. */
export function toD(value: { toString(): string }): D {
  return new D(value.toString());
}

/** Round to 2 dp for display or charging. Never use on intermediate values. */
export function roundMoney(value: Decimal.Value): D {
  return new D(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
