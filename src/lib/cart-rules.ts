import type Decimal from "decimal.js";
import { D, roundMoney } from "./decimal";
import { formatLKR } from "./format";

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

export type MergeSide = { status: CartStatus; expiresAt: Date };

/**
 * Can `userId` merge their cart `from` into cart `to` (their items move over, their cart goes)?
 * Returns why not, or null. Both carts must still be editable and unexpired; a cart they own can
 * only go if nobody else is in it.
 */
export function mergeBlockReason(
  p: {
    from: MergeSide & { ownerId: string; memberCount: number };
    to: MergeSide;
    userId: string;
  },
  now: Date,
): string | null {
  const open = (c: MergeSide) => isEditable(c.status) && c.expiresAt > now;
  if (!open(p.from)) return "Your cart is already being paid for or closed, so it can't be merged.";
  if (!open(p.to)) return "That cart is no longer taking members.";
  if (p.from.ownerId === p.userId && p.from.memberCount > 1)
    return "Your cart has other members, so it can't be merged. Cancel it or ask them to leave first.";
  return null;
}

// ─── Buyer dashboard: one card, one next step ────────────────────────────────

/** The four steps a buyer sees on the dashboard progress line. */
export const JOURNEY = ["Open", "Ready", "Paid", "Delivered"] as const;

/** Index into JOURNEY of the last step reached (paying still counts as "Ready"). */
export function journeyStep(status: CartStatus): number {
  switch (status) {
    case "OPEN":
      return 0;
    case "READY":
    case "AWAITING_SLIP":
    case "SLIP_REVIEW":
      return 1;
    case "CONFIRMED":
    case "DISPATCHED":
      return 2;
    case "DELIVERED":
      return 3;
    default:
      return -1;
  }
}

export type NextStepInput = {
  status: CartStatus;
  /** The viewer owns the cart */
  mine: boolean;
  code: string;
  total: Decimal.Value;
  minOrderValue: Decimal.Value;
  /** The viewer's own items */
  share: Decimal.Value;
  ownerName: string;
  /** Reason the owner's last slip was rejected, if it was */
  rejectedNote?: string | null;
  trackingUrl?: string | null;
};

export type NextStep = {
  /** Omitted when the progress bar already says it (an open cart) */
  text?: string;
  /** Extra line for members: settling their share with the owner */
  note?: string;
  action?: { label: string; href: string; external?: boolean };
  /** Which deadline to count down, if any */
  deadline?: "expires" | "slip";
  /** Offer "Copy cart link" (only while the cart still needs people) */
  share?: boolean;
};

/** The one sentence and one button for a buyer's current cart (rule 12: there is only one). */
export function nextStep(c: NextStepInput): NextStep {
  const cart = `/c/${c.code}`;
  const settle = `Settle your ${formatLKR(c.share)} with ${c.ownerName}.`;
  switch (c.status) {
    case "OPEN":
      return {
        action: { label: "View cart", href: cart },
        deadline: "expires",
        share: true,
      };
    case "READY":
      return c.mine
        ? {
            text: "Minimum reached. Accept the order to lock it, then pay.",
            action: { label: "Accept & pay", href: cart },
            deadline: "expires",
          }
        : {
            // No sentence: the "Minimum reached" badge already says it.
            action: { label: "View cart", href: cart },
            deadline: "expires",
          };
    case "AWAITING_SLIP":
      return c.mine
        ? {
            text:
              `Pay ${formatLKR(c.total)} and upload the bank slip.` +
              (c.rejectedNote ? ` Your last slip wasn't accepted: ${c.rejectedNote}` : ""),
            action: { label: "Upload bank slip", href: `${cart}/pay` },
            deadline: "slip",
          }
        : {
            text: `${c.ownerName} is paying for the whole cart.`,
            note: settle,
            action: { label: "View cart", href: cart },
            deadline: "slip",
          };
    case "SLIP_REVIEW":
      return {
        text: "We're checking the bank slip. You'll be notified when it's confirmed.",
        note: c.mine ? undefined : settle,
      };
    case "CONFIRMED":
      return {
        text: c.mine
          ? "Paid. We're arranging the PickMe delivery to you."
          : `Paid. We're arranging the PickMe delivery to ${c.ownerName}.`,
        note: c.mine ? undefined : settle,
      };
    case "DISPATCHED":
      return {
        text: c.mine
          ? "On its way with PickMe. Pay the driver the delivery fee."
          : `On its way to ${c.ownerName} with PickMe.`,
        action: c.trackingUrl
          ? { label: "Track delivery", href: c.trackingUrl, external: true }
          : undefined,
      };
    default:
      return { text: "This cart is closed.", action: { label: "View cart", href: cart } };
  }
}

// ─── Admin carts list: stages and urgency ────────────────────────────────────

export type AdminStage = "active" | "filling" | "paying" | "delivering" | "done" | "closed" | "all";

/** Statuses where the next move is an admin's: review the slip, book the drop, mark it delivered. */
export const ADMIN_TURN: readonly CartStatus[] = ["SLIP_REVIEW", "CONFIRMED", "DISPATCHED"];

/** The admin carts tabs. Active is the default: everything not yet delivered or closed. */
export const ADMIN_STAGES: readonly {
  key: AdminStage;
  label: string;
  statuses: readonly CartStatus[];
}[] = [
  { key: "active", label: "Active", statuses: [...HOLDS_STOCK, "CONFIRMED", "DISPATCHED"] },
  { key: "filling", label: "Filling", statuses: EDITABLE },
  { key: "paying", label: "Paying", statuses: ["AWAITING_SLIP", "SLIP_REVIEW"] },
  { key: "delivering", label: "Delivering", statuses: ["CONFIRMED", "DISPATCHED"] },
  { key: "done", label: "Done", statuses: ["DELIVERED"] },
  { key: "closed", label: "Closed", statuses: ["EXPIRED", "CANCELLED"] },
  { key: "all", label: "All", statuses: Object.keys(STATUS_LABEL) as CartStatus[] },
];

/** The stage a status belongs to (not Active or All), for the admin cart page's stepper. */
export function adminStage(status: CartStatus): AdminStage {
  return ADMIN_STAGES.slice(1, 6).find((s) => s.statuses.includes(status))!.key;
}

/** The deadline running now: the cart's expiry while filling, the slip window while paying. */
export function dueAt(c: Deadlines): Date | null {
  if (isEditable(c.status)) return c.expiresAt;
  if (c.status === "AWAITING_SLIP") return c.slipDueAt;
  return null;
}

/**
 * Order for live admin lists: carts waiting on an admin first (longest waiting first), then the
 * soonest deadline, then the rest by latest activity.
 */
export function byUrgency<T extends Deadlines & { updatedAt: Date }>(a: T, b: T): number {
  const rank = (c: T) => (ADMIN_TURN.includes(c.status) ? 0 : dueAt(c) ? 1 : 2);
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return a.updatedAt.getTime() - b.updatedAt.getTime();
  if (ra === 1) return dueAt(a)!.getTime() - dueAt(b)!.getTime();
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}
