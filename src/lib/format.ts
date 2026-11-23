import type Decimal from "decimal.js";
import { roundMoney } from "./decimal";

const lkr = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  currencyDisplay: "code",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const lkrCents = new Intl.NumberFormat("en-LK", {
  style: "currency",
  currency: "LKR",
  currencyDisplay: "code",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Display an amount in LKR: whole rupees without cents, otherwise always two decimals
 * (LKR 1,600 and LKR 109.20, never LKR 109.2). Formatting is exact: the string never becomes a
 * float. */
export function formatLKR(value: Decimal.Value | { toString(): string }): string {
  const rounded = roundMoney(value.toString());
  const fmt = rounded.isInteger() ? lkr : lkrCents;
  return fmt.format(rounded.toFixed(2) as unknown as number);
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

/** "2026-10-20": the Colombo calendar day `date` falls on (for date inputs). */
export function colomboIsoDay(date = new Date()): string {
  return new Date(date.getTime() + COLOMBO_OFFSET_MS).toISOString().slice(0, 10);
}
