import { describe, expect, it } from "vitest";
import { canMoveBasket, canMoveOrder } from "./order-rules";

describe("order moves", () => {
  it.each([
    ["PENDING", "PAID"],
    ["PENDING", "CANCELLED"],
    ["PAID", "RECEIVED"],
    ["PAID", "CANCELLED"],
  ] as const)("allows %s -> %s", (a, b) => expect(canMoveOrder(a, b)).toBe(true));
  it("refuses others", () => {
    expect(canMoveOrder("PENDING", "RECEIVED")).toBe(false);
    expect(canMoveOrder("RECEIVED", "CANCELLED")).toBe(false);
    expect(canMoveOrder("CANCELLED", "PAID")).toBe(false);
  });
});

describe("basket moves", () => {
  it.each([
    ["OPEN", "LOCKED"],
    ["LOCKED", "PACKED"],
    ["PACKED", "WITH_COURIER"],
    ["WITH_COURIER", "AT_AGENT"],
  ] as const)("allows %s -> %s", (a, b) => expect(canMoveBasket(a, b)).toBe(true));
  it("refuses skips and terminal moves", () => {
    expect(canMoveBasket("OPEN", "PACKED")).toBe(false);
    expect(canMoveBasket("AT_AGENT", "OPEN")).toBe(false);
    expect(canMoveBasket("LOCKED", "OPEN")).toBe(false);
  });
});
