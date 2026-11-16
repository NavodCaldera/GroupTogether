/**
 * Material library types (DEC-022). Pure data: no database. Every value a buyer can see is a
 * `Sourced<T>`, so its provenance travels with it; a value without provenance is `null`.
 */

export const AXES = [
  "SOFT_FIRM",
  "LIGHT_SUBSTANTIAL",
  "SMOOTH_TEXTURED",
  "BREATHABLE_INSULATING",
] as const;
export type AxisKey = (typeof AXES)[number];

export type Basis = "MEASURED" | "DECLARED" | "ESTIMATED" | "NOT_AVAILABLE";

export type RuleRef = { code: string; version: number };

/** Where a shown value comes from. Only these kinds exist; anything else is not shown. */
export type Provenance =
  | { kind: "measurement"; measurementIds: string[]; rule?: RuleRef }
  | { kind: "evidence"; evidenceCodes: string[]; rule?: RuleRef }
  | { kind: "rule"; rule: RuleRef; evidenceCodes: string[]; measurementIds: string[] }
  /** The factory's own declaration (gsm, composition override), optionally passed through a rule */
  | { kind: "declared"; rule?: RuleRef };

export type Sourced<T> = { value: T; provenance: Provenance };

/** One slider */
export type AxisResult = {
  axis: AxisKey;
  basis: Basis;
  /** 0–100 point, for MEASURED and DECLARED */
  value: number | null;
  /** 0–100 band, for ESTIMATED */
  band: [number, number] | null;
  rule: RuleRef | null;
  evidenceCodes: string[];
  measurementIds: string[];
};

/** The parts of an Evidence row the rules read */
export type EvidenceLite = {
  code: string;
  subjectType:
    "FIBER" | "YARN_PROCESS" | "FIBER_STANDARD" | "CONSTRUCTION" | "FINISH" | "MATERIAL" | "LAB";
  subjectCode: string;
  attribute: string;
  valueText: string | null;
  valueMin: number | null;
  valueMax: number | null;
};

export type FiberShare = { fiber: string; standard: string | null; pct: number };

export type MeasurementLite = {
  id: string;
  testStandard: string;
  property: string;
  value: number;
  unit: string;
  accredited: boolean;
};

/** Everything the feel rules need about one fabric */
export type FabricFacts = {
  materialCode: string;
  constructionCode: string;
  constructionCategory: "WEFT_KNIT" | "WARP_KNIT" | "WOVEN" | "OTHER";
  yarnProcessCode: string | null;
  finishCode: string;
  fibers: FiberShare[];
  /** The product's declared gsm; null for a library-only view */
  gsm: number | null;
  /** Library range, used when there is no product gsm */
  gsmRange: [number, number] | null;
  /** Evidence about this material, its construction, yarn, finish and fibres */
  evidence: EvidenceLite[];
  measurements: MeasurementLite[];
};

/** Reference values of the active calibration set for one property */
export type CalibrationValues = {
  setCode: string;
  property: string;
  unit: string;
  values: number[];
};
