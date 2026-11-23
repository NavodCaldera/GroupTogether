import { describe, expect, it } from "vitest";
import { D } from "./decimal";
import {
  isBasketSize,
  itemCosts,
  packAmountDue,
  packCommission,
  sizePrice,
  sizeTable,
} from "./pack-money";

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

describe("item costs for resale", () => {
  it("splits the basket price by shop value and the lines add up to it exactly", () => {
    const items = [
      { qty: 4, retailPrice: "140.00" },
      { qty: 1, retailPrice: "260.00" },
      { qty: 1, retailPrice: "690.00" },
    ];
    const c = itemCosts("2327.50", items)!;
    expect(c.map((x) => x.line.toFixed(2))).toEqual(["863.18", "400.76", "1063.56"]);
    expect(c.reduce((a, x) => a.plus(x.line), new D(0)).toFixed(2)).toBe("2327.50");
    expect(c[0].unit.toFixed(2)).toBe("215.80");
  });

  it("gives leftover cents to the largest remainders, earliest first on ties", () => {
    const c = itemCosts("100.00", [
      { qty: 1, retailPrice: "1" },
      { qty: 1, retailPrice: "1" },
      { qty: 1, retailPrice: "1" },
    ])!;
    expect(c.map((x) => x.line.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
  });

  it("is unknown when any item has no shop price", () => {
    expect(
      itemCosts("100.00", [
        { qty: 1, retailPrice: null },
        { qty: 1, retailPrice: "5" },
      ]),
    ).toBe(null);
  });
});
