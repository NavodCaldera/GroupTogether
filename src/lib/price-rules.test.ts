import { describe, expect, it } from "vitest";
import { buyerPrice, validCommission } from "./price-rules";

describe("factory commission", () => {
  it("adds the snapshot exactly", () =>
    expect(buyerPrice("1400", "100").toFixed(2)).toBe("1500.00"));
  it("allows zero and refuses negatives, precision loss and overflow", () => {
    expect(validCommission("0")).toBe(true);
    for (const v of ["-1", "1.001", "1.000", "NaN", "Infinity", "1000000000000"])
      expect(validCommission(v)).toBe(false);
  });
});
