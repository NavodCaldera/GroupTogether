import { describe, expect, it } from "vitest";
import { NEUTRAL } from "./blend";
import {
  drapePositions,
  garmentFrom,
  garmentSkin,
  isShort,
  MAX_GAP_CM,
  MIN_GAP_CM,
  PART,
  partGaps,
} from "./drape";
import { REGION_ID } from "./regions";

describe("partGaps", () => {
  it("spreads a circumference's room around the body, within limits", () => {
    const g = partGaps([
      { region: "chest", ease: 2 * Math.PI * 2 },
      { region: "waist", ease: -4 },
      { region: "hip", ease: 200 },
      { region: "torso", ease: 10 },
    ]);
    expect(g[PART.chest]).toBeCloseTo(2);
    expect(g[PART.waist]).toBe(MIN_GAP_CM);
    expect(g[PART.hip]).toBe(MAX_GAP_CM);
    expect(g[PART.shoulder]).toBe(0.8);
  });
});

describe("garmentFrom and drapePositions", () => {
  // A strip of 4 vertices along x: chest, chest, waist, head; two triangles plus one on the head.
  const parts = [PART.chest, PART.chest, PART.waist, PART.head, PART.waist];
  const indices = [0, 1, 2, 1, 2, 4, 2, 3, 4];
  const positions = [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0];
  const normals = Array.from({ length: 5 }, () => [0, 0, 1]).flat();

  it("keeps only triangles the garment type covers", () => {
    const g = garmentFrom(parts, indices, "top");
    expect([...g.source]).toEqual([0, 1, 2, 4]);
    expect(g.indices).toHaveLength(6);
    expect([...g.regionIds]).toEqual([
      REGION_ID.chest,
      REGION_ID.chest,
      REGION_ID.waist,
      REGION_ID.waist,
    ]);
    expect(garmentFrom(parts, indices, "bottom").source).toHaveLength(0);
    expect(NEUTRAL).toBe(255);
  });

  it("moves vertices out along the normal by the part's gap, smoothed across parts", () => {
    const g = garmentFrom(parts, indices, "top");
    const gaps = Array(11).fill(1);
    const flat = drapePositions(g, positions, normals, gaps);
    expect(flat[2]).toBeCloseTo(0.01); // 1 cm, metres
    gaps[PART.waist] = 3;
    const step = drapePositions(g, positions, normals, gaps, undefined, 0);
    const smooth = drapePositions(g, positions, normals, gaps);
    expect(step[2 * 3 + 2]).toBeCloseTo(0.03);
    expect(smooth[2 + 0]).toBeGreaterThan(0.01); // the chest picks up some of the waist's room
    expect(smooth[2 * 3 + 2]).toBeLessThan(0.03);
  });
});

describe("garmentSkin", () => {
  it("gives each garment vertex the bones of the body vertex under it", () => {
    const parts = [PART.head, PART.chest, PART.chest, PART.waist];
    const g = garmentFrom(parts, [1, 2, 3], "top");
    const joints = [9, 9, 9, 9, 1, 2, 0, 0, 3, 4, 0, 0, 5, 6, 7, 8];
    const weights = [1, 0, 0, 0, 0.5, 0.5, 0, 0, 0.25, 0.75, 0, 0, 0.1, 0.2, 0.3, 0.4];
    const skin = garmentSkin(g, joints, weights);
    expect([...skin.skinIndex]).toEqual([1, 2, 0, 0, 3, 4, 0, 0, 5, 6, 7, 8]);
    expect(skin.skinWeight[5]).toBeCloseTo(0.75);
    expect(skin.skinWeight).toHaveLength(4 * g.source.length);
  });
});

describe("isShort", () => {
  it("stops shorts and skirts above the knee", () => {
    expect(isShort("men-shorts")).toBe(true);
    expect(isShort("men-trousers")).toBe(false);
    const parts = [PART.thigh, PART.thigh, PART.lowerLeg];
    expect(garmentFrom(parts, [0, 1, 2], "bottom").source).toHaveLength(3);
    expect(garmentFrom(parts, [0, 1, 2], "bottom", true).source).toHaveLength(0);
  });
});
