import { describe, expect, it } from "vitest";
import { sizeOrder } from "./data";

describe("sizeOrder", () => {
  it("puts letter sizes small to large when the kind lists none", () => {
    expect(sizeOrder(null, ["L", "M", "S", "XL"])).toEqual(["S", "M", "L", "XL"]);
    expect(sizeOrder(undefined, ["XXL", "XS", "M"])).toEqual(["XS", "M", "XXL"]);
  });

  it("puts numeric sizes in number order after letters", () => {
    expect(sizeOrder(null, ["32", "28", "M", "30"])).toEqual(["M", "28", "30", "32"]);
  });
});
