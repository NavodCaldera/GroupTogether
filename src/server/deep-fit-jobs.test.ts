import { describe, expect, it } from "vitest";
import {
  DEEP_FIT_STALE_MS,
  isSizeName,
  MAX_SIM_SIZES,
  SIM_SIZE_TIMEOUT_MS,
  simTimeoutMs,
} from "./deep-fit-jobs";

describe("Deep Fit size names", () => {
  it("accepts what tools/cloth-sim/run.py accepts, spaces included", () => {
    for (const s of ["M", "XL", "2XL", "Free Size", "32 R", "10.5", "S+", "a".repeat(32)])
      expect(isSizeName(s), s).toBe(true);
    for (const s of ["", " M", ".M", "../x", "M/L", "M\\L", "a".repeat(33), "M\n"])
      expect(isSizeName(s), JSON.stringify(s)).toBe(false);
  });
});

describe("Deep Fit timeouts", () => {
  it("gives each size its own time plus a start-up margin", () => {
    expect(simTimeoutMs(4) - simTimeoutMs(3)).toBe(SIM_SIZE_TIMEOUT_MS);
    expect(simTimeoutMs(1)).toBeGreaterThan(SIM_SIZE_TIMEOUT_MS);
    expect(simTimeoutMs(MAX_SIM_SIZES + 5)).toBe(simTimeoutMs(MAX_SIM_SIZES));
  });

  it("a running job is taken again only after the longest worker timeout", () => {
    expect(DEEP_FIT_STALE_MS).toBeGreaterThan(simTimeoutMs(MAX_SIM_SIZES));
    expect(DEEP_FIT_STALE_MS).toBeGreaterThan(30 * 60 * 1000);
  });
});
