import { describe, expect, it } from "vitest";
import type { Landmark } from "../types";
import { outlineFor } from "./outline";

function mask(width: number, height: number, on: (x: number, y: number) => boolean) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) data[y * width + x] = on(x, y) ? 1 : 0;
  return { width, height, data };
}

const lm = (x: number, y: number): Landmark => ({ x, y, visibility: 0.9 });

describe("outlineFor", () => {
  it("keeps a small outline as pixel runs, with separate runs for arm and body", () => {
    const m = mask(10, 4, (x, y) => y === 1 && (x <= 1 || (x >= 4 && x <= 7)));
    const out = outlineFor({ mask: m, landmarks: [lm(5, 1)] }, 512);
    expect(out).toMatchObject({ width: 10, height: 4 });
    expect(out.spans).toEqual([
      [1, 0, 1],
      [1, 4, 7],
    ]);
    expect(out.landmarks).toEqual([[5, 1, 0.9]]);
  });

  it("downsamples a tall outline and its joints by the same factor", () => {
    const m = mask(400, 1024, (x) => x >= 100 && x < 300);
    const out = outlineFor({ mask: m, landmarks: [lm(200, 512)] }, 512);
    expect(out).toMatchObject({ width: 200, height: 512 });
    expect(out.spans).toHaveLength(512);
    expect(out.spans[0]).toEqual([0, 50, 149]);
    expect(out.landmarks[0]).toEqual([100, 256, 0.9]);
  });
});
