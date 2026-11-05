import type Decimal from "decimal.js";
import { D } from "./decimal";

export function validCommission(value: Decimal.Value): boolean {
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value)) return false;
  try {
    const v = new D(value);
    return v.isFinite() && v.gte(0) && v.lt("1000000000000") && v.decimalPlaces() <= 2;
  } catch {
    return false;
  }
}
export function buyerPrice(factoryPrice: Decimal.Value, commission: Decimal.Value): D {
  if (!validCommission(factoryPrice) || !validCommission(commission))
    throw new Error("Enter non-negative amounts with at most two decimals");
  const price = new D(factoryPrice).plus(commission);
  if (!validCommission(price)) throw new Error("Buyer price is too large");
  return price;
}
