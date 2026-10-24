import { describe, expect, it } from "vitest";
import { EASE } from "../src/fit/ease";
import { limitations } from "../src/fit/limitations";
import { fitSize, penaltyAt, recommend, verdict } from "../src/fit/predict";
import { GARMENTS } from "../src/garments/database";
import type { Body, BodyKey } from "../src/types";

const garment = (id: string) => GARMENTS.find((g) => g.id === id)!;
const typed = (values: Partial<Record<BodyKey, number>>, sd = 1): Body =>
  Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, { value: v, sd, source: "typed" }]),
  );

const man = { height: 178, chest: 94, waist: 86, shoulder: 44.5, sleeve: 60.5, torso: 52 };

describe("ease bands", () => {
  const b = EASE.top.chest!.regular;
  it("labels each band", () => {
    expect(verdict(2, b)).toBe("too_tight");
    expect(verdict(6, b)).toBe("snug");
    expect(verdict(12, b)).toBe("good");
    expect(verdict(20, b)).toBe("roomy");
    expect(verdict(30, b)).toBe("too_loose");
  });
  it("penalises tight more than loose and grows away from the good band", () => {
    expect(penaltyAt(12, b)).toBe(0);
    expect(penaltyAt(6, b)).toBeGreaterThan(penaltyAt(20, b));
    expect(penaltyAt(2, b)).toBeGreaterThan(penaltyAt(6, b));
    expect(penaltyAt(30, b)).toBeGreaterThan(penaltyAt(20, b));
  });
});

describe("size recommendation", () => {
  it("picks M for a medium body and L for a bigger chest", () => {
    expect(recommend(garment("linen-shirt"), typed(man)).best!.label).toBe("M");
    expect(recommend(garment("linen-shirt"), typed({ ...man, chest: 100 })).best!.label).toBe("L");
  });

  it("reports a snug chest", () => {
    const m = fitSize(garment("linen-shirt"), "M", typed({ ...man, chest: 99.5 }));
    expect(m.dims.find((d) => d.key === "chest")!.verdict).toBe("snug");
    expect(recommend(garment("linen-shirt"), typed({ ...man, chest: 99.5 })).best!.label).toBe("L");
  });

  it("counts fabric stretch on circumferences", () => {
    const chest = fitSize(garment("cotton-tee"), "M", typed(man)).dims.find(
      (d) => d.key === "chest",
    )!;
    expect(chest.ease).toBeCloseTo(102 - 94 + 94 * 0.05, 6);
    expect(chest.verdict).toBe("good");
  });

  it("is less confident with photo-sized uncertainty", () => {
    const sure = recommend(garment("linen-shirt"), typed(man, 1));
    const unsure = recommend(garment("linen-shirt"), typed(man, 4));
    expect(unsure.confidence).toBeLessThan(sure.confidence);
    expect(sure.level).toBe("high");
  });

  it("lists missing measurements and lowers confidence", () => {
    const { sleeve: _, ...noSleeve } = man;
    const full = recommend(garment("linen-shirt"), typed(man));
    const rec = recommend(garment("linen-shirt"), typed(noSleeve));
    expect(rec.missing).toEqual(["sleeve"]);
    expect(rec.confidence).toBeLessThan(full.confidence);
  });

  it("says when no size fits", () => {
    const rec = recommend(garment("linen-shirt"), typed({ ...man, chest: 140 }));
    expect(rec.best!.label).toBe("XXL");
    expect(rec.noGoodSize).toBe(true);
    expect(rec.tight).toContain("chest");
  });

  it("has no recommendation without any matching body measurement", () => {
    const rec = recommend(garment("stretch-chinos"), typed({ height: 178, chest: 98 }));
    expect(rec.best).toBeNull();
    expect(rec.missing).toEqual(["waist", "hip", "inseam"]);
  });

  it("recommends trousers from waist, hip and inseam", () => {
    const rec = recommend(garment("stretch-chinos"), typed({ waist: 82, hip: 98, inseam: 81 }));
    expect(rec.best!.label).toBe("32");
    expect(rec.tight).toEqual([]);
  });

  it("lists limitations", () => {
    const body: Body = { ...typed(man), chest: { value: 98, sd: 3, source: "photo" } };
    const lines = limitations(recommend(garment("cotton-tee"), body));
    expect(lines).toContain("Photo estimates ±6 cm");
    expect(lines).toContain("Sample size chart");
    expect(lines).toContain("Stretch counted: 5%");
  });
});
