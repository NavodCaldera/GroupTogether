import { describe, expect, it } from "vitest";
import { STAGE_LABEL, STAGES, TRACK, orderStage } from "./order-stage";

const paidAt = new Date("2026-11-19T07:00:00Z");
const at = (status: "PENDING" | "PAID" | "RECEIVED" | "CANCELLED", basket: string | null) =>
  orderStage({ status, paidAt, basket: basket ? { status: basket } : null });

describe("orderStage", () => {
  it("never paid → null", () => {
    expect(orderStage({ status: "PENDING", paidAt: null, basket: null })).toBeNull();
    expect(
      orderStage({ status: "CANCELLED", paidAt: null, basket: { status: "OPEN" } }),
    ).toBeNull();
  });
  it("OPEN → filling", () => expect(at("PAID", "OPEN")).toBe("filling"));
  it("LOCKED → packing", () => expect(at("PAID", "LOCKED")).toBe("packing"));
  it("PACKED → packing", () => expect(at("PAID", "PACKED")).toBe("packing"));
  it("AWAITING_FEE (legacy) → packing", () => expect(at("PAID", "AWAITING_FEE")).toBe("packing"));
  it("WITH_COURIER → on_the_way", () => expect(at("PAID", "WITH_COURIER")).toBe("on_the_way"));
  it("AT_AGENT → delivered", () => expect(at("RECEIVED", "AT_AGENT")).toBe("delivered"));
  it("collected agent order → delivered", () =>
    expect(at("RECEIVED", "AT_AGENT")).toBe("delivered"));
  it("DELIVERED → delivered", () => expect(at("RECEIVED", "DELIVERED")).toBe("delivered"));
  it("refunded own basket → refunded", () => {
    expect(at("CANCELLED", "CANCELLED")).toBe("refunded");
    expect(at("CANCELLED", "OPEN")).toBe("refunded");
  });
  it("paid with no basket yet → filling", () => expect(at("PAID", null)).toBe("filling"));
  it("labels and track", () => {
    expect(STAGES).toEqual(["filling", "packing", "on_the_way", "delivered", "refunded"]);
    expect(TRACK.map((s) => STAGE_LABEL[s])).toEqual([
      "Filling",
      "Packing",
      "On the way",
      "Delivered",
    ]);
    expect(STAGE_LABEL.refunded).toBe("Refunded");
  });
});
