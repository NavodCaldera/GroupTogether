import { D, toD } from "./decimal";

/**
 * Bulk lots and stock turnover (product owner, 2026-10-21). The goal is to empty the store fast:
 * a lot's cost (bulk + transport + wages) over its pieces is the cost per piece; its products sell
 * at cost + the full margin (20%) until 7 days after the lot arrived, then at cost + the reduced
 * margin (10%). Pure rules, no database.
 */

type Money = { toString(): string };

const DAY_MS = 86_400_000;

export type LotCost = { pieces: number; bulkCost: Money; transportCost: Money; wages: Money };

export function lotTotalCost(l: LotCost): D {
  return toD(l.bulkCost).plus(toD(l.transportCost)).plus(toD(l.wages));
}

/** Unrounded: round only the price. */
export function costPerPiece(l: LotCost): D {
  return lotTotalCost(l).div(l.pieces);
}

/** Cost plus the margin, rounded up to the whole rupee so the margin is never short. */
export function priceAtMargin(cost: D, marginPct: number): D {
  return cost
    .times(100 + marginPct)
    .div(100)
    .toDecimalPlaces(0, D.ROUND_UP);
}

export type LotMargins = { fullMarginPct: number; reducedMarginPct: number; reduceAt: Date };

/** The margin a lot sells at now: full until `reduceAt`, then reduced. */
export function lotMarginPct(lot: LotMargins, now: Date): number {
  return now >= lot.reduceAt ? lot.reducedMarginPct : lot.fullMarginPct;
}

/** The shop price of every product in the lot at `now`. */
export function lotPrice(lot: LotCost & LotMargins, now: Date): D {
  return priceAtMargin(costPerPiece(lot), lotMarginPct(lot, now));
}

export function reduceAtFor(receivedAt: Date, fullMarginDays: number): Date {
  return new Date(receivedAt.getTime() + fullMarginDays * DAY_MS);
}

/** Whole days from `since` to `now` (0 for a future or same-day `since`). */
export function ageDays(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / DAY_MS));
}

/** Age bands for stock in the store; the last band is open-ended. */
export const AGE_BANDS = [
  { label: "0–7 days", maxDays: 7 },
  { label: "8–14 days", maxDays: 14 },
  { label: "15–30 days", maxDays: 30 },
  { label: "Over 30 days", maxDays: Infinity },
] as const;

/** Stock older than this is flagged as slow. */
export const SLOW_DAYS = 30;

export function ageBand(days: number): number {
  return AGE_BANDS.findIndex((b) => days <= b.maxDays);
}

/** Average age over pieces (each pile weighted by its pieces), whole days; null when empty. */
export function averageAgeDays(piles: { pieces: number; days: number }[]): number | null {
  let pieces = 0;
  let pieceDays = 0;
  for (const p of piles) {
    if (p.pieces <= 0) continue;
    pieces += p.pieces;
    pieceDays += p.pieces * p.days;
  }
  return pieces > 0 ? Math.round(pieceDays / pieces) : null;
}

/** Days until the store is empty at the recent pace, or null when nothing is going out. */
export function daysToClear(inStore: number, outPerDay: number): number | null {
  if (inStore <= 0) return 0;
  return outPerDay > 0 ? Math.ceil(inStore / outPerDay) : null;
}

/** Whole percent of `part` over `whole` (rounded down), or null when `whole` is 0. */
export function percentOf(part: Money | number, whole: Money | number): number | null {
  const w = toD(whole);
  if (w.lte(0)) return null;
  return toD(part).div(w).times(100).toDecimalPlaces(0, D.ROUND_DOWN).toNumber();
}

type SizeStock = { size: string; colour?: string; available: number; sold: number };

/**
 * The sizes still on the shelf once most of a product's sizes have sold out (at least 3 sizes,
 * and at least twice as many sold out as left). These leftovers are what gets stuck; null when
 * the product isn't in that state.
 */
export function oddSizesLeft(variants: SizeStock[]): string[] | null {
  if (variants.length < 3) return null;
  const left = variants.filter((v) => v.available > 0);
  const soldOut = variants.filter((v) => v.available === 0 && v.sold > 0);
  if (left.length === 0 || soldOut.length < 2 * left.length) return null;
  return left.map((v) => (v.colour ? `${v.size} ${v.colour}` : v.size));
}
