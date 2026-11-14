import { describe, expect, it } from "vitest";
import { parseAgentSettings } from "./agent-settings";

const form = {
  agentFeePercent: "5",
  gatewayFeeRate: "0.033",
  basketLockAmount: "50000",
  agentDeposit: "200000",
  maxWaitDays: "60",
  paymentHoldMinutes: "15",
  collectHours: "48",
  returnHandoverDays: "7",
  buyerHandoverDays: "2",
  agentRadiusM: "1000",
  agentGapM: "2000",
};

describe("agent settings", () => {
  it("stores the agent fee percent as a four-decimal rate", () => {
    const data = parseAgentSettings(form);
    expect(data.agentFeeRate).toBe("0.0500");
    expect(data.buyerHandoverDays).toBe(2);
    expect("agentFeePercent" in data).toBe(false);
    expect(parseAgentSettings({ ...form, agentFeePercent: "2.5" }).agentFeeRate).toBe("0.0250");
  });

  it("refuses a fee above 50%, a negative fee and a bad handover", () => {
    expect(() => parseAgentSettings({ ...form, agentFeePercent: "60" })).toThrow();
    expect(() => parseAgentSettings({ ...form, agentFeePercent: "-1" })).toThrow();
    expect(() => parseAgentSettings({ ...form, agentFeePercent: "5.123" })).toThrow();
    expect(() => parseAgentSettings({ ...form, buyerHandoverDays: "0" })).toThrow();
  });
});
