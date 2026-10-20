import { describe, expect, it } from "vitest";
import { handOverBlockReason, orderStage, packBlockReason, packingStage } from "./packing-rules";

/** Gathered by "g", packed by `packer` (or not yet). */
const gathered = (packer: string | null = null, handedOverAt: Date | null = null) => ({
  gatheredById: "g",
  packedById: packer,
  handedOverAt,
});

describe("packing stages", () => {
  it("go to gather → to pack → ready → handed over", () => {
    expect(packingStage(null)).toBe("to-gather");
    expect(packingStage(gathered())).toBe("to-pack");
    expect(packingStage(gathered("p"))).toBe("ready");
    expect(packingStage(gathered("p", new Date()))).toBe("handed-over");
  });
});

describe("rechecking and packing", () => {
  it("is done by someone other than the person who gathered it", () => {
    expect(packBlockReason(null, "p")).toMatch("Check and gather it first");
    expect(packBlockReason(gathered(), "g")).toMatch("someone else packs it");
    expect(packBlockReason(gathered(), "p")).toBeNull();
    expect(packBlockReason(gathered("p"), "q")).toMatch("Already packed");
    expect(packBlockReason(gathered("p", new Date()), "q")).toMatch("already gone");
  });
});

describe("handing over to PickMe", () => {
  const booked = { status: "BOOKED" };
  it("only once packed and once PickMe is booked", () => {
    expect(handOverBlockReason(null, booked)).toMatch("Check and gather it first");
    expect(handOverBlockReason(gathered(), booked)).toMatch("Not packed yet");
    expect(handOverBlockReason(gathered("p"), null)).toMatch("isn't booked yet");
    expect(handOverBlockReason(gathered("p"), { status: "FAILED" })).toMatch("closed");
    expect(handOverBlockReason(gathered("p"), booked)).toBeNull();
    expect(handOverBlockReason(gathered("p"), { status: "PICKED_UP" })).toBeNull();
    expect(handOverBlockReason(gathered("p", new Date()), booked)).toMatch("already gone");
  });
});

describe("order stage on the admin Orders tab", () => {
  it("follows PickMe first, then the packers' handover", () => {
    expect(orderStage(null, null)).toBe("to-book");
    expect(orderStage(null, { handedOverAt: null })).toBe("to-book");
    expect(orderStage({ status: "BOOKED" }, null)).toBe("in-store");
    expect(orderStage({ status: "BOOKED" }, { handedOverAt: new Date() })).toBe("on-the-way");
    expect(orderStage({ status: "PICKED_UP" }, null)).toBe("on-the-way");
    expect(orderStage({ status: "FAILED" }, { handedOverAt: new Date() })).toBe("failed");
    expect(orderStage({ status: "CANCELLED" }, null)).toBe("failed");
    expect(orderStage({ status: "DELIVERED" }, null)).toBe("delivered");
  });
});
