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

/**
 * What one family paid for each item line of its basket: the basket price split by each line's shop
 * value (shop price × quantity), in whole cents, largest remainder first, so the lines add up to the
 * price exactly. `unit` is the line over its quantity, to the cent. Null when any item has no shop
 * price, because the split cannot be known then; today's prices are never used instead.
 */
export function itemCosts(price: Money, items: { qty: number; retailPrice: Money | null }[]) {
  if (items.length === 0 || items.some((i) => i.retailPrice == null)) return null;
  const cents = new D(price.toString()).times(100);
  const weights = items.map((i) => new D(i.retailPrice!.toString()).times(i.qty));
  const total = weights.reduce((a, w) => a.plus(w), new D(0));
  if (total.lte(0)) return null;
  const exact = weights.map((w) => cents.times(w).div(total));
  const lines = exact.map((e) => e.floor());
  let left = cents.minus(lines.reduce((a, l) => a.plus(l), new D(0))).toNumber();
  const order = exact
    .map((_, i) => i)
    .sort((a, b) => exact[b].minus(lines[b]).comparedTo(exact[a].minus(lines[a])) || a - b);
  for (const i of order) {
    if (left <= 0) break;
    lines[i] = lines[i].plus(1);
    left--;
  }
  return lines.map((l, i) => ({
    line: l.div(100),
    unit: roundMoney(l.div(100).div(items[i].qty)),
  }));
}
