import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { D } from "./decimal";
import { categoryCommission } from "./price-rules";

const cents = (max: number) => fc.integer({ min: 0, max }).map((c) => new D(c).div(100).toFixed(2));

describe("category commission properties", () => {
  it("is exact cents, never below the minimum, and within half a cent of the percent", () =>
    fc.assert(
      fc.property(cents(500_000_000), cents(10_000), fc.option(cents(100_000)), (fp, pct, min) => {
        const c = categoryCommission(fp, { pct, min }, "100");
        expect(c.decimalPlaces()).toBeLessThanOrEqual(2);
        if (min !== null) expect(c.gte(min)).toBe(true);
        const exact = new D(fp).times(pct).div(100);
        if (min === null || exact.gte(min)) expect(c.minus(exact).abs().lte("0.005")).toBe(true);
      }),
    ));
  it("never falls as the factory price rises", () =>
    fc.assert(
      fc.property(cents(1_000_000), cents(1_000_000), cents(10_000), (a, b, pct) => {
        const [lo, hi] = new D(a).lte(b) ? [a, b] : [b, a];
        const r = { pct, min: "10.00" };
        expect(categoryCommission(lo, r, "0").lte(categoryCommission(hi, r, "0"))).toBe(true);
      }),
    ));
});
