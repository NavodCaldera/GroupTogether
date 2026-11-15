import { describe, expect, it } from "vitest";
import { rampRgb, shownTension } from "./colour";
import { regionWeights } from "./blend";

describe("regionWeights", () => {
  // Chest (0) is a column of points at y 0..1, waist (1) right below at y 1.1..2.1; one neutral point.
  const pts: number[] = [];
  const ids: number[] = [];
  for (let k = 0; k <= 10; k++) {
    pts.push(0, k / 10, 0);
    ids.push(0);
    pts.push(0, 1.1 + k / 10, 0);
    ids.push(1);
  }
  pts.push(5, 5, 5);
  ids.push(255);
  const { a, b } = regionWeights(pts, ids);
  const weights = (i: number) => [a[i * 4], a[i * 4 + 1]];

  it("weights sum to 1 on heat vertices and 0 on neutral ones", () => {
    for (let i = 0; i < ids.length - 1; i++) {
      const s = [0, 1, 2, 3].reduce((t, k) => t + a[i * 4 + k] + b[i * 4 + k], 0) - b[i * 4 + 3];
      expect(s).toBeCloseTo(1);
      expect(b[i * 4 + 3]).toBe(1);
    }
    const last = ids.length - 1;
    expect([...a.slice(last * 4), ...b.slice(last * 4)].every((v) => v === 0)).toBe(true);
  });

  it("an area's own vertices dominate far from a border and blend near it", () => {
    const deep = weights(0); // chest at y 0, far from the waist
    const edge = weights(20); // chest at y 1, nearest the waist
    expect(deep[0]).toBeGreaterThan(0.95);
    expect(edge[1]).toBeGreaterThan(0.05);
    expect(edge[1]).toBeGreaterThan(deep[1]);
    expect(edge[0]).toBeGreaterThan(edge[1]);
  });
});

describe("colour ramp", () => {
  it("runs green → yellow → orange → deep red", () => {
    const [r0, g0] = rampRgb(0);
    const [r1, g1, b1] = rampRgb(1);
    expect(g0).toBeGreaterThan(r0);
    expect(r1).toBeGreaterThan(g1 * 5);
    expect(rampRgb(0.5)).toEqual([0.96, 0.8, 0.18]);
    expect(rampRgb(0.6)[1]).toBeLessThan(0.8);
    expect(b1).toBeLessThan(0.1);
  });
  it("shows an unsure area at its interval midpoint", () =>
    expect(
      shownTension({ tension: 0.5, tensionLow: 0.3, tensionHigh: 0.9, uncertain: true }),
    ).toBeCloseTo(0.6));
});
