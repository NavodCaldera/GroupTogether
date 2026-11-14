import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { D } from "./decimal";
import { agentFeeEach, gatewayFee, lineEarning, orderTotals, splitCheckout } from "./agent-money";

const price = fc.integer({ min: 100, max: 5_000_000 }).map((c) => new D(c).div(100));
const order = fc.array(fc.record({ qty: fc.integer({ min: 1, max: 20 }), unitPrice: price }), {
  minLength: 1,
  maxLength: 3,
});
const rates = { agentFeeRate: new D("0.05"), gatewayFeeRate: new D("0.033") };
const twoDp = (v: D) => v.decimalPlaces() <= 2;

describe("checkout split invariants", () => {
  it("conserves gross, fee and keeps 2 dp and nonnegative remainders", () => {
    fc.assert(
      fc.property(
        fc.array(order, { minLength: 1, maxLength: 5 }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (carts, share) => {
          const orders = carts.map((lines) => orderTotals(lines, rates));
          orders.forEach((o, i) => {
            const fee = carts[i].reduce(
              (s, l) => s.plus(agentFeeEach(l.unitPrice, rates.agentFeeRate).times(l.qty)),
              new D(0),
            );
            expect(o.agentFee.eq(fee)).toBe(true);
            expect(o.gross.eq(o.items.plus(o.agentFee))).toBe(true);
          });
          const gross = orders.reduce((s, o) => s.plus(o.gross), new D(0));
          const tokens = gross.times(new D(share.toFixed(6))).toDecimalPlaces(2, D.ROUND_DOWN);
          const out = splitCheckout(orders, tokens, rates.gatewayFeeRate);
          const sumRemainder = out.reduce((s, o) => s.plus(o.remainder), new D(0));
          const sumTokens = out.reduce((s, o) => s.plus(o.tokens), new D(0));
          const sumFee = out.reduce((s, o) => s.plus(o.fee), new D(0));
          expect(sumTokens.plus(sumRemainder).eq(gross)).toBe(true);
          expect(sumTokens.eq(tokens)).toBe(true);
          expect(sumFee.eq(gatewayFee(sumRemainder, rates.gatewayFeeRate))).toBe(true);
          for (const o of out) {
            for (const v of [o.tokens, o.remainder, o.fee, o.due]) {
              expect(twoDp(v)).toBe(true);
              expect(v.gte(0)).toBe(true);
            }
            expect(o.due.eq(o.remainder.plus(o.fee))).toBe(true);
          }
        },
      ),
      { seed: 20261107, numRuns: 300 },
    );
  });

  it("line earning is never negative", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 0, max: 60 }),
        price,
        (qty, returned, missing, factoryPrice) => {
          const e = lineEarning(qty, returned, missing, factoryPrice);
          expect(e.gte(0)).toBe(true);
          expect(e.lte(factoryPrice.times(qty))).toBe(true);
        },
      ),
      { seed: 20261107, numRuns: 200 },
    );
  });
});
