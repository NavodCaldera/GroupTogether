import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { axisText, type MaterialCard } from "@/lib/materials/card";
import type { AxisResult } from "@/lib/materials/types";
import { MaterialCardView, type Why } from "./material-card-view";

const rule = { code: "WEIGHT", version: 1 };
const ax = (
  a: Partial<AxisResult> & Pick<AxisResult, "axis" | "basis">,
): AxisResult & { text: string } => {
  const full: AxisResult = {
    value: null,
    band: null,
    rule: null,
    evidenceCodes: [],
    measurementIds: [],
    ...a,
  };
  return { ...full, text: axisText(full) };
};

const base = (
  axes: (AxisResult & { text: string })[],
  badge: MaterialCard["badge"],
): MaterialCard => ({
  productMaterialId: "pm1",
  badge,
  displayName: "Combed cotton jersey",
  feelsLike: {
    value: "an everyday T-shirt",
    provenance: { kind: "evidence", evidenceCodes: ["EV-1"] },
  },
  adjectives: {
    value: ["smooth", "soft"],
    provenance: { kind: "evidence", evidenceCodes: ["EV-2"] },
  },
  axes,
  onSkin: {
    value: "Absorbs sweat",
    provenance: {
      kind: "rule",
      rule: { code: "MOISTURE", version: 1 },
      evidenceCodes: ["EV-3"],
      measurementIds: [],
    },
  },
  madeFor: null,
  videoUrl: null,
  details: {
    weight: { value: { gsm: 160, caption: "Light" }, provenance: { kind: "declared", rule } },
    composition: {
      value: "100% Upland cotton · Combed ring-spun",
      provenance: { kind: "declared" },
    },
    construction: null,
    stretch: null,
    breathability: {
      value: { value: 120, unit: "mm/s", standard: "ISO_9237", accredited: false },
      provenance: { kind: "measurement", measurementIds: ["m1"] },
    },
    shrinkage: null,
  },
  care: { value: "Machine wash cold", provenance: { kind: "declared" } },
});

const why: Why = {
  evidence: [
    {
      code: "EV-1",
      claim: "Single jersey is the standard T-shirt fabric.",
      locator: "Knit Structures",
      excerpt: "the standard T-shirt fabric",
      source: {
        code: "S15",
        title: "Guide",
        publisher: "Example",
        url: "https://example.org",
        tier: "C",
        accessedOn: new Date("2026-11-16"),
      },
    },
  ],
  measurements: [],
  rules: [{ code: "WEIGHT", version: 1, ruleDescription: "Weight on 80–400 gsm.", formula: "x" }],
};

describe("MaterialCardView", () => {
  it("renders declared, estimated and not-measured axes", () => {
    const html = renderToStaticMarkup(
      <MaterialCardView
        card={base(
          [
            ax({ axis: "SOFT_FIRM", basis: "NOT_AVAILABLE" }),
            ax({ axis: "LIGHT_SUBSTANTIAL", basis: "DECLARED", value: 25, rule }),
            ax({
              axis: "SMOOTH_TEXTURED",
              basis: "ESTIMATED",
              band: [0, 25],
              rule: { code: "SURFACE_EST", version: 1 },
              evidenceCodes: ["EV-2"],
            }),
            ax({
              axis: "BREATHABLE_INSULATING",
              basis: "ESTIMATED",
              band: [14.7, 44.7],
              rule: { code: "BREATH_EST", version: 1 },
              evidenceCodes: ["EV-4"],
            }),
          ],
          "FACTORY_DECLARED",
        )}
        why={why}
        compareHref="/products/p1/compare"
      />,
    );
    expect(html).toContain("Softness: not yet measured");
    expect(html).toContain("Not yet measured");
    expect(html).toContain("Surface: estimated 0–25 out of 100");
    expect(html).toContain("not accredited");
    expect(html).toContain("How we know this");
    expect(html).toMatchSnapshot();
  });

  it("renders a lab-measured card", () => {
    const html = renderToStaticMarkup(
      <MaterialCardView
        card={base(
          [
            ax({
              axis: "SOFT_FIRM",
              basis: "MEASURED",
              value: 40,
              rule: { code: "SOFT_MEAS", version: 1 },
              measurementIds: ["m2"],
            }),
            ax({
              axis: "LIGHT_SUBSTANTIAL",
              basis: "MEASURED",
              value: 28.8,
              rule,
              measurementIds: ["m3"],
            }),
            ax({
              axis: "SMOOTH_TEXTURED",
              basis: "MEASURED",
              value: 12,
              rule: { code: "SURFACE_MEAS", version: 1 },
              measurementIds: ["m4"],
            }),
            ax({
              axis: "BREATHABLE_INSULATING",
              basis: "MEASURED",
              value: 30,
              rule: { code: "BREATH_MEAS", version: 1 },
              measurementIds: ["m5"],
            }),
          ],
          "LAB_MEASURED",
        )}
        why={null}
      />,
    );
    expect(html).toContain("Lab-measured");
    expect(html).toContain("Weight: measured 28.8 out of 100");
    expect(html).not.toContain("How we know this");
    expect(html).toMatchSnapshot();
  });
});
