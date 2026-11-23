import { describe, expect, it } from "vitest";
import { packAmountDue, packCommission } from "./pack-money";

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
