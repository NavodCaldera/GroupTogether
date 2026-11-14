import { describe, expect, it } from "vitest";
import { D } from "./decimal";
import {
  agentFeeEach,
  cancelRefund,
  factoryFaultRefund,
  gatewayFee,
  lineEarning,
  missingDeduction,
  missingRefund,
  orderTotals,
  splitCheckout,
} from "./agent-money";

const rates = { agentFeeRate: new D("0.05"), gatewayFeeRate: new D("0.033") };
const rate = new D("0.033");
const totals = (price: string) => orderTotals([{ qty: 1, unitPrice: new D(price) }], rates);

describe("agent money rules", () => {
  it("totals an order", () => {
    const t = totals("1000");
    expect(t.items.toFixed(2)).toBe("1000.00");
    expect("courier" in t).toBe(false);
    expect(t.agentFee.toFixed(2)).toBe("50.00");
    expect(t.gross.toFixed(2)).toBe("1050.00");
  });

  it("rounds the 5% agent fee per item", () => {
    expect(agentFeeEach(new D("999.99"), new D("0.05")).toFixed(2)).toBe("50.00");
    expect(agentFeeEach(new D("470"), new D("0.05")).toFixed(2)).toBe("23.50");
    const t = orderTotals([{ qty: 3, unitPrice: new D("999.99") }], rates);
    expect(t.agentFee.toFixed(2)).toBe("150.00");
  });

  it("computes the gateway fee", () => {
    expect(gatewayFee(new D("1050"), rate).toFixed(2)).toBe("35.83");
    expect(gatewayFee(new D("1060"), rate).toFixed(2)).toBe("36.17");
    expect(gatewayFee(new D("0"), rate).toFixed(2)).toBe("0.00");
    expect(gatewayFee(new D("760"), rate).toFixed(2)).toBe("25.94");
  });

  it("splits the fee and gives the last order the rounding cent", () => {
    const out = splitCheckout([totals("1000"), totals("470")], new D("0"), rate);
    expect(out[0].fee.add(out[1].fee).toFixed(2)).toBe("52.67");
    expect(out[0].fee.toFixed(2)).toBe("35.83");
    expect(out[1].fee.toFixed(2)).toBe("16.84");
    expect(out[1].due.toFixed(2)).toBe("510.34");
  });

  it("fills tokens in order", () => {
    const out = splitCheckout([totals("1000"), totals("470")], new D("1200"), rate);
    expect(out[0].tokens.toFixed(2)).toBe("1050.00");
    expect(out[0].remainder.toFixed(2)).toBe("0.00");
    expect(out[0].fee.toFixed(2)).toBe("0.00");
    expect(out[1].tokens.toFixed(2)).toBe("150.00");
    expect(out[1].remainder.toFixed(2)).toBe("343.50");
  });

  it("refunds", () => {
    // A factory fault returns everything but the PayHere fee; old lines also return the courier.
    expect(factoryFaultRefund(1, new D("1000"), new D("0"), new D("50")).toFixed(2)).toBe("1050.00");
    expect(factoryFaultRefund(2, new D("1000"), new D("0"), new D("50")).toFixed(2)).toBe("2100.00");
    expect(factoryFaultRefund(1, new D("1000"), new D("40"), new D("20")).toFixed(2)).toBe("1060.00");
    expect(missingRefund(1, new D("1100"), new D("0"), new D("55")).toFixed(2)).toBe("1155.00");
    expect(missingRefund(1, new D("1100"), new D("40"), new D("20")).toFixed(2)).toBe("1160.00");
    expect(
      cancelRefund({
        tokensApplied: new D("300"),
        remainder: new D("760"),
        fee: new D("25.94"),
      }).toFixed(2),
    ).toBe("1085.94");
  });

  it("deducts only GroupBasket's loss and pays the factory per kept line", () => {
    expect(
      missingDeduction(1, new D("1100"), new D("1000"), new D("40"), new D("20")).toFixed(2),
    ).toBe("160.00");
    expect(
      missingDeduction(1, new D("1100"), new D("1000"), new D("0"), new D("55")).toFixed(2),
    ).toBe("155.00");
    expect(lineEarning(3, 1, 0, new D("1000")).toFixed(2)).toBe("2000.00");
    expect(lineEarning(3, 1, 1, new D("1000")).toFixed(2)).toBe("1000.00");
  });
});
