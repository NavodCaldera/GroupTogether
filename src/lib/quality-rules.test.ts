import { describe, it, expect } from "vitest";
import { reportRequired, photoRequired, factoryScore } from "./quality-rules";
describe("quality rules", () => {
  it("requires reports/photos and counts old factory ratings once", () => {
    expect(reportRequired(2)).toBe(true);
    expect(reportRequired(3)).toBe(false);
    expect(photoRequired("SIZE")).toBe(false);
    expect(photoRequired("STITCHING")).toBe(true);
    expect(factoryScore([5, 1], [3])).toEqual({ average: 3, count: 3 });
  });
});
