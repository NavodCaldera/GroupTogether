import type Decimal from "decimal.js";
import { D, roundMoney } from "./decimal";

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

/** A category's commission as resolved down the tree (`resolveCommission`): nulls are unset. */
export type CommissionRate = { pct: string | null; min: string | null };

/** Commission percent: 0 to 100 with at most two decimals (Decimal(5,2)). */
export function validCommissionPct(value: Decimal.Value): boolean {
  return validCommission(value) && new D(value).lte(100);
}

/**
 * The category commission per unit (DEAL-004): factory price x pct / 100, rounded half-up to
 * cents, and at least the inherited minimum. With no percent in the chain the flat
 * `Settings.commissionPerPiece` applies unchanged.
 */
export function categoryCommission(
  factoryPrice: Decimal.Value,
  rate: CommissionRate,
  flat: { toString(): string },
): D {
  if (!validCommission(factoryPrice))
    throw new Error("Enter non-negative amounts with at most two decimals");
  if (rate.pct === null) return new D(flat.toString());
  const pct = roundMoney(new D(factoryPrice).times(rate.pct).div(100));
  return rate.min !== null && pct.lt(rate.min) ? new D(rate.min) : pct;
}

/**
 * The commission per unit added to a factory price, resolved in one place (DEAL-004): the
 * category percentage when the chain sets one, else the listing's snapshotted commission, else
 * `Settings.commissionPerPiece`.
 */
export function commissionFor(
  product: { commission: { toString(): string } | null },
  settings: { commissionPerPiece: { toString(): string } },
  factoryPrice?: Decimal.Value,
  rate?: CommissionRate,
): D {
  if (rate?.pct != null && factoryPrice !== undefined)
    return categoryCommission(factoryPrice, rate, settings.commissionPerPiece);
  return new D((product.commission ?? settings.commissionPerPiece).toString());
}

/** A deal tier's buyer price: its factory price plus the commission (DEAL-004). */
export function tierBuyerPrice(
  factoryPrice: Decimal.Value,
  product: { commission: { toString(): string } | null },
  settings: { commissionPerPiece: { toString(): string } },
  rate?: CommissionRate,
): D {
  return buyerPrice(factoryPrice, commissionFor(product, settings, factoryPrice, rate).toFixed(2));
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
