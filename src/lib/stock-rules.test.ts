import { describe, expect, it } from "vitest";
import {
  ageBand,
  ageDays,
  averageAgeDays,
  costPerPiece,
  daysToClear,
  lotMarginPct,
  lotPrice,
  lotTotalCost,
  oddSizesLeft,
  percentOf,
  priceAtMargin,
  reduceAtFor,
} from "./stock-rules";
import { D } from "./decimal";

const day = (iso: string) => new Date(`${iso}T00:00:00+05:30`);

const lot = {
  pieces: 6000,
  bulkCost: "900000",
  transportCost: "45000",
  wages: "15000",
  fullMarginPct: 20,
  reducedMarginPct: 10,
  reduceAt: reduceAtFor(day("2026-10-01"), 7),
};

describe("lot cost", () => {
  it("adds bulk, transport and wages", () => {
    expect(lotTotalCost(lot).toString()).toBe("960000");
  });

  it("spreads the total over the pieces", () => {
    expect(costPerPiece(lot).toString()).toBe("160");
  });

  it("keeps fractions until the price is rounded", () => {
    const c = costPerPiece({ pieces: 3, bulkCost: "100", transportCost: "0", wages: "0" });
    expect(c.toFixed(4)).toBe("33.3333");
  });
});

describe("price at a margin", () => {
  it("adds the margin on cost", () => {
    expect(priceAtMargin(new D(160), 20).toString()).toBe("192");
    expect(priceAtMargin(new D(160), 10).toString()).toBe("176");
  });

  it("rounds up to the whole rupee so the margin is never short", () => {
    expect(priceAtMargin(new D("33.3333"), 20).toString()).toBe("40");
    expect(priceAtMargin(new D("100.01"), 0).toString()).toBe("101");
  });
});

describe("the margin drops after the full-margin days", () => {
  it("reduces 7 days after the lot arrived", () => {
    expect(reduceAtFor(day("2026-10-01"), 7)).toEqual(day("2026-10-08"));
  });

  it("sells at the full margin for the first 7 days", () => {
    expect(lotMarginPct(lot, day("2026-10-01"))).toBe(20);
    expect(lotMarginPct(lot, new Date(day("2026-10-08").getTime() - 1))).toBe(20);
    expect(lotPrice(lot, day("2026-10-07")).toString()).toBe("192");
  });

  it("sells at the reduced margin from day 7", () => {
    expect(lotMarginPct(lot, day("2026-10-08"))).toBe(10);
    expect(lotPrice(lot, day("2026-11-30")).toString()).toBe("176");
  });
});

describe("stock age", () => {
  it("counts whole days, never negative", () => {
    expect(ageDays(day("2026-10-01"), day("2026-10-08"))).toBe(7);
    expect(ageDays(day("2026-10-08"), day("2026-10-01"))).toBe(0);
  });

  it("puts each age in a band, the last one open-ended", () => {
    expect([0, 7, 8, 14, 15, 30, 31, 400].map(ageBand)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });

  it("averages over pieces, not products", () => {
    expect(
      averageAgeDays([
        { pieces: 90, days: 2 },
        { pieces: 10, days: 42 },
      ]),
    ).toBe(6);
    expect(averageAgeDays([{ pieces: 0, days: 9 }])).toBeNull();
  });
});

describe("days to clear", () => {
  it("divides what is in store by the daily pace, rounding up", () => {
    expect(daysToClear(1000, 30)).toBe(34);
  });

  it("is unknown when nothing goes out, and 0 when the store is empty", () => {
    expect(daysToClear(1000, 0)).toBeNull();
    expect(daysToClear(0, 0)).toBe(0);
  });
});

describe("percentOf", () => {
  it("rounds down and handles an empty whole", () => {
    expect(percentOf(2, 3)).toBe(66);
    expect(percentOf("480000", "960000")).toBe(50);
    expect(percentOf(5, 0)).toBeNull();
  });
});

describe("odd sizes left", () => {
  const v = (size: string, available: number, sold: number) => ({ size, available, sold });

  it("lists the sizes left once most sizes have sold out", () => {
    expect(oddSizesLeft([v("S", 0, 9), v("M", 0, 12), v("L", 0, 8), v("XXL", 6, 1)])).toEqual([
      "XXL",
    ]);
  });

  it("ignores products still selling across their sizes", () => {
    expect(oddSizesLeft([v("S", 3, 9), v("M", 0, 12), v("L", 4, 8)])).toBeNull();
    expect(oddSizesLeft([v("S", 0, 9), v("M", 2, 1)])).toBeNull();
  });

  it("doesn't count sizes that never had sales as sold out", () => {
    expect(oddSizesLeft([v("S", 0, 0), v("M", 0, 0), v("L", 5, 0)])).toBeNull();
  });
});
