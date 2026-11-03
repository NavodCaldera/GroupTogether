import { describe, expect, it } from "vitest";
import {
  citiesShown,
  compareSizes,
  sizeGrid,
  median,
  paidTotals,
  priceBand,
  ratingDisplay,
  restockAdvice,
  stockAlert,
  towardMinimum,
} from "./factory-insights";

describe("factory figures", () => {
  it("count only paid carts as sales, never reservations in open carts", () => {
    const lines = [
      { qty: 2, unitPrice: "1000", status: "CONFIRMED" as const },
      { qty: 1, unitPrice: "1000", status: "DELIVERED" as const },
      { qty: 5, unitPrice: "1000", status: "OPEN" as const },
      { qty: 3, unitPrice: "1000", status: "SLIP_REVIEW" as const },
      { qty: 4, unitPrice: "1000", status: "EXPIRED" as const },
    ];
    const t = paidTotals(lines);
    expect(t.pieces).toBe(3);
    expect(t.value.toString()).toBe("3000");
  });

  it("hide the rating average below 5 ratings but always give the count", () => {
    expect(ratingDisplay([5, 5, 4, 4])).toEqual({ count: 4, average: null });
    expect(ratingDisplay([5, 5, 4, 4, 2])).toEqual({ count: 5, average: 4 });
    expect(ratingDisplay([])).toEqual({ count: 0, average: null });
  });

  it("suppress cities with fewer than 5 orders", () => {
    const rows = [
      { city: "Colombo", orders: 9 },
      { city: "Kandy", orders: 5 },
      { city: "Jaffna", orders: 4 },
    ];
    expect(citiesShown(rows).map((r) => r.city)).toEqual(["Colombo", "Kandy"]);
  });

  it("flag low and sold-out sizes and advise restocking", () => {
    expect(stockAlert(0)).toBe("sold-out");
    expect(stockAlert(3)).toBe("low");
    expect(stockAlert(4)).toBeNull();
    expect(restockAdvice({ size: "M", available: 2, reserved: 4 })).toBe(
      "Size M: 2 left, 4 wanted in active carts — restock",
    );
    expect(restockAdvice({ size: "L", available: 20, reserved: 2 })).toBeNull();
  });

  it("median, price bands and progress to the minimum", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 2])).toBe(3);
    expect(median([])).toBeNull();
    expect(priceBand("1999.99")).toBe("Under 2,000");
    expect(priceBand("4000")).toBe("4,000–5,999");
    expect(priceBand("9000")).toBe("6,000 and up");
    expect(towardMinimum("25000", "50000")).toBe(50);
    expect(towardMinimum("60000", "50000")).toBe(100);
  });

  it("lay out a cutting-ticket grid with sizes in reading order", () => {
    expect(["XL", "S", "M"].sort(compareSizes)).toEqual(["S", "M", "XL"]);
    expect(["UK 10", "UK 8", "UK 9"].sort(compareSizes)).toEqual(["UK 8", "UK 9", "UK 10"]);
    const grid = sizeGrid([
      { qty: 12, size: "L", colour: "", product: "Shirt" },
      { qty: 12, size: "M", colour: "", product: "Shirt" },
      { qty: 3, size: "M", colour: "", product: "Shirt" },
      { qty: 2, size: "S", colour: "Blue", product: "Dress" },
    ]);
    expect(grid.sizes).toEqual(["S", "M", "L"]);
    expect(grid.rows).toEqual([
      { label: "Shirt", cells: { L: 12, M: 15 }, total: 27 },
      { label: "Dress, Blue", cells: { S: 2 }, total: 2 },
    ]);
    expect(grid.total).toBe(29);
  });
});
