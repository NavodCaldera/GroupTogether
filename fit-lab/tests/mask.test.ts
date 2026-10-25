import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import { outlineSpread } from "../src/measure/silhouette";
import { cleanMask } from "../src/vision/opencv";

type CV = Parameters<typeof cleanMask>[0];

const W = 200;
const H = 200;

/** Probability image; `fill` sets a rectangle to p. */
function image() {
  const probs = new Float32Array(W * H);
  const fill = (x0: number, y0: number, x1: number, y1: number, p: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) probs[y * W + x] = p;
  };
  return { probs, fill };
}

const at = (m: Uint8Array, x: number, y: number) => m[y * W + x];
const rowWidth = (m: Uint8Array, y: number) => {
  let n = 0;
  for (let x = 0; x < W; x++) n += m[y * W + x];
  return n;
};

describe("outline spread", () => {
  it("is zero for sharp edges and grows for soft ones", () => {
    const sharp = image();
    sharp.fill(50, 0, 149, H - 1, 0.95);
    const rows = [50, 100, 150].map((y) => ({ y, x: 100 }));
    expect(outlineSpread(sharp.probs, W, rows, 0.3, 0.7)).toBe(0);

    const soft = image();
    soft.fill(50, 0, 149, H - 1, 0.95);
    // A 10 px ramp on each side, 0.05 -> 0.95 (values clear of the thresholds).
    for (let k = 0; k < 10; k++) {
      soft.fill(40 + k, 0, 40 + k, H - 1, (k + 0.5) / 10);
      soft.fill(159 - k, 0, 159 - k, H - 1, (k + 0.5) / 10);
    }
    const s = outlineSpread(soft.probs, W, rows, 0.3, 0.7)!;
    // Ramp px kept a side: 7 above 0.3, 5 above 0.5, 3 above 0.7 -> (114 - 106) / 110.
    expect(s).toBeCloseTo(8 / 110, 6);
    expect(outlineSpread(soft.probs, W, [{ y: 10, x: 5 }], 0.3, 0.7)).toBeNull();
  });
});

describe("mask cleanup", () => {
  let cv: CV;
  beforeAll(async () => {
    // In Node the package is a CommonJS promise; ESM import() would mistake it for a thenable module.
    cv = (await createRequire(import.meta.url)("@techstark/opencv-js")) as CV;
  }, 60_000);

  it("keeps the torso's region, removes specks, refills only small holes, keeps the boundary", () => {
    const { probs, fill } = image();
    fill(60, 20, 139, 190, 0.9); // the person
    fill(70, 60, 129, 120, 0); // a real gap, e.g. between an arm and the body
    fill(100, 150, 101, 151, 0); // a 2x2 hole: segmentation noise
    fill(5, 5, 6, 6, 0.9); // a speck in the background
    fill(150, 0, 199, 199, 0.9); // a larger separate region (a second person)
    const m = cleanMask(cv, probs, W, H, {
      threshold: 0.5,
      kernel: 3,
      minGap: 0.0005,
      seed: { x: 100, y: 170 },
    });
    expect(at(m, 100, 170)).toBe(1);
    expect(at(m, 175, 100)).toBe(0); // other region dropped although larger
    expect(at(m, 5, 5)).toBe(0); // speck removed
    expect(at(m, 100, 150)).toBe(1); // small hole refilled
    expect(at(m, 100, 90)).toBe(0); // real gap kept
    expect(rowWidth(m, 170)).toBe(80); // boundary unchanged: 60..139
    expect(rowWidth(m, 90)).toBe(20); // the two 10 px sides of the gap
  });

  it("falls back to the largest region without a seed, and moves with the threshold", () => {
    const { probs, fill } = image();
    fill(60, 20, 139, 190, 0.6);
    fill(50, 20, 59, 190, 0.4); // a fainter edge band
    const opts = { kernel: 3, minGap: 0.0005, seed: null };
    const low = cleanMask(cv, probs, W, H, { ...opts, threshold: 0.3 });
    const high = cleanMask(cv, probs, W, H, { ...opts, threshold: 0.5 });
    expect(rowWidth(low, 100)).toBe(90);
    expect(rowWidth(high, 100)).toBe(80);
  });
});
