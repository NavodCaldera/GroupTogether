import { describe, it, expect } from "vitest";
import {
  reportRequired,
  photoRequired,
  factoryScore,
  productFlagged,
  factoryFlagged,
} from "./quality-rules";
describe("quality rules", () => {
  it("requires reports/photos and counts old factory ratings once", () => {
    expect(reportRequired(2)).toBe(true);
    expect(reportRequired(3)).toBe(false);
    expect(photoRequired("SIZE")).toBe(false);
    expect(photoRequired("STITCHING")).toBe(true);
    expect(factoryScore([5, 1], [3])).toEqual({ average: 3, count: 3 });
  });
});

it("computes flags at exact rating and rolling-report thresholds", () => {
  const now = new Date("2026-11-05T12:00:00Z"),
    day = 86400000;
  expect(productFlagged([2, ...Array(9).fill(3)], [], now)).toBe(true);
  expect(productFlagged(Array(9).fill(1), [], now)).toBe(false);
  expect(productFlagged(Array(10).fill(3), [], now)).toBe(false);
  expect(productFlagged([], [now, new Date(+now - 15 * day), new Date(+now - 30 * day)], now)).toBe(
    true,
  );
  expect(productFlagged([], [now, new Date(+now - 15 * day), new Date(+now - 31 * day)], now)).toBe(
    false,
  );
  expect(factoryFlagged({ average: 2.9, count: 20 }, 0)).toBe(true);
  expect(factoryFlagged({ average: 2.9, count: 19 }, 0)).toBe(false);
  expect(factoryFlagged({ average: 5, count: 1 }, 3)).toBe(true);
});
