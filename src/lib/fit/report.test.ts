import { describe, expect, it } from "vitest";
import { FIT } from "./config";
import {
  band,
  fitReport,
  nearestArchetype,
  regionTension,
  type Body,
  type SizeChart,
} from "./report";

const exact = (v: number) => ({ value: v, low: v, high: v });
const chart: SizeChart = {
  S: { chest: 96, waist: 88 },
  M: { chest: 104, waist: 96 },
  L: { chest: 112, waist: 104 },
};
const archetype = { chest: 96, waist: 84 };
const base = {
  S: { chest: 0.65, waist: 0.4 },
  M: { chest: 0.35, waist: 0.25 },
  L: { chest: 0.22, waist: 0.15 },
};

describe("regionTension", () => {
  it("exact fit: a buyer measuring like the archetype sees the simulated tension", () => {
    expect(regionTension("chest", 104, 96, 0, { base: 0.35, archetypeCm: 96 })).toBeCloseTo(0.35);
    const r = fitReport({
      body: { chest: exact(96), waist: exact(84) },
      sizes: ["S", "M", "L"],
      chart,
      stretchPct: 0,
      archetype,
      base,
    });
    const m = r.sizeOptions.find((o) => o.size === "M")!;
    expect(m.regions.map((x) => x.tension)).toEqual([0.35, 0.25]);
    expect(r.simulated).toBe(true);
  });

  it("oversize: more room lowers tension but never below the drape floor", () => {
    const roomy = regionTension("chest", 140, 90, 0, null);
    expect(roomy).toBe(FIT.drapeFloor);
    expect(band(roomy)).toBe("loose");
    expect(regionTension("chest", 104, 100, 0, null)).toBeLessThan(FIT.neutral);
  });

  it("a deficit on a stretch knit is milder than on rigid fabric", () => {
    const rigid = regionTension("chest", 96, 100, 0, null);
    const knit = regionTension("chest", 96, 100, 15, null);
    expect(rigid).toBeCloseTo(FIT.neutral + FIT.k * 4);
    expect(knit).toBeLessThan(rigid);
    expect(knit).toBeCloseTo(FIT.neutral + FIT.k * 4 * (1 - 0.375));
    expect(band(rigid)).toBe("tight");
  });

  it("stretch never helps a length", () => {
    expect(regionTension("torso", 60, 64, 40, null)).toBe(regionTension("torso", 60, 64, 0, null));
  });

  it("a larger buyer than the archetype sees more tension on the same size", () => {
    const sim = { base: 0.35, archetypeCm: 96 };
    expect(regionTension("chest", 104, 102, 0, sim)).toBeGreaterThan(0.35);
    expect(regionTension("chest", 104, 90, 0, sim)).toBeLessThan(0.35);
  });
});

describe("fitReport", () => {
  it("recommends the size with every area below tight and the most comfortable areas", () => {
    const body: Body = { chest: exact(96), waist: exact(84) };
    const r = fitReport({ body, sizes: ["S", "M", "L"], chart, stretchPct: 0, archetype, base });
    expect(r.recommendedSize).toBe("M");
    expect(r.confidence).toBe("high");
    expect(r.noGoodSize).toBe(false);
  });

  it("works from measurements alone when there is no simulation", () => {
    const r = fitReport({
      body: { chest: exact(100), waist: exact(90) },
      sizes: ["S", "M", "L"],
      chart,
      stretchPct: 5,
    });
    expect(r.simulated).toBe(false);
    const s = r.sizeOptions.find((o) => o.size === "S")!;
    expect(s.fits).toBe(false);
    expect(s.notes[0]).toBe(
      "Runs tight through the chest for your measurements — size M gives 8 cm more room",
    );
    // L leaves the waist loose; M keeps both comfortable.
    expect(r.recommendedSize).toBe("M");
  });

  it("flags an area whose interval crosses a band boundary and reports both ends", () => {
    // chest 96 ± 6 on M (104): tension spans comfortable to snug.
    const body: Body = { chest: { value: 96, low: 90, high: 102 }, waist: exact(84) };
    const r = fitReport({ body, sizes: ["S", "M", "L"], chart, stretchPct: 0, archetype, base });
    const chest = r.sizeOptions.find((o) => o.size === "S")!.regions[0];
    expect(chest.uncertain).toBe(true);
    expect(chest.tensionLow).toBeLessThan(chest.tension);
    expect(chest.tensionHigh).toBeGreaterThan(chest.tension);
    expect(band(chest.tensionLow)).not.toBe(band(chest.tensionHigh));
  });

  it("straddling a size boundary on rigid fabric prefers the larger size", () => {
    // Exactly between S and M: S is fine at the point estimate, tight at the interval's top.
    const sizes = ["S", "M"];
    const c: SizeChart = { S: { chest: 100 }, M: { chest: 106 } };
    const body: Body = { chest: { value: 97, low: 93, high: 101 } };
    const rigid = fitReport({ body, sizes, chart: c, stretchPct: 0 });
    expect(rigid.sizeOptions[0].regions[0].uncertain).toBe(true);
    expect(rigid.recommendedSize).toBe("M");
    expect(rigid.confidence).toBe("medium");
    // A good stretch knit judges S at the point estimate and keeps it.
    const knit = fitReport({ body, sizes, chart: c, stretchPct: 30 });
    expect(knit.sizeOptions[0].fits).toBe(true);
  });

  it("recommends the least tight size, with low confidence, when nothing fits", () => {
    const r = fitReport({
      body: { chest: exact(130) },
      sizes: ["S", "M", "L"],
      chart,
      stretchPct: 0,
    });
    expect(r.noGoodSize).toBe(true);
    expect(r.recommendedSize).toBe("L");
    expect(r.confidence).toBe("low");
  });

  it("returns no recommendation when no area can be compared", () => {
    const r = fitReport({ body: { thigh: exact(55) }, sizes: ["S", "M"], chart, stretchPct: 0 });
    expect(r.recommendedSize).toBeNull();
    expect(r.sizeOptions.every((o) => o.regions.length === 0)).toBe(true);
  });

  it("skips sizes missing from the chart and keeps size order", () => {
    const r = fitReport({
      body: { chest: exact(96) },
      sizes: ["XS", "S", "M"],
      chart,
      stretchPct: 0,
    });
    expect(r.sizeOptions.map((o) => o.size)).toEqual(["S", "M"]);
  });
});

describe("nearestArchetype", () => {
  const list = [
    { id: "a", gender: "MEN", params: { chest: 92, waist: 80, hip: 94 } },
    { id: "b", gender: "MEN", params: { chest: 108, waist: 98, hip: 106 } },
    { id: "c", gender: "WOMEN", params: { chest: 90, waist: 74, hip: 98 } },
  ];
  it("matches on chest, waist and hip within the gender", () => {
    expect(
      nearestArchetype({ chest: exact(105), waist: exact(95), hip: exact(104) }, list, "MEN")?.id,
    ).toBe("b");
    expect(
      nearestArchetype({ chest: exact(91), waist: exact(76), hip: exact(97) }, list, "WOMEN")?.id,
    ).toBe("c");
    expect(nearestArchetype({ chest: exact(91), waist: exact(76), hip: exact(97) }, list)?.id).toBe(
      "c",
    );
  });
  it("returns null with nothing to compare", () =>
    expect(nearestArchetype({ thigh: exact(50) }, list)).toBeNull());
});
