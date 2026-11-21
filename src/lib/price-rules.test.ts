import { describe, expect, it } from "vitest";
import {
  buyerPrice,
  categoryCommission,
  savingPercent,
  tierBuyerPrice,
  validCommission,
  validCommissionPct,
} from "./price-rules";

describe("factory commission", () => {
  it("adds the snapshot exactly", () =>
    expect(buyerPrice("1400", "100").toFixed(2)).toBe("1500.00"));
  it("allows zero and refuses negatives, precision loss and overflow", () => {
    expect(validCommission("0")).toBe(true);
    for (const v of ["-1", "1.001", "1.000", "NaN", "Infinity", "1000000000000"])
      expect(validCommission(v)).toBe(false);
  });
});

describe("savingPercent", () => {
  it("rounds the saving down to a whole percent", () => {
    expect(savingPercent("1000", "2000")).toBe(50);
    expect(savingPercent("1299", "3000")).toBe(56);
  });
  it("is null without a retail price above ours", () => {
    expect(savingPercent("1000", null)).toBeNull();
    expect(savingPercent("1000", "1000")).toBeNull();
    expect(savingPercent("1000", "900")).toBeNull();
  });
});

describe("category commission", () => {
  const flat = "100";
  it("falls back to the flat commission when no percent is set", () => {
    expect(categoryCommission("1400", { pct: null, min: null }, flat).toFixed(2)).toBe("100.00");
    expect(categoryCommission("1400", { pct: null, min: "500" }, flat).toFixed(2)).toBe("100.00");
  });
  it("takes the percent of the factory price, rounded half-up to cents", () => {
    expect(categoryCommission("1400", { pct: "10", min: null }, flat).toFixed(2)).toBe("140.00");
    expect(categoryCommission("0.05", { pct: "10", min: null }, flat).toFixed(2)).toBe("0.01");
    expect(categoryCommission("333.33", { pct: "7.5", min: null }, flat).toFixed(2)).toBe("25.00");
  });
  it("is at least the minimum", () => {
    expect(categoryCommission("100", { pct: "10", min: "50" }, flat).toFixed(2)).toBe("50.00");
    expect(categoryCommission("1000", { pct: "10", min: "50" }, flat).toFixed(2)).toBe("100.00");
  });
  it("refuses a bad factory price and checks percent bounds", () => {
    expect(() => categoryCommission("-1", { pct: "10", min: null }, flat)).toThrow();
    expect(validCommissionPct("100")).toBe(true);
    expect(validCommissionPct("100.01")).toBe(false);
  });
  it("prices a tier from the category, else the listing snapshot", () => {
    const s = { commissionPerPiece: "100" };
    expect(tierBuyerPrice("1000", { commission: "80" }, s).toFixed(2)).toBe("1080.00");
    expect(
      tierBuyerPrice("1000", { commission: "80" }, s, { pct: null, min: null }).toFixed(2),
    ).toBe("1080.00");
    expect(
      tierBuyerPrice("1000", { commission: "80" }, s, { pct: "12", min: null }).toFixed(2),
    ).toBe("1120.00");
  });
});
