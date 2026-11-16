import { describe, expect, it } from "vitest";
import { estimateBreath, estimateSoft, estimateSurface } from "./estimate";
import { logPercentile } from "./percentile";
import { computeProfile, weightAxis } from "./profile";
import { RULES, ruleEvidenceCodes } from "./rules";
import type { EvidenceLite, FabricFacts } from "./types";
import { weightBand, weightPosition, weightWord } from "./weight";

const ev = (code: string, over: Partial<EvidenceLite> = {}): EvidenceLite => ({
  code,
  subjectType: "MATERIAL",
  subjectCode: "cj_crs",
  attribute: "x",
  valueText: null,
  valueMin: null,
  valueMax: null,
  ...over,
});

const jersey = (over: Partial<FabricFacts> = {}): FabricFacts => ({
  materialCode: "cj_crs",
  constructionCode: "single_jersey",
  constructionCategory: "WEFT_KNIT",
  yarnProcessCode: "combed_ring_spun",
  finishCode: "none",
  fibers: [{ fiber: "cotton_upland", standard: null, pct: 100 }],
  gsm: 160,
  gsmRange: [130, 220],
  evidence: [
    ev("EV-HAND", { attribute: "hand_descriptor", valueText: "soft" }),
    ev("EV-SURF", {
      subjectType: "CONSTRUCTION",
      subjectCode: "single_jersey",
      attribute: "surface_descriptor",
      valueText: "smooth",
    }),
    ev("EV-GSM", { attribute: "typical_gsm", valueMin: 130, valueMax: 220 }),
    ev("EV-YARN-RING-SOFTER", { subjectType: "YARN_PROCESS", subjectCode: "combed_ring_spun" }),
    ev("EV-YARN-COMBED-SMOOTH", { subjectType: "YARN_PROCESS", subjectCode: "combed_ring_spun" }),
    ev("EV-KNIT-WEIGHT-AIRPERM", { subjectType: "CONSTRUCTION", subjectCode: "single_jersey" }),
  ],
  measurements: [],
  ...over,
});

describe("WEIGHT_v1", () => {
  it("maps 80 gsm to 0 and 400 gsm to 100", () => {
    expect(weightPosition(80)).toBe(0);
    expect(weightPosition(400)).toBe(100);
    expect(weightPosition(240)).toBe(50);
  });
  it("clamps outside the range", () => {
    expect(weightPosition(40)).toBe(0);
    expect(weightPosition(600)).toBe(100);
  });
  it("rounds to one decimal", () => {
    expect(weightPosition(160)).toBe(25);
    expect(weightPosition(81)).toBe(0.3);
  });
  it("refuses zero, negative and non-numbers", () => {
    expect(() => weightPosition(0)).toThrow();
    expect(() => weightPosition(-5)).toThrow();
    expect(() => weightPosition(Number.NaN)).toThrow();
  });
  it("bands a range and refuses a reversed one", () => {
    expect(weightBand(120, 200)).toEqual([12.5, 37.5]);
    expect(() => weightBand(200, 120)).toThrow();
  });
  it("words each fifth", () => {
    expect(weightWord(10)).toBe("Very light");
    expect(weightWord(25)).toBe("Light");
    expect(weightWord(50)).toBe("Mid-weight");
    expect(weightWord(70)).toBe("Heavy");
    expect(weightWord(95)).toBe("Very heavy");
  });
});

describe("weight axis", () => {
  it("prefers an accredited lab mass test", () => {
    const f = jersey({
      measurements: [
        {
          id: "m1",
          testStandard: "ISO_3801",
          property: "mass_per_area",
          value: 240,
          unit: "g/m2",
          accredited: true,
        },
      ],
    });
    expect(weightAxis(f)).toMatchObject({ basis: "MEASURED", value: 50, measurementIds: ["m1"] });
  });
  it("ignores a non-accredited test and uses the declared gsm", () => {
    const f = jersey({
      measurements: [
        {
          id: "m1",
          testStandard: "ISO_3801",
          property: "mass_per_area",
          value: 240,
          unit: "g/m2",
          accredited: false,
        },
      ],
    });
    expect(weightAxis(f)).toMatchObject({ basis: "DECLARED", value: 25, measurementIds: [] });
  });
  it("bands the library range only with typical_gsm evidence", () => {
    expect(weightAxis(jersey({ gsm: null }))).toMatchObject({
      basis: "ESTIMATED",
      band: [15.6, 43.8],
      evidenceCodes: ["EV-GSM"],
    });
    const noEv = jersey({ gsm: null, evidence: [] });
    expect(weightAxis(noEv).basis).toBe("NOT_AVAILABLE");
  });
});

describe("estimated bands", () => {
  it("places the descriptor and applies supported shifts", () => {
    // soft 10–40, ring-spun −5
    expect(estimateSoft(jersey())).toEqual({
      band: [5, 35],
      evidenceCodes: ["EV-HAND", "EV-YARN-RING-SOFTER"],
    });
  });
  it("skips a shift whose evidence is missing", () => {
    const f = jersey({
      evidence: jersey().evidence.filter((e) => e.code !== "EV-YARN-RING-SOFTER"),
    });
    expect(estimateSoft(f)?.band).toEqual([10, 40]);
  });
  it("is null without a descriptor", () => {
    expect(estimateSoft(jersey({ evidence: [] }))).toBeNull();
  });
  it("ignores an unknown descriptor word", () => {
    const f = jersey({
      evidence: [ev("EV-HAND", { attribute: "hand_descriptor", valueText: "lovely" })],
    });
    expect(estimateSoft(f)).toBeNull();
  });
  it("prefers the material's own descriptor over the construction's", () => {
    const f = jersey({
      yarnProcessCode: null,
      evidence: [
        ev("EV-C", {
          subjectType: "CONSTRUCTION",
          subjectCode: "single_jersey",
          attribute: "hand_descriptor",
          valueText: "crisp",
        }),
        ev("EV-M", { attribute: "hand_descriptor", valueText: "limp" }),
      ],
    });
    expect(estimateSoft(f)).toEqual({ band: [0, 30], evidenceCodes: ["EV-M"] });
  });
  it("matches fibre shifts on the main fibre only", () => {
    const evidence = [
      ev("EV-H", { attribute: "hand_descriptor", valueText: "medium" }),
      ev("EV-FIB-MODAL-SOFTER"),
    ];
    const main = jersey({
      yarnProcessCode: null,
      evidence,
      fibers: [
        { fiber: "modal", standard: null, pct: 50 },
        { fiber: "cotton_upland", standard: null, pct: 50 },
      ],
    });
    const minor = jersey({
      yarnProcessCode: null,
      evidence,
      fibers: [
        { fiber: "modal", standard: null, pct: 30 },
        { fiber: "cotton_upland", standard: null, pct: 70 },
      ],
    });
    expect(estimateSoft(main)?.band).toEqual([20, 50]);
    expect(estimateSoft(minor)?.band).toEqual([30, 60]);
  });
  it("clamps shifted bands to 0–100", () => {
    const f = jersey({
      yarnProcessCode: "ring_spun_carded",
      finishCode: "silicone_softened",
      fibers: [{ fiber: "modal", standard: null, pct: 100 }],
      evidence: [
        ev("EV-H", { attribute: "hand_descriptor", valueText: "limp" }),
        ev("EV-FIB-MODAL-SOFTER"),
        ev("EV-FIN-SOFTENER-BENDING"),
        ev("EV-YARN-RING-SOFTER"),
      ],
    });
    expect(estimateSoft(f)?.band).toEqual([0, 5]);
  });
  it("uses the construction surface descriptor with the combed shift", () => {
    expect(estimateSurface(jersey())).toEqual({
      band: [0, 25],
      evidenceCodes: ["EV-SURF", "EV-YARN-COMBED-SMOOTH"],
    });
  });
  it("estimates breathability for knits from weight, not for wovens", () => {
    expect(estimateBreath(jersey())).toEqual({
      band: [10, 40],
      evidenceCodes: ["EV-KNIT-WEIGHT-AIRPERM"],
    });
    expect(estimateBreath(jersey({ constructionCategory: "WOVEN" }))).toBeNull();
    expect(estimateBreath(jersey({ evidence: [] }))).toBeNull();
  });
  it("moves pique towards insulating when the evidence is present", () => {
    const f = jersey({
      constructionCode: "pique",
      evidence: [...jersey().evidence, ev("EV-KNIT-LACOSTE-LOW-AIRPERM")],
    });
    expect(estimateBreath(f)?.band).toEqual([20, 50]);
  });
  it("widens a library-range breath band", () => {
    expect(estimateBreath(jersey({ gsm: null }))?.band).toEqual([0.6, 58.8]);
  });
});

describe("logPercentile", () => {
  const ref = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512];
  it("ranks by log with mid-rank ties", () => {
    expect(logPercentile(1, ref, 10)).toBe(5);
    expect(logPercentile(600, ref, 10)).toBe(100);
    expect(logPercentile(0.5, ref, 10)).toBe(0);
    expect(logPercentile(20, ref, 10)).toBe(50);
  });
  it("is off below the minimum set size or for non-positive values", () => {
    expect(logPercentile(4, ref.slice(0, 9), 10)).toBeNull();
    expect(logPercentile(0, ref, 10)).toBeNull();
  });
});

describe("computeProfile", () => {
  it("gives all four axes in order with rules on every non-missing axis", () => {
    const p = computeProfile(jersey());
    expect(p.map((a) => a.axis)).toEqual([
      "SOFT_FIRM",
      "LIGHT_SUBSTANTIAL",
      "SMOOTH_TEXTURED",
      "BREATHABLE_INSULATING",
    ]);
    expect(p.map((a) => a.basis)).toEqual(["ESTIMATED", "DECLARED", "ESTIMATED", "ESTIMATED"]);
    for (const a of p) expect(a.rule).not.toBeNull();
  });
  it("marks axes with no evidence not available", () => {
    const p = computeProfile(jersey({ evidence: [], gsm: null }));
    expect(p.every((a) => a.basis === "NOT_AVAILABLE" && a.rule === null)).toBe(true);
  });
  it("uses the measured path only with an accredited test and a large enough reference set", () => {
    const m = {
      id: "m1",
      testStandard: "ISO_9237",
      property: "air_permeability",
      value: 300,
      unit: "mm/s",
      accredited: true,
    };
    const cal = [
      {
        setCode: "R1",
        property: "air_permeability",
        unit: "mm/s",
        values: [50, 80, 100, 150, 200, 250, 350, 400, 500, 800],
      },
    ];
    const p = computeProfile(jersey({ measurements: [m] }), cal);
    expect(p[3]).toMatchObject({
      basis: "MEASURED",
      value: 40,
      measurementIds: ["m1"],
      rule: { code: "BREATH_MEAS", version: 1 },
    });
    const small = computeProfile(jersey({ measurements: [m] }), [
      { ...cal[0], values: cal[0].values.slice(0, 5) },
    ]);
    expect(small[3].basis).toBe("ESTIMATED");
    const unaccredited = computeProfile(
      jersey({ measurements: [{ ...m, accredited: false }] }),
      cal,
    );
    expect(unaccredited[3].basis).toBe("ESTIMATED");
  });
});

describe("rules", () => {
  it("has unique code + version pairs and a description for each", () => {
    const keys = RULES.map((r) => `${r.code}@${r.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    for (const r of RULES) expect(r.ruleDescription.length).toBeGreaterThan(40);
  });
  it("lists the evidence codes the shifts cite", () => {
    expect(ruleEvidenceCodes()).toContain("EV-FIB-MODAL-SOFTER");
    expect(ruleEvidenceCodes()).toContain("EV-KNIT-WEIGHT-AIRPERM");
  });
});
