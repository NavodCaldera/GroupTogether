import type Decimal from "decimal.js";
import { D, roundMoney } from "./decimal";

/**
 * The group-cart rules, with no database (CLAUDE.md "Business rules").
 * Statuses are strings here so client code and tests can use them without Prisma.
 */
export type CartStatus =
  | "OPEN"
  | "READY"
  | "AWAITING_SLIP"
  | "SLIP_REVIEW"
  | "CONFIRMED"
  | "DISPATCHED"
  | "DELIVERED"
  | "EXPIRED"
  | "CANCELLED";

/** Members can join, add, change and remove items only before the owner accepts. */
export const EDITABLE: readonly CartStatus[] = ["OPEN", "READY"];

/** States an admin (or, before paying, the owner) can still cancel. */
export const CANCELLABLE: readonly CartStatus[] = ["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW"];

/** States whose lines still hold locked (reserved) stock. */
export const HOLDS_STOCK: readonly CartStatus[] = ["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW"];

export function isEditable(status: CartStatus) {
  return EDITABLE.includes(status);
}

export type LineLike = { qty: number; unitPrice: Decimal.Value | { toString(): string } };

export function lineTotal(line: LineLike): D {
  return new D(line.unitPrice.toString()).times(line.qty);
}

export function cartTotal(lines: LineLike[]): D {
  return roundMoney(lines.reduce((sum, l) => sum.plus(lineTotal(l)), new D(0)));
}

export function meetsMinimum(total: Decimal.Value, min: Decimal.Value) {
  return new D(total).gte(min);
}

/** How far to the minimum, 0–1 (capped), for the progress bar. */
export function progress(total: Decimal.Value, min: Decimal.Value): number {
  const m = new D(min);
  if (m.lte(0)) return 1;
  return Math.min(1, new D(total).div(m).toDecimalPlaces(4).toNumber());
}

export function remaining(total: Decimal.Value, min: Decimal.Value): D {
  return D.max(0, new D(min).minus(total));
}

/**
 * After a line change in an editable cart: OPEN ⇄ READY. Returns the new status and whether
 * the cart just crossed the minimum (members get the "cart reached the minimum" notice).
 */
export function statusAfterChange(
  status: CartStatus,
  total: Decimal.Value,
  min: Decimal.Value,
): { status: CartStatus; becameReady: boolean } {
  if (!isEditable(status)) return { status, becameReady: false };
  const ready = meetsMinimum(total, min);
  return { status: ready ? "READY" : "OPEN", becameReady: ready && status === "OPEN" };
}

export type Deadlines = { status: CartStatus; expiresAt: Date; slipDueAt: Date | null };

/** What the sweep does to a cart at `now`: nothing, expire it, or cancel a missed slip window. */
export function overdue(cart: Deadlines, now: Date): "EXPIRE" | "SLIP_MISSED" | null {
  if (isEditable(cart.status) && cart.expiresAt <= now) return "EXPIRE";
  if (cart.status === "AWAITING_SLIP" && cart.slipDueAt && cart.slipDueAt <= now)
    return "SLIP_MISSED";
  return null;
}

export function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 3_600_000);
}

/** Share codes: 8 characters with no look-alikes (0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function newCartCode(random: (n: number) => Uint8Array): string {
  const bytes = random(8);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export const STATUS_LABEL: Record<CartStatus, string> = {
  OPEN: "Open",
  READY: "Minimum reached",
  AWAITING_SLIP: "Awaiting payment",
  SLIP_REVIEW: "Payment in review",
  CONFIRMED: "Confirmed",
  DISPATCHED: "On the way",
  DELIVERED: "Delivered",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
};

/**
 * One cart at a time: a buyer can own or be in only one active cart. Active means the cart still
 * holds stock and hasn't passed its deadline. The service mirrors this as a query in `activeCartOf`.
 */
export function isActiveCart(cart: Deadlines, now: Date): boolean {
  return HOLDS_STOCK.includes(cart.status) && overdue(cart, now) === null;
}
