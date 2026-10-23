import { describe, expect, it } from "vitest";
import {
  byPrice,
  CHART_DAYS,
  chartDays,
  daysOnSale,
  demandLabel,
  demandOf,
  priceAt,
  priceSpans,
  sellRate,
  similarRate,
  splitTestBulk,
  type DemandLine,
} from "./design-rules";

const at = (iso: string) => new Date(`${iso}+05:30`);
const now = at("2026-10-24T12:00:00");

const line = (iso: string, qty: number, price: string, userId: string, bought = true) =>
  ({ at: at(iso), qty, unitPrice: price, userId, bought }) satisfies DemandLine;

describe("price spans", () => {
  const spans = priceSpans(
    [
      { price: "2150", at: at("2026-10-18T09:00:00") },
      { price: "2400", at: at("2026-10-04T09:00:00") },
      { price: "2400", at: at("2026-10-10T09:00:00") },
    ],
    now,
  );

  it("sorts, merges repeats and runs the last price to now", () => {
    expect(spans.map((s) => s.price.toString())).toEqual(["2400", "2150"]);
    expect(spans[0].to).toEqual(at("2026-10-18T09:00:00"));
    expect(spans[1].to).toEqual(now);
  });

  it("finds the price at a moment", () => {
    expect(priceAt(spans, at("2026-10-01T00:00:00"))).toBeNull();
    expect(priceAt(spans, at("2026-10-12T00:00:00"))?.toString()).toBe("2400");
    expect(priceAt(spans, at("2026-10-20T00:00:00"))?.toString()).toBe("2150");
  });

  it("ignores prices after now", () => {
    expect(priceSpans([{ price: "1", at: at("2026-10-30T00:00:00") }], now)).toEqual([]);
  });
});

describe("chart days", () => {
  const spans = priceSpans(
    [
      { price: "2400", at: at("2026-10-20T09:00:00") },
      { price: "2150", at: at("2026-10-22T15:00:00") },
    ],
    now,
  );
  const lines = [
    line("2026-10-20T10:00:00", 4, "2400", "a"),
    line("2026-10-20T11:00:00", 3, "2400", "b", false),
    line("2026-10-23T08:00:00", 6, "2150", "a"),
  ];
  const days = chartDays(spans, lines, now);

  it("has one row per Colombo day from the first price to today", () => {
    expect(days.map((d) => d.start)).toEqual([
      at("2026-10-20T00:00:00"),
      at("2026-10-21T00:00:00"),
      at("2026-10-22T00:00:00"),
      at("2026-10-23T00:00:00"),
      at("2026-10-24T00:00:00"),
    ]);
  });

  it("counts wanted and bought pieces on the day they were put in a cart", () => {
    expect(days.map((d) => [d.wanted, d.bought])).toEqual([
      [7, 4],
      [0, 0],
      [0, 0],
      [6, 6],
      [0, 0],
    ]);
  });

  it("shows the price at the end of each day", () => {
    expect(days.map((d) => d.price?.toString())).toEqual(["2400", "2400", "2150", "2150", "2150"]);
  });

  it("keeps only the last 60 days", () => {
    const long = chartDays(
      priceSpans([{ price: "100", at: at("2026-01-01T00:00:00") }], now),
      [line("2026-01-02T00:00:00", 1, "100", "a")],
      now,
    );
    expect(long).toHaveLength(CHART_DAYS);
    expect(long.at(-1)?.start).toEqual(at("2026-10-24T00:00:00"));
    expect(long.reduce((n, d) => n + d.wanted, 0)).toBe(0);
  });

  it("is empty without a price", () => {
    expect(chartDays([], lines, now)).toEqual([]);
  });
});

describe("by price", () => {
  const spans = priceSpans(
    [
      { price: "2400", at: at("2026-10-14T12:00:00") },
      { price: "2150", at: at("2026-10-20T12:00:00") },
    ],
    now,
  );
  const rows = byPrice(spans, [
    line("2026-10-15T10:00:00", 9, "2400", "a"),
    line("2026-10-16T10:00:00", 3, "2400", "b"),
    line("2026-10-17T10:00:00", 5, "2400", "c", false),
    line("2026-10-21T10:00:00", 16, "2150", "a"),
    line("2026-10-22T10:00:00", 4, "2150", "a"),
    line("2026-10-10T10:00:00", 2, "2600", "d"),
  ]);

  it("lists each price cheapest first with days, pieces and people", () => {
    expect(
      rows.map((r) => [r.price.toString(), r.days, r.wanted, r.bought, r.people, r.perDay]),
    ).toEqual([
      ["2150", 4, 20, 20, 1, 5],
      ["2400", 6, 17, 12, 2, 2],
      ["2600", 0, 2, 2, 1, null],
    ]);
  });
});

describe("demand", () => {
  it("counts pieces and different people", () => {
    expect(
      demandOf([
        line("2026-10-20T10:00:00", 4, "1", "a"),
        line("2026-10-20T11:00:00", 2, "1", "a"),
        line("2026-10-21T10:00:00", 3, "1", "b", false),
      ]),
    ).toEqual({ wanted: 9, bought: 6, people: 1, wantedBy: 2 });
  });

  it("ends the days on sale at the last sale once sold out", () => {
    const start = at("2026-10-14T00:00:00");
    expect(daysOnSale(start, now, 5, at("2026-10-16T00:00:00"))).toBe(10.5);
    expect(daysOnSale(start, now, 0, at("2026-10-16T00:00:00"))).toBe(2);
    expect(daysOnSale(now, now, 0, null)).toBe(1);
  });

  it("works out pieces a day", () => {
    expect(sellRate(21, 4)).toBe(5.3);
    expect(sellRate(3, 0)).toBe(3);
  });

  it("labels a design against similar ones", () => {
    expect(demandLabel(5, [2, 2])).toBe("fast");
    expect(demandLabel(2, [2, 2.2])).toBe("average");
    expect(demandLabel(1, [2, 2])).toBe("slow");
    expect(demandLabel(5, [2])).toBeNull();
    expect(demandLabel(1, [0, 0])).toBe("fast");
    expect(demandLabel(0, [0, 0])).toBeNull();
    expect(similarRate([2, 3])).toBe(2.5);
    expect(similarRate([2])).toBeNull();
  });

  it("splits the test from the bulk when the bulk arrived", () => {
    const lines = [
      line("2026-10-10T00:00:00", 1, "1", "a"),
      line("2026-10-20T00:00:00", 2, "1", "a"),
    ];
    const { test, bulk } = splitTestBulk(lines, at("2026-10-18T00:00:00"));
    expect(test.map((l) => l.qty)).toEqual([1]);
    expect(bulk.map((l) => l.qty)).toEqual([2]);
    expect(splitTestBulk(lines, null).test).toHaveLength(2);
  });
});
