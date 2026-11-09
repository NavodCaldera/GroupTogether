import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoReturnPath, signNotice, verifyNotice } from "./demo";

const fields = {
  merchant_id: "1200000",
  order_id: "att_1",
  payment_id: "demo_ab12",
  payhere_amount: "1096.17",
  payhere_currency: "LKR",
  status_code: "2",
};

function body(f: Record<string, string>, sig: string) {
  return new URLSearchParams({ ...f, md5sig: sig }).toString();
}

describe("demo gateway notices", () => {
  beforeEach(() => {
    vi.stubEnv("DEMO_MERCHANT_ID", "1200000");
    vi.stubEnv("DEMO_MERCHANT_SECRET", "s3cret");
  });

  it("round-trips a signed notice", () => {
    const sig = signNotice(fields, "s3cret");
    expect(verifyNotice(body(fields, sig), {})).toEqual({
      eventId: "demo_ab12:2",
      attemptId: "att_1",
      gatewayRef: "demo_ab12",
      amount: "1096.17",
      currency: "LKR",
      status: "SUCCEEDED",
    });
  });

  it("rejects a tampered amount", () => {
    const sig = signNotice(fields, "s3cret");
    expect(verifyNotice(body({ ...fields, payhere_amount: "1.00" }, sig), {})).toBeNull();
  });

  it("rejects a wrong merchant id", () => {
    const other = { ...fields, merchant_id: "999" };
    expect(verifyNotice(body(other, signNotice(other, "s3cret")), {})).toBeNull();
  });

  it("accepts a lowercase signature", () => {
    const sig = signNotice(fields, "s3cret").toLowerCase();
    expect(verifyNotice(body(fields, sig), {})).not.toBeNull();
  });
});

describe("demo payment return", () => {
  it("returns a deposit to the deposit page and orders to checkout", () => {
    expect(demoReturnPath({ id: "att_1", purpose: "DEPOSIT" })).toBe("/agent/deposit/att_1");
    expect(demoReturnPath({ id: "att_2", purpose: "ORDERS" })).toBe("/checkout/return/att_2");
  });
});
