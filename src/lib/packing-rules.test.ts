import { describe, expect, it } from "vitest";
import { checkBlockReason, handOverBlockReason, namesList, packingStage } from "./packing-rules";

/** Packed by "p", checked by `checkers`. */
const packed = (checkers: string[], handedOverAt: Date | null = null) => ({
  packedById: "p",
  checks: checkers.map((userId) => ({ userId })),
  handedOverAt,
});

describe("packing stages", () => {
  it("go to pack → to check → ready → handed over", () => {
    expect(packingStage(null)).toBe("to-pack");
    expect(packingStage(packed([]))).toBe("to-check");
    expect(packingStage(packed(["a"]))).toBe("to-check");
    expect(packingStage(packed(["a", "b"]))).toBe("ready");
    expect(packingStage(packed(["a", "b"], new Date()))).toBe("handed-over");
  });
});

describe("checking a packed order", () => {
  it("needs two different people, never the one who packed it", () => {
    expect(checkBlockReason(null, "a")).toMatch("Pack this order first");
    expect(checkBlockReason(packed([]), "p")).toMatch("You packed this order");
    expect(checkBlockReason(packed(["a"]), "p")).toMatch("You packed this order");
    expect(checkBlockReason(packed([]), "a")).toBeNull();
    expect(checkBlockReason(packed(["a"]), "a")).toMatch("Someone else must check it");
    expect(checkBlockReason(packed(["a"]), "b")).toBeNull();
    expect(checkBlockReason(packed(["a", "b"]), "c")).toMatch("checked twice");
    expect(checkBlockReason(packed(["a", "b"], new Date()), "c")).toMatch("already gone");
  });
});

describe("handing over to PickMe", () => {
  const booked = { status: "BOOKED" };
  it("only after two checks and once PickMe is booked", () => {
    expect(handOverBlockReason(null, booked)).toMatch("Pack this order first");
    expect(handOverBlockReason(packed([]), booked)).toMatch("2 more checks");
    expect(handOverBlockReason(packed(["a"]), booked)).toMatch(/1 more check$/);
    expect(handOverBlockReason(packed(["a", "b"]), null)).toMatch("isn't booked yet");
    expect(handOverBlockReason(packed(["a", "b"]), { status: "FAILED" })).toMatch("closed");
    expect(handOverBlockReason(packed(["a", "b"]), booked)).toBeNull();
    expect(handOverBlockReason(packed(["a", "b"]), { status: "PICKED_UP" })).toBeNull();
    expect(handOverBlockReason(packed(["a", "b"], new Date()), booked)).toMatch("already gone");
  });
});

it("names are joined for display", () => {
  expect(namesList([])).toBe("");
  expect(namesList(["Amal"])).toBe("Amal");
  expect(namesList(["Amal", "Nimal"])).toBe("Amal and Nimal");
  expect(namesList(["Amal", "Nimal", "Kamal"])).toBe("Amal, Nimal and Kamal");
});
