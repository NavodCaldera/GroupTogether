import type Decimal from "decimal.js";
import { D } from "./decimal";
export function balanceOf(entries: { amount: Decimal.Value }[]): D {
  return entries.reduce((sum, entry) => sum.plus(entry.amount), new D(0));
}
export function maxApplicable(
  balance: Decimal.Value,
  lineValue: Decimal.Value,
  alreadyApplied: Decimal.Value,
): D {
  return D.max(0, D.min(new D(balance), new D(lineValue).minus(alreadyApplied)));
}
