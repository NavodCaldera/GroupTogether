import { describe, expect, it } from "vitest";
import { D } from "./decimal";
import {
  checkEndsAt,
  dealRebate,
  nextTier,
  parseMaxQty,
  parseTiers,
  refundUnitPrice,
  tierAt,
  unitsLeft,
} from "./deal-rules";
import { commissionFor, tierBuyerPrice } from "./price-rules";

const tiers = [
  { minQty: 1, price: "450" },
  { minQty: 100, price: "400" },
  { minQty: 400, price: "380" },
];

describe("deal tiers", () => {
  it("parse rows, dropping blanks and sorting by quantity", () => {
    const parsed = parseTiers([
      { minQty: "100", factoryPrice: "300" },
      { minQty: "", factoryPrice: "" },
      { minQty: "1", factoryPrice: "350.50" },
    ]);
    expect(parsed.map((t) => [t.minQty, t.factoryPrice.toFixed(2)])).toEqual([
      [1, "350.50"],
      [100, "300.00"],
    ]);
  });

  it("refuse a first tier above 1, repeated quantities and prices that do not fall", () => {
    expect(() => parseTiers([{ minQty: "5", factoryPrice: "100" }])).toThrow(/starts at 1/);
    expect(() =>
      parseTiers([
        { minQty: "1", factoryPrice: "100" },
        { minQty: "1", factoryPrice: "90" },
      ]),
    ).toThrow(/own quantity/);
    expect(() =>
      parseTiers([
        { minQty: "1", factoryPrice: "100" },
        { minQty: "10", factoryPrice: "100" },
      ]),
    ).toThrow(/lower/);
    expect(() => parseTiers([{ minQty: "1", factoryPrice: "1.234" }])).toThrow(/price/);
    expect(() => parseTiers([{ minQty: "1.5", factoryPrice: "10" }])).toThrow(/whole/);
    expect(() => parseTiers([])).toThrow(/at least one/);
  });

  it("pick the highest tier reached, tier 1 with nothing sold", () => {
    expect(tierAt(tiers, 0).price).toBe("450");
    expect(tierAt(tiers, 99).price).toBe("450");
    expect(tierAt(tiers, 100).price).toBe("400");
    expect(tierAt(tiers, 399).price).toBe("400");
    expect(tierAt(tiers, 400).price).toBe("380");
    expect(tierAt(tiers, 5000).price).toBe("380");
  });

  it("say how many more reach the next tier", () => {
    expect(nextTier(tiers, 312)).toEqual({ tier: tiers[2], more: 88 });
    expect(nextTier(tiers, 0)).toEqual({ tier: tiers[1], more: 100 });
    expect(nextTier(tiers, 400)).toBeNull();
  });

  it("count capacity left from sold and held units", () => {
    expect(unitsLeft({ maxQty: null, unitsSold: 5, unitsHeld: 5 })).toBeNull();
    expect(unitsLeft({ maxQty: 10, unitsSold: 6, unitsHeld: 3 })).toBe(1);
    expect(unitsLeft({ maxQty: 10, unitsSold: 8, unitsHeld: 3 })).toBe(0);
    expect(parseMaxQty("", [{ minQty: 1 }])).toBeNull();
    expect(parseMaxQty("500", [{ minQty: 1 }, { minQty: 400 }])).toBe(500);
    expect(() => parseMaxQty("300", [{ minQty: 1 }, { minQty: 400 }])).toThrow(/below/);
  });

  it("ends in the future, at most 60 days ahead", () => {
    const now = new Date("2026-11-21T00:00:00Z");
    expect(() => checkEndsAt(new Date("2026-11-20T00:00:00Z"), now)).toThrow(/future/);
    expect(() => checkEndsAt(new Date("2027-02-01T00:00:00Z"), now)).toThrow(/60 days/);
    expect(() => checkEndsAt(new Date(NaN), now)).toThrow(/Choose/);
    expect(checkEndsAt(new Date("2026-12-01T00:00:00Z"), now).toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
  });
});

describe("deal rebate", () => {
  it("is (paid − final) × units kept, in exact decimals", () => {
    expect(dealRebate(new D("550"), new D("480"), 3, 0, 0).toFixed(2)).toBe("210.00");
    expect(dealRebate(new D("100.10"), new D("99.95"), 7, 0, 0).toFixed(2)).toBe("1.05");
  });

  it("leaves out missing and returned units and is never negative", () => {
    expect(dealRebate(new D("550"), new D("480"), 3, 1, 1).toFixed(2)).toBe("70.00");
    expect(dealRebate(new D("550"), new D("480"), 2, 1, 1).toFixed(2)).toBe("0.00");
    expect(dealRebate(new D("480"), new D("550"), 2, 0, 0).toFixed(2)).toBe("0.00");
  });

  it("refunds the paid price before settlement and the final price after", () => {
    expect(refundUnitPrice({ unitPrice: new D("550"), finalUnitPrice: null }).toFixed(2)).toBe(
      "550.00",
    );
    expect(
      refundUnitPrice({ unitPrice: new D("550"), finalUnitPrice: new D("480") }).toFixed(2),
    ).toBe("480.00");
  });
});

describe("tier buyer price", () => {
  const settings = { commissionPerPiece: new D("100") };
  it("adds the listing's commission, else the setting", () => {
    expect(commissionFor({ commission: new D("80") }, settings).toFixed(2)).toBe("80.00");
    expect(commissionFor({ commission: null }, settings).toFixed(2)).toBe("100.00");
    expect(tierBuyerPrice("450", { commission: new D("80") }, settings).toFixed(2)).toBe("530.00");
    expect(tierBuyerPrice("450.25", { commission: null }, settings).toFixed(2)).toBe("550.25");
  });
});
