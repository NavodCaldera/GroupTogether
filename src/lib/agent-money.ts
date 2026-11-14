import { D, roundMoney } from "./decimal";

type Money = D;

/** agentFeeRate is a share of the item price (0.05); the agent pays couriers from the fee. */
export type Rates = { agentFeeRate: Money; gatewayFeeRate: Money };
type LineIn = { qty: number; unitPrice: Money };
export type OrderTotals = { items: Money; agentFee: Money; gross: Money };

const ZERO = new D(0);

/** The agent fee for one piece, rounded to the cent. */
export function agentFeeEach(unitPrice: Money, rate: Money): Money {
  return roundMoney(unitPrice.times(rate));
}

export function orderTotals(lines: LineIn[], r: Rates): OrderTotals {
  const items = lines.reduce((sum, l) => sum.plus(l.unitPrice.times(l.qty)), ZERO);
  const agentFee = lines.reduce(
    (sum, l) => sum.plus(agentFeeEach(l.unitPrice, r.agentFeeRate).times(l.qty)),
    ZERO,
  );
  return { items, agentFee, gross: items.plus(agentFee) };
}

/** round2(remainder / (1 - rate) - remainder); 0 when nothing is charged. */
export function gatewayFee(remainder: Money, rate: Money): Money {
  if (remainder.lte(0)) return roundMoney(0);
  return roundMoney(remainder.div(new D(1).minus(rate)).minus(remainder));
}

/** Tokens fill orders in the given order; fee split by remainder share, last order takes the rounding cent. */
export function splitCheckout(
  orders: OrderTotals[],
  tokens: Money,
  rate: Money,
): { tokens: Money; remainder: Money; fee: Money; due: Money }[] {
  let left = D.max(tokens, 0);
  const parts = orders.map((o) => {
    const applied = D.min(left, o.gross);
    left = left.minus(applied);
    return { tokens: roundMoney(applied), remainder: roundMoney(o.gross.minus(applied)) };
  });
  const totalRemainder = parts.reduce((s, p) => s.plus(p.remainder), ZERO);
  const totalFee = gatewayFee(totalRemainder, rate);
  const lastPaying = parts.reduce((idx, p, i) => (p.remainder.gt(0) ? i : idx), -1);
  let assigned = ZERO;
  return parts.map((p, i) => {
    let fee = ZERO;
    if (p.remainder.gt(0)) {
      fee =
        i === lastPaying
          ? totalFee.minus(assigned)
          : roundMoney(totalFee.times(p.remainder).div(totalRemainder));
      assigned = assigned.plus(fee);
    }
    fee = roundMoney(fee);
    return { ...p, fee, due: roundMoney(p.remainder.plus(fee)) };
  });
}

export function cancelRefund(o: { tokensApplied: Money; remainder: Money; fee: Money }): Money {
  return roundMoney(o.tokensApplied.plus(o.remainder).plus(o.fee));
}

/** A factory fault returns everything but the PayHere fee. Lines from before the 5% fee also
 * return their courier charge; newer lines store it as 0. A buyer fault returns nothing. */
export function factoryFaultRefund(
  qty: number,
  unitPrice: Money,
  courierEach: Money,
  agentFeeEach: Money,
): Money {
  return roundMoney(unitPrice.plus(courierEach).plus(agentFeeEach).times(qty));
}

export function missingRefund(
  qty: number,
  unitPrice: Money,
  courierEach: Money,
  agentFeeEach: Money,
): Money {
  return roundMoney(unitPrice.plus(courierEach).plus(agentFeeEach).times(qty));
}

/** Only GroupBasket's loss: commission and the refunded agent fee (and courier, on old lines). */
export function missingDeduction(
  qty: number,
  unitPrice: Money,
  factoryPrice: Money,
  courierEach: Money,
  agentFeeEach: Money,
): Money {
  return roundMoney(unitPrice.minus(factoryPrice).plus(courierEach).plus(agentFeeEach).times(qty));
}

/** The factory is never paid for returned or missing units. */
export function lineEarning(
  qty: number,
  returnedQty: number,
  missingQty: number,
  factoryPrice: Money,
): Money {
  return roundMoney(factoryPrice.times(Math.max(qty - returnedQty - missingQty, 0)));
}
