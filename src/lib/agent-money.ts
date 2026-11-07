import { D, roundMoney } from "./decimal";

type Money = D;

export type Rates = { courierPerItem: Money; agentFeePerItem: Money; gatewayFeeRate: Money };
export type LineIn = { qty: number; unitPrice: Money };
export type OrderTotals = { items: Money; courier: Money; agentFee: Money; gross: Money };

const ZERO = new D(0);

export function orderTotals(lines: LineIn[], r: Rates): OrderTotals {
  const qty = lines.reduce((sum, l) => sum + l.qty, 0);
  const items = lines.reduce((sum, l) => sum.plus(l.unitPrice.times(l.qty)), ZERO);
  const courier = r.courierPerItem.times(qty);
  const agentFee = r.agentFeePerItem.times(qty);
  return { items, courier, agentFee, gross: items.plus(courier).plus(agentFee) };
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

/** Factory fault refunds the full price; buyer fault keeps the courier cost. */
export function returnRefund(
  qty: number,
  unitPrice: Money,
  courierEach: Money,
  fault: "FACTORY" | "BUYER",
): Money {
  const each = fault === "FACTORY" ? unitPrice : unitPrice.minus(courierEach);
  return roundMoney(each.times(qty));
}

export function missingRefund(qty: number, unitPrice: Money, courierEach: Money, agentFeeEach: Money): Money {
  return roundMoney(unitPrice.plus(courierEach).plus(agentFeeEach).times(qty));
}

/** Only GroupBasket's loss: commission, refunded courier and agent fee. */
export function missingDeduction(
  qty: number,
  unitPrice: Money,
  factoryPrice: Money,
  courierEach: Money,
  agentFeeEach: Money,
): Money {
  return roundMoney(unitPrice.minus(factoryPrice).plus(courierEach).plus(agentFeeEach).times(qty));
}

/** The factory keeps earning for missing units; only returned units are taken off. */
export function lineEarning(qty: number, returnedQty: number, _missingQty: number, factoryPrice: Money): Money {
  return roundMoney(factoryPrice.times(Math.max(qty - returnedQty, 0)));
}
