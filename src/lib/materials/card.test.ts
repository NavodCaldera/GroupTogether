import { describe, expect, it } from "vitest";
import {
  axisText,
  badgeFor,
  buildCard,
  compositionText,
  isSourced,
  moistureLine,
  sourcedFields,
  type FactsForCard,
} from "./card";
import type { AxisResult, EvidenceLite } from "./types";

const ev = (code: string, over: Partial<EvidenceLite>): EvidenceLite => ({
  code,
  subjectType: "MATERIAL",
  subjectCode: "cj_crs",
  attribute: "x",
  valueText: null,
  valueMin: null,
  valueMax: null,
  ...over,
});

const axis = (over: Partial<AxisResult>): AxisResult => ({
  axis: "SOFT_FIRM",
  basis: "NOT_AVAILABLE",
  value: null,
  band: null,
  rule: null,
  evidenceCodes: [],
  measurementIds: [],
  ...over,
});

const facts = (over: Partial<FactsForCard> = {}): FactsForCard => ({
  productMaterialId: "pm1",
  displayName: "Combed cotton jersey",
  materialCode: "cj_crs",
  constructionCode: "single_jersey",
  constructionName: "Single jersey knit",
  yarnProcessName: "Combed ring-spun",
  feelsLikeAnchor: "a soft everyday T-shirt",
  composition: [{ fiber: "cotton_upland", standard: "organic_gots", pct: 100 }],
  fiberNames: { cotton_upland: "upland cotton" },
  standardNames: { organic_gots: "organic (GOTS)" },
  actualGsm: 160,
  careNotes: "Machine wash 30°C",
  videoUrl: null,
  axes: [
    axis({
      axis: "SOFT_FIRM",
      basis: "ESTIMATED",
      band: [5, 35],
      rule: { code: "SOFT_EST", version: 1 },
      evidenceCodes: ["EV-H"],
    }),
    axis({
      axis: "LIGHT_SUBSTANTIAL",
      basis: "DECLARED",
      value: 25,
      rule: { code: "WEIGHT", version: 1 },
    }),
    axis({ axis: "SMOOTH_TEXTURED" }),
    axis({ axis: "BREATHABLE_INSULATING" }),
  ],
  evidence: [
    ev("EV-FEEL", { attribute: "feels_like" }),
    ev("EV-ADJ1", { attribute: "haptic_adjective", valueText: "soft" }),
    ev("EV-ADJ2", { attribute: "haptic_adjective", valueText: "smooth" }),
    ev("EV-STR", {
      subjectType: "CONSTRUCTION",
      subjectCode: "single_jersey",
      attribute: "structure",
    }),
    ev("EV-COT", {
      subjectType: "FIBER",
      subjectCode: "cotton_upland",
      attribute: "moisture_regain_pct",
      valueMin: 8.5,
    }),
  ],
  measurements: [],
  ...over,
});

describe("axisText", () => {
  it("reads each basis", () => {
    expect(axisText(axis({ basis: "ESTIMATED", band: [15, 30] }))).toBe(
      "Softness: estimated 15–30 out of 100, where 0 is softest",
    );
    expect(axisText(axis({ axis: "BREATHABLE_INSULATING", basis: "MEASURED", value: 40.5 }))).toBe(
      "Breathability: measured 40.5 out of 100, where 0 is most breathable",
    );
    expect(axisText(axis({ axis: "LIGHT_SUBSTANTIAL", basis: "DECLARED", value: 25 }))).toBe(
      "Weight: 25 from the factory's figure, out of 100, where 0 is lightest",
    );
    expect(axisText(axis({}))).toBe("Softness: not yet measured");
  });
});

describe("badgeFor", () => {
  const m = {
    id: "m",
    testStandard: "ISO_9237",
    property: "air_permeability",
    value: 1,
    unit: "mm/s",
    accredited: true,
  };
  it("is lab-measured only when every shown axis is measured", () => {
    expect(badgeFor([axis({ basis: "MEASURED", value: 3 }), axis({})], [m], true)).toBe(
      "LAB_MEASURED",
    );
    expect(
      badgeFor(
        [axis({ basis: "MEASURED", value: 3 }), axis({ basis: "DECLARED", value: 3 })],
        [m],
        true,
      ),
    ).toBe("FACTORY_DECLARED");
  });
  it("is an estimate with nothing from the factory or a lab", () => {
    expect(badgeFor([axis({ basis: "ESTIMATED", band: [1, 2] })], [], false)).toBe(
      "LIBRARY_ESTIMATE",
    );
    expect(badgeFor([axis({})], [], false)).toBe("LIBRARY_ESTIMATE");
  });
});

describe("moistureLine", () => {
  const regain = (fiber: string, v: number) =>
    moistureLine({
      composition: [{ fiber, standard: null, pct: 100 }],
      evidence: [
        ev("EV", {
          subjectType: "FIBER",
          subjectCode: fiber,
          attribute: "moisture_regain_pct",
          valueMin: v,
        }),
      ],
    });
  it("says absorbs for cotton-like regain and very little for polyester", () => {
    expect(regain("cotton_upland", 8.5)?.value).toBe("Absorbs sweat");
    expect(regain("polyester", 0.4)?.value).toBe("Absorbs very little moisture");
    expect(regain("nylon", 4.5)).toBeNull();
  });
  it("says nothing without evidence or without a main fibre", () => {
    expect(
      moistureLine({ composition: [{ fiber: "x", standard: null, pct: 100 }], evidence: [] }),
    ).toBeNull();
    expect(
      moistureLine({
        composition: [
          { fiber: "a", standard: null, pct: 40 },
          { fiber: "b", standard: null, pct: 30 },
          { fiber: "c", standard: null, pct: 30 },
        ],
        evidence: [],
      }),
    ).toBeNull();
  });
});

describe("compositionText", () => {
  it("lists fibres largest first with standard and yarn", () => {
    expect(
      compositionText({
        composition: [
          { fiber: "elastane", standard: null, pct: 8 },
          { fiber: "cotton_upland", standard: "organic_gots", pct: 92 },
        ],
        fiberNames: { elastane: "elastane", cotton_upland: "upland cotton" },
        standardNames: { organic_gots: "organic (GOTS)" },
        yarnProcessName: "Combed ring-spun",
      }),
    ).toBe("92% organic (GOTS) upland cotton, 8% elastane · Combed ring-spun");
  });
});

describe("buildCard provenance", () => {
  const cases: [string, Partial<FactsForCard>][] = [
    ["estimated", {}],
    [
      "mixed",
      {
        measurements: [
          {
            id: "m1",
            testStandard: "ISO_9237",
            property: "air_permeability",
            value: 300,
            unit: "mm/s",
            accredited: false,
          },
        ],
      },
    ],
    [
      "fully measured",
      {
        axes: [
          axis({
            axis: "SOFT_FIRM",
            basis: "MEASURED",
            value: 20,
            rule: { code: "SOFT_MEAS", version: 1 },
            measurementIds: ["a"],
          }),
          axis({
            axis: "LIGHT_SUBSTANTIAL",
            basis: "MEASURED",
            value: 25,
            rule: { code: "WEIGHT", version: 1 },
            measurementIds: ["b"],
          }),
          axis({
            axis: "SMOOTH_TEXTURED",
            basis: "MEASURED",
            value: 30,
            rule: { code: "SURFACE_MEAS", version: 1 },
            measurementIds: ["c"],
          }),
          axis({
            axis: "BREATHABLE_INSULATING",
            basis: "MEASURED",
            value: 40,
            rule: { code: "BREATH_MEAS", version: 1 },
            measurementIds: ["d"],
          }),
        ],
        measurements: [
          {
            id: "b",
            testStandard: "ISO_3801",
            property: "mass_per_area",
            value: 170,
            unit: "g/m2",
            accredited: true,
          },
        ],
      },
    ],
    ["bare", { evidence: [], feelsLikeAnchor: null, careNotes: null, axes: [axis({})] }],
  ];
  it.each(cases)("every shown field is sourced (%s)", (_name, over) => {
    const card = buildCard(facts(over), { declaredComposition: true });
    for (const f of sourcedFields(card)) {
      if (f.shown) expect(isSourced(f.provenance), f.field).toBe(true);
      else expect(f.provenance, f.field).toBeNull();
    }
  });

  it("hides the feels-like anchor without evidence", () => {
    expect(buildCard(facts({ evidence: [] }), { declaredComposition: true }).feelsLike).toBeNull();
  });

  it("uses an accredited mass test over the declared gsm", () => {
    const card = buildCard(
      facts({
        measurements: [
          {
            id: "b",
            testStandard: "ISO_3801",
            property: "mass_per_area",
            value: 170,
            unit: "g/m2",
            accredited: true,
          },
        ],
      }),
      { declaredComposition: true },
    );
    expect(card.details.weight).toEqual({
      value: { gsm: 170, caption: "Light" },
      provenance: {
        kind: "measurement",
        measurementIds: ["b"],
        rule: { code: "WEIGHT", version: 1 },
      },
    });
  });

  it("snapshots the estimated card", () => {
    expect(buildCard(facts(), { declaredComposition: false })).toMatchSnapshot();
  });
});
