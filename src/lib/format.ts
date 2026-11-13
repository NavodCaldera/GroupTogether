import type Decimal from "decimal.js";
import { roundMoney } from "./decimal";

const lkr = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Display an amount in LKR. Formatting is exact: the string never becomes a float. */
export function formatLKR(value: Decimal.Value | { toString(): string }): string {
  return lkr.format(roundMoney(value.toString()).toFixed(2) as unknown as number);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(new Date(date));
}

/** "17 Oct" in Colombo time. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Colombo",
  }).format(new Date(date));
}

/** Colombo is UTC+5:30 all year (no daylight saving). */
const COLOMBO_OFFSET_MS = 5.5 * 3_600_000;
const DAY_MS = 86_400_000;

/** Midnight in Colombo at the start of the day `now` falls on, or `daysAgo` days before it. */
export function colomboDayStart(now = new Date(), daysAgo = 0): Date {
  const local = now.getTime() + COLOMBO_OFFSET_MS;
  return new Date(local - (local % DAY_MS) - COLOMBO_OFFSET_MS - daysAgo * DAY_MS);
}

/** Midnight in Colombo starting the calendar day "2026-10-20", or null if it isn't a real date. */
function colomboDay(day: string | undefined): Date | null {
  const m = day?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(utc).toISOString().slice(0, 10) !== day) return null;
  return new Date(utc - COLOMBO_OFFSET_MS);
}

/** "2026-10-20": the Colombo calendar day `date` falls on (for date inputs). */
export function colomboIsoDay(date = new Date()): string {
  return new Date(colomboDayStart(date).getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * A date filter from two "YYYY-MM-DD" days, both included, in Colombo time. Bad days are dropped
 * and a reversed pair is swapped. `from` / `to` are the days actually used (for the inputs).
 */
export function colomboDateRange(fromDay?: string, toDay?: string) {
  let a = colomboDay(fromDay);
  let b = colomboDay(toDay);
  if (a && b && a > b) [a, b] = [b, a];
  const day = (d: Date) => new Date(d.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
  return {
    from: a ? day(a) : undefined,
    to: b ? day(b) : undefined,
    range:
      a || b
        ? { gte: a ?? undefined, lt: b ? new Date(b.getTime() + DAY_MS) : undefined }
        : undefined,
  };
}

/** "2026-10-16 14:05" in Colombo time, for exports. */
export function formatIsoDateTime(date: Date | null | undefined): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Colombo",
  }).format(date);
}

/** How long since `since`: "just now", "35m", "2h 5m", "3d". */
export function waitedFor(since: Date, now = new Date()): string {
  const mins = Math.floor((now.getTime() - since.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return mins % 60 ? `${h}h ${mins % 60}m` : `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
