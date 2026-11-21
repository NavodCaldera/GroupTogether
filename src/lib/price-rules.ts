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

/**
 * The commission per unit added to a factory price, resolved in one place (DEAL-004): today the
 * listing's snapshotted commission, else `Settings.commissionPerPiece`. A later phase switches this
 * to the category percentage.
 */
export function commissionFor(
  product: { commission: { toString(): string } | null },
  settings: { commissionPerPiece: { toString(): string } },
): D {
  return new D((product.commission ?? settings.commissionPerPiece).toString());
}

/** A deal tier's buyer price: its factory price plus the product's commission (DEAL-004). */
export function tierBuyerPrice(
  factoryPrice: Decimal.Value,
  product: { commission: { toString(): string } | null },
  settings: { commissionPerPiece: { toString(): string } },
): D {
  return buyerPrice(factoryPrice, commissionFor(product, settings).toFixed(2));
}

/**
 * Whole percent our price sits below the listed retail price (rounded down), or null when there is
 * no retail price or it isn't above ours.
 */
export function savingPercent(
  price: { toString(): string },
  retailPrice: { toString(): string } | null | undefined,
): number | null {
  if (retailPrice == null) return null;
  const rp = new D(retailPrice.toString());
  const p = new D(price.toString());
  if (rp.lte(p) || rp.lte(0)) return null;
  return rp.minus(p).div(rp).times(100).toDecimalPlaces(0, D.ROUND_DOWN).toNumber();
}
