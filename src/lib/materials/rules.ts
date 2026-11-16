/**
 * GroupBasket methodology rules for the feel profile (DEC-022). This file is the source of
 * truth: the loader writes each rule version into `MethodologyRule` (append-only), and the
 * card shows `ruleDescription` under "How we know this". A change to a rule's numbers is a new
 * version here, never an edit of a published one.
 *
 * Every band and shift below is a GroupBasket product decision, stated in the rule text. The
 * sources only give orderings ("modal is softer than cotton"), so each row names the evidence
 * that supports its direction. A fabric with no supporting evidence for an axis gets
 * NOT_AVAILABLE, never a default.
 */
import type { AxisKey, RuleRef } from "./types";

export type Band = [number, number];

/** Applies when every given condition holds. `fiber` matches a fibre with at least half the blend. */
export type When = {
  fiber?: string[];
  finish?: string[];
  yarn?: string[];
  construction?: string[];
};

export type Shift = { when: When; shift: number; evidence: string[]; note: string };

export type DescriptorRule = {
  /** Evidence attribute that carries the descriptor in `valueText` */
  attribute: string;
  bands: Record<string, Band>;
  shifts: Shift[];
};

export type MeasuredRule = {
  /** Accepted tests in priority order; the first with an accredited result is used */
  accepts: { testStandard: string; property: string; unit: string }[];
  /** Higher measured value moves the slider towards the right-hand pole */
  higherIsRight: boolean;
  /** Fewer reference swatches than this and the measured path stays off */
  minSwatches: number;
};

export type Rule = {
  code: string;
  version: number;
  attribute: AxisKey | "MOISTURE";
  ruleDescription: string;
  formula: string;
  params: Record<string, unknown>;
};

export const WEIGHT = { minGsm: 80, maxGsm: 400 } as const;
export const WEIGHT_TESTS = [
  { testStandard: "ISO_3801", property: "mass_per_area", unit: "g/m2" },
  { testStandard: "EN_12127", property: "mass_per_area", unit: "g/m2" },
  { testStandard: "ASTM_D3776", property: "mass_per_area", unit: "g/m2" },
] as const;

export const SOFT_EST: DescriptorRule = {
  attribute: "hand_descriptor",
  bands: {
    limp: [0, 30],
    soft: [10, 40],
    medium: [30, 60],
    crisp: [50, 80],
    stiff: [65, 95],
  },
  shifts: [
    {
      when: { fiber: ["modal"] },
      shift: -10,
      evidence: ["EV-FIB-MODAL-SOFTER"],
      note: "Modal measured softer than cotton",
    },
    {
      when: { fiber: ["polyester", "polyester_recycled"] },
      shift: 10,
      evidence: ["EV-FIB-POLY-LEAST-SOFT"],
      note: "Polyester had the lowest soft feel of the fabrics compared",
    },
    {
      when: { finish: ["silicone_softened"] },
      shift: -10,
      evidence: ["EV-FIN-SOFTENER-BENDING"],
      note: "Softeners reduce bending rigidity",
    },
    {
      when: { yarn: ["ring_spun_carded", "combed_ring_spun", "compact_spun"] },
      shift: -5,
      evidence: ["EV-YARN-RING-SOFTER"],
      note: "Ring-spun yarn is softer than open-end",
    },
  ],
};

export const SURFACE_EST: DescriptorRule = {
  attribute: "surface_descriptor",
  bands: {
    smooth: [0, 30],
    fine_texture: [20, 50],
    raised: [35, 65],
    textured: [55, 85],
    strongly_textured: [70, 100],
  },
  shifts: [
    {
      when: { yarn: ["combed_ring_spun", "compact_spun"] },
      shift: -5,
      evidence: ["EV-YARN-COMBED-SMOOTH"],
      note: "Combed and compact yarns are smoother, with less hairiness",
    },
    {
      when: { yarn: ["open_end_carded"] },
      shift: 5,
      evidence: ["EV-YARN-OE-COARSE"],
      note: "Open-end yarn is coarser",
    },
  ],
};

export const BREATH_EST = {
  /** Only knits: the supporting study measured knitted structures, not wovens */
  categories: ["WEFT_KNIT", "WARP_KNIT"] as string[],
  /** Unit weight drives the centre; the band is ± this many points */
  halfWidth: 15,
  weightEvidence: ["EV-KNIT-WEIGHT-AIRPERM"],
  shifts: [
    {
      when: { construction: ["pique"] },
      shift: 10,
      evidence: ["EV-KNIT-LACOSTE-LOW-AIRPERM"],
      note: "Lacoste/pique structures were among the least air-permeable",
    },
  ] as Shift[],
};

export const SOFT_MEAS: MeasuredRule = {
  accepts: [
    { testStandard: "KES_FB2_BENDING", property: "bending_rigidity", unit: "gf.cm2/cm" },
    { testStandard: "AATCC_TM202", property: "stiffness", unit: "index" },
    { testStandard: "ASTM_D1388", property: "flexural_rigidity", unit: "mg.cm" },
    { testStandard: "FAST2", property: "bending_rigidity", unit: "uN.m" },
  ],
  higherIsRight: true,
  minSwatches: 10,
};

export const SURFACE_MEAS: MeasuredRule = {
  accepts: [
    { testStandard: "KES_FB4_SURFACE", property: "smd", unit: "um" },
    { testStandard: "AATCC_TM218", property: "roughness", unit: "index" },
  ],
  higherIsRight: true,
  minSwatches: 10,
};

export const BREATH_MEAS: MeasuredRule = {
  accepts: [
    { testStandard: "ISO_9237", property: "air_permeability", unit: "mm/s" },
    { testStandard: "ASTM_D737", property: "air_permeability", unit: "cm3/cm2/s" },
  ],
  /** More air through the fabric = more breathable = left pole */
  higherIsRight: false,
  minSwatches: 10,
};

/** On-skin line from the main fibre's sourced moisture regain (shown apart from the sliders) */
export const MOISTURE = { absorbsFromPct: 6, littleBelowPct: 1 } as const;

export const RULES: Rule[] = [
  {
    code: "MOISTURE",
    version: 1,
    attribute: "MOISTURE",
    ruleDescription:
      "From the published moisture regain of the fibre making up most of the fabric: 6% or more reads as absorbing sweat (cotton about 8.5%, viscose about 13%); under 1% reads as absorbing very little (polyester about 0.4%). Between the two, nothing is said. Commercial reference values, not a test of this fabric.",
    formula: "regain >= 6 → absorbs sweat; regain < 1 → absorbs very little; otherwise no line",
    params: { ...MOISTURE },
  },
  {
    code: "WEIGHT",
    version: 1,
    attribute: "LIGHT_SUBSTANTIAL",
    ruleDescription:
      "Weight in grams per square metre, placed on a line from 80 gsm (0) to 400 gsm (100). The 80–400 range is a GroupBasket choice that spans the library, from lawn and voile to fleece and denim. A lab mass test (ISO 3801, EN 12127, ASTM D3776) is used when there is one; otherwise the factory's declared gsm.",
    formula: "clamp((gsm - 80) / (400 - 80) * 100, 0, 100)",
    params: { ...WEIGHT, tests: WEIGHT_TESTS },
  },
  {
    code: "SOFT_EST",
    version: 1,
    attribute: "SOFT_FIRM",
    ruleDescription:
      "Estimated from how published sources describe this fabric's hand (limp, soft, medium, crisp, stiff), each word placed on a GroupBasket band, then moved by fibre, yarn and finish only where a source supports the direction. 0 is softest.",
    formula: "band(hand_descriptor) + sum(shifts whose conditions hold), clamped to 0–100",
    params: { ...SOFT_EST },
  },
  {
    code: "SURFACE_EST",
    version: 1,
    attribute: "SMOOTH_TEXTURED",
    ruleDescription:
      "Estimated from how published sources describe this fabric's surface (smooth to strongly textured), each placed on a GroupBasket band, then moved by yarn where a source supports it. 0 is smoothest.",
    formula: "band(surface_descriptor) + sum(shifts whose conditions hold), clamped to 0–100",
    params: { ...SURFACE_EST },
  },
  {
    code: "BREATH_EST",
    version: 1,
    attribute: "BREATHABLE_INSULATING",
    ruleDescription:
      "Knits only. A study of knitted fabrics found unit weight the strongest influence on air permeability, so the estimate is centred on the weight position ±15, moved for structures the study found less permeable. 0 is most breathable. Wovens are not estimated.",
    formula: "weight position ± 15 + sum(construction shifts), clamped to 0–100; knits only",
    params: { ...BREATH_EST },
  },
  {
    code: "SOFT_MEAS",
    version: 1,
    attribute: "SOFT_FIRM",
    ruleDescription:
      "Measured stiffness ranked against the GroupBasket Reference Swatch Set: percentile of the log of the value among the set's swatches tested the same way. Off until the set has at least 10 measured swatches.",
    formula: "percentile_rank(log(value), log(reference values)) * 100",
    params: { ...SOFT_MEAS },
  },
  {
    code: "SURFACE_MEAS",
    version: 1,
    attribute: "SMOOTH_TEXTURED",
    ruleDescription:
      "Measured surface roughness ranked against the GroupBasket Reference Swatch Set, as for stiffness. Off until the set has at least 10 measured swatches.",
    formula: "percentile_rank(log(value), log(reference values)) * 100",
    params: { ...SURFACE_MEAS },
  },
  {
    code: "BREATH_MEAS",
    version: 1,
    attribute: "BREATHABLE_INSULATING",
    ruleDescription:
      "Measured air permeability (ISO 9237 or ASTM D737) ranked against the GroupBasket Reference Swatch Set; more air through the fabric places it nearer Breathable. Off until the set has at least 10 measured swatches.",
    formula: "100 - percentile_rank(log(value), log(reference values)) * 100",
    params: { ...BREATH_MEAS },
  },
];

export function ruleRef(code: string): RuleRef {
  const r = RULES.find((x) => x.code === code);
  if (!r) throw new Error(`Unknown rule ${code}`);
  return { code: r.code, version: r.version };
}

/** Every evidence code a rule cites, for the provenance check */
export function ruleEvidenceCodes(): string[] {
  const shifts = [...SOFT_EST.shifts, ...SURFACE_EST.shifts, ...BREATH_EST.shifts];
  return [...new Set([...shifts.flatMap((s) => s.evidence), ...BREATH_EST.weightEvidence])];
}
