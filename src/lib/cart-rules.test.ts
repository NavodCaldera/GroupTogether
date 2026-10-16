import { describe, expect, it } from "vitest";
import {
  addHours,
  cartTotal,
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
