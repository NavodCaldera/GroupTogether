/**
 * Estimated bands (DEC-022): SOFT_EST, SURFACE_EST, BREATH_EST in rules.ts. A band exists only
 * when evidence supports it; otherwise the result is null and the axis is not available.
 */
import {
  BREATH_EST,
  SOFT_EST,
  SURFACE_EST,
  type DescriptorRule,
  type Shift,
  type When,
} from "./rules";
import type { EvidenceLite, FabricFacts } from "./types";
import { clamp, weightBand, weightPosition } from "./weight";

export type Estimate = { band: [number, number]; evidenceCodes: string[] };

/** Fibres making up at least half the blend */
function mainFibers(f: FabricFacts): string[] {
  return f.fibers.filter((x) => x.pct >= 50).map((x) => x.fiber);
}

export function holds(when: When, f: FabricFacts): boolean {
  if (when.fiber && !when.fiber.some((c) => mainFibers(f).includes(c))) return false;
  if (when.finish && !when.finish.includes(f.finishCode)) return false;
  if (when.yarn && !(f.yarnProcessCode && when.yarn.includes(f.yarnProcessCode))) return false;
  if (when.construction && !when.construction.includes(f.constructionCode)) return false;
  return true;
}

/** Shifts whose conditions hold and whose cited evidence is all present */
function applicable(shifts: Shift[], f: FabricFacts): Shift[] {
  const have = new Set(f.evidence.map((e) => e.code));
  return shifts.filter((s) => holds(s.when, f) && s.evidence.every((c) => have.has(c)));
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Moves a band, clamps to 0–100 and rounds to one decimal like stored values */
function shifted(band: [number, number], shifts: Shift[]): [number, number] {
  const d = shifts.reduce((t, s) => t + s.shift, 0);
  return [r1(clamp(band[0] + d)), r1(clamp(band[1] + d))];
}

/** Material-level descriptor wins over construction-level */
export function descriptor(attribute: string, f: FabricFacts): EvidenceLite | null {
  const rows = f.evidence.filter((e) => e.attribute === attribute && e.valueText);
  return (
    rows.find((e) => e.subjectType === "MATERIAL" && e.subjectCode === f.materialCode) ??
    rows.find((e) => e.subjectType === "CONSTRUCTION" && e.subjectCode === f.constructionCode) ??
    null
  );
}

function fromDescriptor(rule: DescriptorRule, f: FabricFacts): Estimate | null {
  const d = descriptor(rule.attribute, f);
  const base = d?.valueText ? rule.bands[d.valueText] : undefined;
  if (!d || !base) return null;
  const s = applicable(rule.shifts, f);
  return { band: shifted(base, s), evidenceCodes: [d.code, ...s.flatMap((x) => x.evidence)] };
}

export const estimateSoft = (f: FabricFacts) => fromDescriptor(SOFT_EST, f);
export const estimateSurface = (f: FabricFacts) => fromDescriptor(SURFACE_EST, f);

export function estimateBreath(f: FabricFacts): Estimate | null {
  if (!BREATH_EST.categories.includes(f.constructionCategory)) return null;
  const have = new Set(f.evidence.map((e) => e.code));
  if (!BREATH_EST.weightEvidence.every((c) => have.has(c))) return null;
  let band: [number, number];
  if (f.gsm != null) {
    const c = weightPosition(f.gsm);
    band = [c - BREATH_EST.halfWidth, c + BREATH_EST.halfWidth];
  } else if (f.gsmRange) {
    const [lo, hi] = weightBand(f.gsmRange[0], f.gsmRange[1]);
    band = [lo - BREATH_EST.halfWidth, hi + BREATH_EST.halfWidth];
  } else return null;
  const s = applicable(BREATH_EST.shifts, f);
  const [lo, hi] = shifted([clamp(band[0]), clamp(band[1])], s);
  return {
    band: [lo, hi],
    evidenceCodes: [...BREATH_EST.weightEvidence, ...s.flatMap((x) => x.evidence)],
  };
}
