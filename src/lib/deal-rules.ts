import { D, roundMoney } from "./decimal";
import { validCommission } from "./price-rules";

/** Pure rules for group deals and price tiers (DEAL-001, DEAL-002, DEC-029). */

export const MAX_TIERS = 6;
export const MAX_DEAL_DAYS = 60;
export const MAX_DEAL_QTY = 1_000_000;

export class DealRuleError extends Error {}

export type TierInput = { minQty: string; factoryPrice: string };
export type ParsedTier = { minQty: number; factoryPrice: D };

/**
 * The factory's tier rows, blank rows dropped. Tier 1 starts at 1, quantities rise and factory
 * prices fall from tier to tier.
 */
export function parseTiers(rows: TierInput[]): ParsedTier[] {
  const filled = rows.filter((r) => r.minQty.trim() !== "" || r.factoryPrice.trim() !== "");
  if (!filled.length) throw new DealRuleError("Add at least one tier");
  if (filled.length > MAX_TIERS) throw new DealRuleError(`At most ${MAX_TIERS} tiers`);
  const tiers = filled.map((r) => {
    const qty = r.minQty.trim();
    const price = r.factoryPrice.trim();
    if (!/^\d{1,7}$/.test(qty) || Number(qty) < 1 || Number(qty) > MAX_DEAL_QTY)
      throw new DealRuleError("Enter each tier's quantity as a whole number");
    if (!validCommission(price) || new D(price).lte(0))
      throw new DealRuleError("Enter each tier's factory price, such as 450 or 450.50");
    return { minQty: Number(qty), factoryPrice: new D(price) };
  });
  tiers.sort((a, b) => a.minQty - b.minQty);
  if (tiers[0]!.minQty !== 1) throw new DealRuleError("The first tier starts at 1");
  for (let i = 1; i < tiers.length; i++) {
    if (tiers[i]!.minQty === tiers[i - 1]!.minQty)
      throw new DealRuleError("Each tier needs its own quantity");
    if (!tiers[i]!.factoryPrice.lt(tiers[i - 1]!.factoryPrice))
      throw new DealRuleError("Each tier's price must be lower than the one before");
  }
  return tiers;
}

/** Capacity as typed: blank for none, else a whole number of at least the last tier's quantity. */
export function parseMaxQty(value: string, tiers: { minQty: number }[]): number | null {
  const v = value.trim();
  if (!v) return null;
  if (!/^\d{1,7}$/.test(v) || Number(v) < 1 || Number(v) > MAX_DEAL_QTY)
    throw new DealRuleError("Enter the capacity as a whole number");
  const last = tiers.at(-1)?.minQty ?? 1;
  if (Number(v) < last) throw new DealRuleError("The capacity is below the last tier");
  return Number(v);
}

/** The end of a deal: after `now`, at most MAX_DEAL_DAYS ahead. */
export function checkEndsAt(endsAt: Date, now: Date): Date {
  if (Number.isNaN(endsAt.getTime())) throw new DealRuleError("Choose when the deal ends");
  if (endsAt <= now) throw new DealRuleError("The end must be in the future");
  if (endsAt.getTime() - now.getTime() > MAX_DEAL_DAYS * 86_400_000)
    throw new DealRuleError(`A deal runs at most ${MAX_DEAL_DAYS} days`);
  return endsAt;
}

/** The highest tier reached by `units` (tier 1 when nothing sold). Tiers sorted by minQty. */
export function tierAt<T extends { minQty: number }>(tiers: T[], units: number): T {
  if (!tiers.length) throw new DealRuleError("A deal needs tiers");
  let reached = tiers[0]!;
  for (const t of tiers) if (t.minQty <= Math.max(units, 1)) reached = t;
  return reached;
}

/** The next tier and how many more units reach it, or null at the top tier. */
export function nextTier<T extends { minQty: number }>(
  tiers: T[],
  units: number,
): { tier: T; more: number } | null {
  const tier = tiers.find((t) => t.minQty > Math.max(units, 1));
  return tier ? { tier, more: tier.minQty - units } : null;
}

/** Units the deal can still take, or null with no capacity. */
export function unitsLeft(deal: { maxQty: number | null; unitsSold: number; unitsHeld: number }) {
  return deal.maxQty === null ? null : Math.max(deal.maxQty - deal.unitsSold - deal.unitsHeld, 0);
}

/** (paid − final) × units still kept (not missing, not returned), never negative. */
export function dealRebate(
  paidUnitPrice: D,
  finalUnitPrice: D,
  qty: number,
  missingQty: number,
  returnedQty: number,
): D {
  const kept = Math.max(qty - missingQty - returnedQty, 0);
  return roundMoney(D.max(paidUnitPrice.minus(finalUnitPrice), 0).times(kept));
}

/**
 * The price per unit a refund gives back. Before settlement the buyer paid tier 1 and has had no
 * rebate; after it every kept unit was rebated down to the final price, so the refund is the final
 * price (paid − rebate already given).
 */
export function refundUnitPrice(line: { unitPrice: D; finalUnitPrice: D | null }): D {
  return line.finalUnitPrice ?? line.unitPrice;
}
