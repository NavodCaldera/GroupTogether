import { describe, expect, it } from "vitest";
import {
  addHours,
  cartTotal,
  isActiveCart,
  mergeBlockReason,
  newCartCode,
  overdue,
  progress,
  remaining,
  statusAfterChange,
} from "./cart-rules";
import { timeLeft } from "./format";

describe("cart total", () => {
  it("adds qty × unit price exactly", () => {
    const total = cartTotal([
      { qty: 3, unitPrice: "4999.99" },
      { qty: 1, unitPrice: "0.03" },
    ]);
    expect(total.toFixed(2)).toBe("15000.00");
  });

  it("progress caps at 1 and remaining never goes negative", () => {
    expect(progress("25000", "50000")).toBe(0.5);
    expect(progress("70000", "50000")).toBe(1);
    expect(remaining("70000", "50000").toString()).toBe("0");
    expect(remaining("49999.50", "50000").toString()).toBe("0.5");
  });
});

describe("OPEN ⇄ READY", () => {
  it("becomes READY exactly at the minimum and says so once", () => {
    expect(statusAfterChange("OPEN", "49999.99", "50000")).toEqual({
      status: "OPEN",
      becameReady: false,
    });
    expect(statusAfterChange("OPEN", "50000", "50000")).toEqual({
      status: "READY",
      becameReady: true,
    });
    expect(statusAfterChange("READY", "60000", "50000")).toEqual({
      status: "READY",
      becameReady: false,
    });
  });

  it("drops back to OPEN when items are removed", () => {
    expect(statusAfterChange("READY", "10000", "50000").status).toBe("OPEN");
  });

  it("never changes a cart the owner has accepted", () => {
    expect(statusAfterChange("AWAITING_SLIP", "0", "50000").status).toBe("AWAITING_SLIP");
  });
});

describe("deadlines", () => {
  const start = new Date("2026-10-16T08:00:00Z");
  const expiresAt = addHours(start, 24);

  it("expires OPEN and READY carts at 24h", () => {
    expect(overdue({ status: "OPEN", expiresAt, slipDueAt: null }, addHours(start, 23.9))).toBe(
      null,
    );
    expect(overdue({ status: "OPEN", expiresAt, slipDueAt: null }, expiresAt)).toBe("EXPIRE");
    expect(overdue({ status: "READY", expiresAt, slipDueAt: null }, expiresAt)).toBe("EXPIRE");
  });

  it("cancels an accepted cart when the 2h slip window passes, ignoring the 24h expiry", () => {
    const slipDueAt = addHours(start, 2);
    const cart = { status: "AWAITING_SLIP" as const, expiresAt: start, slipDueAt };
    expect(overdue(cart, addHours(start, 1.99))).toBe(null);
    expect(overdue(cart, slipDueAt)).toBe("SLIP_MISSED");
  });

  it("leaves a cart in review alone", () => {
    expect(overdue({ status: "SLIP_REVIEW", expiresAt: start, slipDueAt: start }, expiresAt)).toBe(
      null,
    );
  });

  it("formats time left", () => {
    expect(timeLeft(addHours(start, 2), start)).toBe("2h 0m left");
    expect(timeLeft(new Date(start.getTime() + 90_000), start)).toBe("2m left");
    expect(timeLeft(start, start)).toBe("ended");
  });
});

describe("share codes", () => {
  it("are 8 characters from the no-look-alike alphabet", () => {
    const code = newCartCode((n) => new Uint8Array(n).map((_, i) => i * 37));
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
  });
});

describe("one cart at a time", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  const future = addHours(now, 5);
  it("counts carts that still hold stock", () => {
    for (const status of ["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW"] as const)
      expect(isActiveCart({ status, expiresAt: future, slipDueAt: future }, now)).toBe(true);
  });
  it("ignores finished, closed and overdue carts", () => {
    for (const status of ["CONFIRMED", "DISPATCHED", "DELIVERED", "EXPIRED", "CANCELLED"] as const)
      expect(isActiveCart({ status, expiresAt: future, slipDueAt: null }, now)).toBe(false);
    expect(
      isActiveCart({ status: "OPEN", expiresAt: addHours(now, -1), slipDueAt: null }, now),
    ).toBe(false);
    expect(
      isActiveCart(
        { status: "AWAITING_SLIP", expiresAt: future, slipDueAt: addHours(now, -1) },
        now,
      ),
    ).toBe(false);
  });
});

describe("merging carts", () => {
  const now = new Date("2026-10-17T10:00:00Z");
  const future = addHours(now, 5);
  const from = { status: "OPEN" as const, expiresAt: future, ownerId: "me", memberCount: 1 };
  const to = { status: "READY" as const, expiresAt: future };
  it("allows a sole-owner cart into an open one", () => {
    expect(mergeBlockReason({ from, to, userId: "me" }, now)).toBeNull();
  });
  it("allows a member to move out of someone else's cart", () => {
    expect(
      mergeBlockReason({ from: { ...from, ownerId: "x", memberCount: 4 }, to, userId: "me" }, now),
    ).toBeNull();
  });
  it("refuses when the owner's cart has other members", () => {
    expect(mergeBlockReason({ from: { ...from, memberCount: 2 }, to, userId: "me" }, now)).toMatch(
      /other members/,
    );
  });
  it("refuses frozen, closed or expired carts on either side", () => {
    expect(
      mergeBlockReason({ from: { ...from, status: "AWAITING_SLIP" }, to, userId: "me" }, now),
    ).toMatch(/already being paid/);
    expect(
      mergeBlockReason({ from, to: { ...to, status: "AWAITING_SLIP" }, userId: "me" }, now),
    ).toMatch(/no longer taking/);
    expect(
      mergeBlockReason({ from, to: { ...to, expiresAt: addHours(now, -1) }, userId: "me" }, now),
    ).toMatch(/no longer taking/);
  });
});
