import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { balanceOf, maxApplicable } from "./token-rules";
const centsText = (v: bigint) =>
  `${v < 0n ? "-" : ""}${(v < 0n ? -v : v) / 100n}.${String((v < 0n ? -v : v) % 100n).padStart(2, "0")}`;
describe("token arithmetic", () => {
  it("sums balances and caps tokens at the available balance and remaining line value", () => {
    expect(balanceOf([{ amount: "3000" }, { amount: "-1500" }]).toFixed(2)).toBe("1500.00");
    expect(maxApplicable("3000", "1500", "0").toFixed(2)).toBe("1500.00");
    expect(maxApplicable("500", "1500", "0").toFixed(2)).toBe("500.00");
    expect(maxApplicable("500", "1500", "1500").toFixed(2)).toBe("0.00");
  });
  it("matches an independent integer-cent ledger model", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: -100000000, max: 100000000 }), { maxLength: 100 }),
        (amounts) => {
          const sum = amounts.reduce((a, b) => a + BigInt(b), 0n);
          expect(
            balanceOf(amounts.map((v) => ({ amount: centsText(BigInt(v)) })))
              .times("100")
              .toFixed(0),
          ).toBe(sum.toString());
        },
      ),
      { seed: 20261105, numRuns: 300 },
    );
  });
});
