import { describe, expect, it } from "vitest";
import { qtyAllowed, qtyProblem, qtyRule, snapQty } from "./order-qty";

describe("order quantity rule", () => {
  it("allows any quantity by default", () => {
    expect(qtyAllowed(1, null)).toBe(true);
    expect(qtyAllowed(7, { minOrderQty: 1, stepQty: 1 })).toBe(true);
  });

  it("needs the minimum, then whole steps", () => {
    const r = { minOrderQty: 12, stepQty: 12 };
    expect(qtyAllowed(11, r)).toBe(false);
    expect(qtyAllowed(12, r)).toBe(true);
    expect(qtyAllowed(18, r)).toBe(false);
    expect(qtyAllowed(24, r)).toBe(true);
    expect(qtyAllowed(5, { minOrderQty: 5, stepQty: 1 })).toBe(true);
    expect(qtyAllowed(6, { minOrderQty: 5, stepQty: 1 })).toBe(true);
    expect(qtyAllowed(7, { minOrderQty: 3, stepQty: 2 })).toBe(true);
    expect(qtyAllowed(8, { minOrderQty: 3, stepQty: 2 })).toBe(false);
  });

  it("refuses fractions and reads bad stored values as 1", () => {
    expect(qtyAllowed(1.5, null)).toBe(false);
    expect(qtyRule({ minOrderQty: 0, stepQty: -2 })).toEqual({ minOrderQty: 1, stepQty: 1 });
  });

  it("says what is wrong", () => {
    const r = { minOrderQty: 12, stepQty: 12 };
    expect(qtyProblem(12, r)).toBeNull();
    expect(qtyProblem(6, r, "Pens")).toBe("Order at least 12 of Pens");
    expect(qtyProblem(13, r, "Pens")).toBe("Order Pens in steps of 12 from 12");
  });

  it("snaps up to the next allowed quantity", () => {
    const r = { minOrderQty: 12, stepQty: 12 };
    expect(snapQty(1, r)).toBe(12);
    expect(snapQty(13, r)).toBe(24);
    expect(snapQty(24, r)).toBe(24);
    expect(snapQty(3, null)).toBe(3);
  });
});
