import { describe, expect, it } from "vitest";
import { isBasketSize, packAmountDue, packCommission, sizePrice, sizeTable } from "./pack-money";

describe("pack money (DEC-030)", () => {
  it("takes the pack's percentage of the price per family", () => {
    expect(packCommission("150.00", "10").toFixed(2)).toBe("15.00");
    expect(packCommission("4600.00", "7.5").toFixed(2)).toBe("345.00");
    expect(packCommission("99.99", "3").toFixed(2)).toBe("3.00");
  });

  it("owes the company the price less commission for every family", () => {
    expect(packAmountDue("150.00", "10", 10).toFixed(2)).toBe("1350.00");
    expect(packAmountDue("99.99", "3", 7).toFixed(2)).toBe("678.93");
  });
});

describe("basket sizes", () => {
  const v = { pricePerFamily: "2450.00", discount5: "5", discount10: "10", discount15: "12.5" };

  it("takes each size's discount off the full price, to the cent", () => {
    expect(sizePrice(v, 5).toFixed(2)).toBe("2327.50");
    expect(sizePrice(v, 10).toFixed(2)).toBe("2205.00");
    expect(sizePrice(v, 15).toFixed(2)).toBe("2143.75");
    expect(sizePrice({ ...v, pricePerFamily: "99.99", discount5: "3.33" }, 5).toFixed(2)).toBe(
      "96.66",
    );
  });

  it("lists 5, 10 and 15 families and nothing else", () => {
    expect(sizeTable(v).map((r) => [r.size, r.pct.toString(), r.price.toFixed(2)])).toEqual([
      [5, "5", "2327.50"],
      [10, "10", "2205.00"],
      [15, "12.5", "2143.75"],
    ]);
    expect([4, 5, 8, 10, 15, 20].filter(isBasketSize)).toEqual([5, 10, 15]);
  });
});
