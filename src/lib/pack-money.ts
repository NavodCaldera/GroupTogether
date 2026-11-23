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
