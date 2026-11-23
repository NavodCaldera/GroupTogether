import { D, roundMoney } from "./decimal";

type Money = { toString(): string } | string;

/** Commission on one family pack: the version's percentage of its price, to the cent (AD-8). */
export function packCommission(price: Money, pct: Money): D {
  return roundMoney(new D(price.toString()).times(new D(pct.toString())).div(100));
}

/** What a company is owed for a full basket: (price − commission) × families. */
export function packAmountDue(price: Money, pct: Money, families: number): D {
  return roundMoney(new D(price.toString()).minus(packCommission(price, pct)).times(families));
}

/** A basket is 5, 10 or 15 families; the owner picks one when starting it. */
export const BASKET_SIZES = [5, 10, 15] as const;
export type BasketSize = (typeof BASKET_SIZES)[number];
export const isBasketSize = (n: number): n is BasketSize =>
  (BASKET_SIZES as readonly number[]).includes(n);

type Discounts = { pricePerFamily: Money; discount5: Money; discount10: Money; discount15: Money };

/** Price per family in a basket of `size`: the full price less that size's discount, to the cent. */
export function sizePrice(v: Discounts, size: BasketSize): D {
  const pct = { 5: v.discount5, 10: v.discount10, 15: v.discount15 }[size];
  return roundMoney(
    new D(v.pricePerFamily.toString()).times(new D(100).minus(pct.toString())).div(100),
  );
}

/** Each basket size with its discount % and price per family, for the pack's table. */
export function sizeTable(v: Discounts) {
  return BASKET_SIZES.map((size) => ({
    size,
    pct: new D({ 5: v.discount5, 10: v.discount10, 15: v.discount15 }[size].toString()),
    price: sizePrice(v, size),
  }));
}
