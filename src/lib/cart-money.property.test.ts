import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { amountDue, cartTotal, remaining, statusAfterChange, type CartStatus } from "./cart-rules";
import { D } from "./decimal";

const money = fc.integer({ min: 0, max: 100_000_000 }).map((cents) => ({
  cents: BigInt(cents),
  price: `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`,
}));

describe("cart monetary invariants", () => {
  it("totals match an independent integer-cent model and do not depend on line order", () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ amount: money, qty: fc.integer({ min: 0, max: 100 }) }), {
          maxLength: 30,
        }),
        (items) => {
          const lines = items.map(({ amount, qty }) => ({ unitPrice: amount.price, qty }));
          const cents = items.reduce(
            (sum, item) => sum + item.amount.cents * BigInt(item.qty),
            BigInt(0),
          );
          expect(cartTotal(lines).times(100).toFixed(0)).toBe(cents.toString());
          expect(cartTotal([...lines].reverse()).eq(cartTotal(lines))).toBe(true);
        },
      ),
      { seed: 20261027, numRuns: 300 },
    );
  });

  it("remaining spend is nonnegative and frozen states cannot be reclassified by totals", () => {
    fc.assert(
      fc.property(money, money, (total, minimum) => {
        const result = remaining(total.price, minimum.price);
        expect(result.gte(0)).toBe(true);
        expect(result.eq(D.max(0, new D(minimum.price).minus(total.price)))).toBe(true);
        for (const state of ["CONFIRMED", "SLIP_REVIEW", "CANCELLED"] as CartStatus[])
          expect(statusAfterChange(state, total.price, minimum.price)).toEqual({
            status: state,
            becameReady: false,
          });
      }),
      { seed: 20261028, numRuns: 200 },
    );
  });
});

it("amount due matches integer cents and stays between zero and the gross total", () => {
  fc.assert(
    fc.property(money, fc.array(money, { maxLength: 20 }), (total, holds) => {
      const applied = holds.reduce((sum, h) => sum + h.cents, 0n);
      const expected = total.cents > applied ? total.cents - applied : 0n;
      const due = amountDue(
        total.price,
        holds.map((h) => h.price),
      );
      expect(due.times(100).toFixed(0)).toBe(expected.toString());
      expect(due.gte(0) && due.lte(total.price)).toBe(true);
    }),
    { seed: 20261106, numRuns: 300 },
  );
});
