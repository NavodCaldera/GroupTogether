import type { CartStatus } from "./cart-rules";

/**
 * Figures for a factory's own dashboard (product owner, 2026-11-03). No database. Two numbers are
 * never mixed: "sold (paid)" counts only approved payments; "wanted in active carts" is stock
 * held in carts that aren't paid yet, and is never a sale.
 */

/** Carts whose payment is approved: their lines are sales. */
export const PAID: readonly CartStatus[] = ["CONFIRMED", "DISPATCHED", "DELIVERED"];

/** A size with this many or fewer left is low stock. */
export const LOW_STOCK = 3;

/** Fewer ratings than this and the average is hidden. */
export const MIN_RATINGS = 5;

/** City figures are shown only for cities with at least this many orders. */
export const MIN_CITY_ORDERS = 5;

type LineLike = { qty: number; unitPrice: { toString(): string }; status: CartStatus };

/** Pieces and value sold, from paid carts only; unpaid carts never count. */
export function paidTotals(lines: readonly LineLike[]) {
  let pieces = 0;
  let value = 0;
  for (const l of lines) {
    if (!PAID.includes(l.status)) continue;
    pieces += l.qty;
    value += Number(l.unitPrice.toString()) * l.qty;
  }
  return { pieces, value };
}

/** The average to show, or null below MIN_RATINGS; the count is always shown. */
export function ratingDisplay(stars: readonly number[]) {
  const count = stars.length;
  const average = count >= MIN_RATINGS ? stars.reduce((n, s) => n + s, 0) / count : null;
  return { count, average };
}

/** Drops cities with fewer than MIN_CITY_ORDERS orders, so no small group can be singled out. */
export function citiesShown<T extends { orders: number }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.orders >= MIN_CITY_ORDERS);
}

/** The middle value, or null for none. */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export type StockAlert = "sold-out" | "low" | null;

export function stockAlert(available: number): StockAlert {
  if (available <= 0) return "sold-out";
  return available <= LOW_STOCK ? "low" : null;
}

/**
 * Restock advice for one size: what is held in active carts (not yet sales) against what is left.
 * Null when nothing calls for it.
 */
export function restockAdvice(v: { size: string; available: number; reserved: number }) {
  if (v.reserved > 0 && v.reserved >= v.available)
    return `Size ${v.size}: ${v.available} left, ${v.reserved} wanted in active carts — restock`;
  if (v.available <= 0) return `Size ${v.size}: sold out — restock`;
  if (v.available <= LOW_STOCK) return `Size ${v.size}: ${v.available} left`;
  return null;
}

/** Price bands for the price-vs-sales table (LKR). */
export const PRICE_BANDS = [
  { label: "Under 2,000", max: 2000 },
  { label: "2,000–3,999", max: 4000 },
  { label: "4,000–5,999", max: 6000 },
  { label: "6,000 and up", max: Infinity },
] as const;

export function priceBand(price: number): string {
  return PRICE_BANDS.find((b) => price < b.max)!.label;
}

/** How far a cart is toward its minimum, as a whole percent capped at 100. */
export function towardMinimum(total: { toString(): string }, minimum: { toString(): string }) {
  const min = Number(minimum.toString());
  return min > 0 ? Math.min(100, Math.floor((Number(total.toString()) / min) * 100)) : 100;
}
