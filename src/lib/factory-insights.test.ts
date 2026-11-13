import { describe, expect, it } from "vitest";
import {
  citiesShown,
  compareSizes,
  median,
  priceBand,
  ratingDisplay,
  restockAdvice,
  stockAlert,
} from "./factory-insights";

describe("factory figures", () => {
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
      "Size M: 2 left, 4 held for unpaid orders — restock",
    );
    expect(restockAdvice({ size: "L", available: 20, reserved: 2 })).toBeNull();
  });

  it("median and price bands", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 2])).toBe(3);
    expect(median([])).toBeNull();
    expect(priceBand("1999.99")).toBe("Under 2,000");
    expect(priceBand("4000")).toBe("4,000–5,999");
    expect(priceBand("9000")).toBe("6,000 and up");
  });

  it("sort sizes in reading order", () => {
    expect(["XL", "S", "M"].sort(compareSizes)).toEqual(["S", "M", "XL"]);
    expect(["UK 10", "UK 8", "UK 9"].sort(compareSizes)).toEqual(["UK 8", "UK 9", "UK 10"]);
  });
});
