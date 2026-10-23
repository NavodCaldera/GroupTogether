import { type D, toD } from "./decimal";
import { colomboDayStart } from "./format";

/**
 * How a factory's design sells (product owner, 2026-10-24): the seller dashboard shows, for each
 * design, pieces wanted (put in carts, even carts that expired) and bought, how many people
 * bought, and the shop price against the pieces sold. A design's test pieces and its bulk are one
 * shop product. Pure rules, no database.
 */

type Money = { toString(): string };

const DAY_MS = 86_400_000;

/** At most this many days on the price and quantity chart. */
export const CHART_DAYS = 60;

/** One cart line of the design: `bought` when its cart was paid for. */
export type DemandLine = {
  qty: number;
  unitPrice: Money;
  at: Date;
  userId: string;
  bought: boolean;
};

export type PriceSpan = { price: D; from: Date; to: Date };

/** Price rows (any order) as spans up to `now`; repeats of the same price merge into one span. */
export function priceSpans(changes: { price: Money; at: Date }[], now: Date): PriceSpan[] {
  const sorted = [...changes].sort((a, b) => a.at.getTime() - b.at.getTime());
  const spans: PriceSpan[] = [];
  for (const c of sorted) {
    if (c.at > now) break;
    const price = toD(c.price);
    const last = spans.at(-1);
    if (last?.price.eq(price)) continue;
    if (last) last.to = c.at;
    spans.push({ price, from: c.at, to: now });
  }
  return spans;
}

/** The price in effect at `t`, or null before the first price. */
export function priceAt(spans: PriceSpan[], t: Date): D | null {
  for (let i = spans.length - 1; i >= 0; i--) if (spans[i].from <= t) return spans[i].price;
  return null;
}

export type ChartDay = { start: Date; price: D | null; wanted: number; bought: number };

/**
 * One row per Colombo day from the first price (at most the last `CHART_DAYS` days) to today:
 * the price at the end of the day (now, for today) and the pieces put in carts that day, with
 * those that were bought.
 */
export function chartDays(spans: PriceSpan[], lines: DemandLine[], now: Date): ChartDay[] {
  if (spans.length === 0) return [];
  const today = colomboDayStart(now);
  const first = colomboDayStart(spans[0].from);
  const n = Math.min(CHART_DAYS, Math.round((today.getTime() - first.getTime()) / DAY_MS) + 1);
  const from = colomboDayStart(now, n - 1);
  const days: ChartDay[] = Array.from({ length: n }, (_, i) => {
    const start = new Date(from.getTime() + i * DAY_MS);
    const end = i === n - 1 ? now : new Date(start.getTime() + DAY_MS - 1);
    return { start, price: priceAt(spans, end), wanted: 0, bought: 0 };
  });
  for (const l of lines) {
    const i = Math.floor((l.at.getTime() - from.getTime()) / DAY_MS);
    const d = days[i];
    if (!d) continue;
    d.wanted += l.qty;
    if (l.bought) d.bought += l.qty;
  }
  return days;
}

export type PriceRow = {
  price: D;
  /** Days the design was on sale at this price (one decimal), 0 if only cart lines carry it. */
  days: number;
  wanted: number;
  bought: number;
  /** Different people who bought at this price. */
  people: number;
  /** Pieces bought per day at this price; null when it never stood for a measurable time. */
  perDay: number | null;
};

/** Pieces wanted and bought at each price (the price a line was added at), cheapest first. */
export function byPrice(spans: PriceSpan[], lines: DemandLine[]): PriceRow[] {
  const rows = new Map<string, PriceRow & { buyers: Set<string> }>();
  const row = (price: D) => {
    const key = price.toFixed(2);
    let r = rows.get(key);
    if (!r) {
      r = { price, days: 0, wanted: 0, bought: 0, people: 0, perDay: null, buyers: new Set() };
      rows.set(key, r);
    }
    return r;
  };
  for (const s of spans) row(s.price).days += (s.to.getTime() - s.from.getTime()) / DAY_MS;
  for (const l of lines) {
    const r = row(toD(l.unitPrice));
    r.wanted += l.qty;
    if (l.bought) {
      r.bought += l.qty;
      r.buyers.add(l.userId);
    }
  }
  return [...rows.values()]
    .map(({ buyers, ...r }) => {
      const days = Math.round(r.days * 10) / 10;
      return {
        ...r,
        days,
        people: buyers.size,
        perDay: r.days >= 0.1 ? Math.round((r.bought / r.days) * 10) / 10 : null,
      };
    })
    .sort((a, b) => a.price.comparedTo(b.price));
}

export type Demand = { wanted: number; bought: number; people: number; wantedBy: number };

/** Pieces wanted and bought, and how many different people wanted and bought them. */
export function demandOf(lines: DemandLine[]): Demand {
  const wantedBy = new Set<string>();
  const boughtBy = new Set<string>();
  let wanted = 0;
  let bought = 0;
  for (const l of lines) {
    wanted += l.qty;
    wantedBy.add(l.userId);
    if (l.bought) {
      bought += l.qty;
      boughtBy.add(l.userId);
    }
  }
  return { wanted, bought, people: boughtBy.size, wantedBy: wantedBy.size };
}

/**
 * Days a design has been on sale: from its first price to now, or to its last sale once no free
 * stock is left (so a test that sold out fast isn't counted as slow). At least one day.
 */
export function daysOnSale(start: Date, now: Date, freeNow: number, lastSale: Date | null): number {
  const end = freeNow > 0 || !lastSale ? now : lastSale;
  return Math.max(1, (end.getTime() - start.getTime()) / DAY_MS);
}

/** Pieces bought per day on sale, one decimal. */
export function sellRate(bought: number, days: number): number {
  return Math.round((bought / Math.max(1, days)) * 10) / 10;
}

export type DemandLabel = "fast" | "average" | "slow";

/**
 * Compared with similar designs (same audience and category): a quarter faster or more is fast,
 * a quarter slower or more is slow. Null without at least two similar designs to compare with.
 */
export function demandLabel(rate: number, similar: number[]): DemandLabel | null {
  if (similar.length < 2) return null;
  const avg = similar.reduce((a, b) => a + b, 0) / similar.length;
  if (avg <= 0) return rate > 0 ? "fast" : null;
  const ratio = rate / avg;
  return ratio >= 1.25 ? "fast" : ratio <= 0.75 ? "slow" : "average";
}

/** Average of the similar designs' rates, one decimal; null when there are fewer than two. */
export function similarRate(similar: number[]): number | null {
  if (similar.length < 2) return null;
  return Math.round((similar.reduce((a, b) => a + b, 0) / similar.length) * 10) / 10;
}

/**
 * A tested design's bulk goes onto the same product (2026-10-24): lines added before the bulk
 * reached our store belong to the test, the rest to the bulk. No bulk yet: all test.
 */
export function splitTestBulk(lines: DemandLine[], bulkFrom: Date | null) {
  if (!bulkFrom) return { test: lines, bulk: [] as DemandLine[] };
  return {
    test: lines.filter((l) => l.at < bulkFrom),
    bulk: lines.filter((l) => l.at >= bulkFrom),
  };
}

/** The largest count, 0 for none (the chart's scale). */
export const maxOf = (ns: number[]) => ns.reduce((m, n) => Math.max(m, n), 0);
