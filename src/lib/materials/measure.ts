/**
 * Factory material input (DEC-022): the lab tests a factory can enter, the accreditation check
 * and the "more than 15% off the library" review trigger. Pure.
 */
import { z } from "zod";
import { BREATH_MEAS, SOFT_MEAS, SURFACE_MEAS, WEIGHT_TESTS } from "./rules";
import type { FiberShare } from "./types";

export type MeasureKind = { testStandard: string; property: string; unit: string; label: string };

const LABEL: Record<string, string> = {
  mass_per_area: "Weight",
  bending_rigidity: "Bending rigidity",
  stiffness: "Stiffness",
  flexural_rigidity: "Flexural rigidity",
  smd: "Surface roughness (SMD)",
  roughness: "Surface roughness",
  air_permeability: "Air permeability",
  stretch: "Stretch",
  shrinkage: "Shrinkage after washing",
};

const std = (s: string) => s.replace(/_/g, " ").replace(/ TM/, " TM ").replace(/\s+/g, " ").trim();

/** Every test the card or a feel rule reads, in form order */
export const MEASURE_KINDS: MeasureKind[] = [
  ...WEIGHT_TESTS,
  ...SOFT_MEAS.accepts,
  ...SURFACE_MEAS.accepts,
  ...BREATH_MEAS.accepts,
  { testStandard: "ISO_20932_1", property: "stretch", unit: "%" },
  { testStandard: "ASTM_D2594", property: "stretch", unit: "%" },
  { testStandard: "ASTM_D3107", property: "stretch", unit: "%" },
  { testStandard: "ISO_5077", property: "shrinkage", unit: "%" },
  { testStandard: "AATCC_TM135", property: "shrinkage", unit: "%" },
].map((k) => ({ ...k, label: `${LABEL[k.property] ?? k.property} · ${std(k.testStandard)} (${k.unit})` }));

export const kindKey = (k: { testStandard: string; property: string }) => `${k.testStandard}:${k.property}`;
export const findKind = (key: string) => MEASURE_KINDS.find((k) => kindKey(k) === key) ?? null;

/** A result counts as accredited only from a known lab whose checked scope lists the test */
export function isAccredited(
  lab: { scope: string[]; scopeVerifiedOn: Date | null } | null,
  testStandard: string,
): boolean {
  return !!lab && !!lab.scopeVerifiedOn && lab.scope.includes(testStandard);
}

/** Share of the range a value is outside it; 0 inside */
const off = (v: number, lo: number, hi: number) =>
  v < lo ? (lo - v) / lo : v > hi ? (v - hi) / hi : 0;

export const REVIEW_OFF = 0.15;

/** Reasons a factory's figures need a Factory admin to look (more than 15% off the library) */
export function reviewReasons(
  gsm: number,
  range: [number, number] | null,
  composition: FiberShare[],
  library: FiberShare[],
): string[] {
  const out: string[] = [];
  if (range && off(gsm, range[0], range[1]) > REVIEW_OFF)
    out.push(`${gsm} gsm is more than 15% outside ${range[0]}–${range[1]} gsm`);
  const lib = new Map(library.map((f) => [f.fiber, f.pct]));
  const mine = new Map(composition.map((f) => [f.fiber, f.pct]));
  const fibers = new Set([...lib.keys(), ...mine.keys()]);
  const moved = [...fibers].reduce((s, f) => s + Math.abs((mine.get(f) ?? 0) - (lib.get(f) ?? 0)), 0) / 2;
  if (moved > REVIEW_OFF * 100) out.push(`composition differs from the library by ${moved} points`);
  return out;
}

const int = (min: number, max: number, msg: string) =>
  z.string().trim().regex(/^\d+$/, msg).transform(Number).refine((n) => n >= min && n <= max, msg);

/**
 * The factory's Material card form: `material`, `gsm`, `fiber.<i>`, `pct.<i>`, `standard.<i>`,
 * `confirmRange`.
 */
export function parseMaterialForm(entries: Record<string, string>) {
  const base = z
    .object({
      material: z.string().trim().min(1, "Choose a material"),
      gsm: int(10, 2000, "GSM is a whole number from 10 to 2000"),
      confirmRange: z.string().optional(),
    })
    .parse(entries);
  const composition: FiberShare[] = [];
  for (let i = 0; i < 6; i++) {
    const fiber = entries[`fiber.${i}`]?.trim();
    const pct = entries[`pct.${i}`]?.trim();
    if (!fiber && !pct) continue;
    if (!fiber) throw new MaterialInputError("Choose the fibre for each percentage");
    const n = Number(pct);
    if (!Number.isInteger(n) || n < 1 || n > 100)
      throw new MaterialInputError("Each fibre percentage is a whole number from 1 to 100");
    composition.push({ fiber, standard: entries[`standard.${i}`]?.trim() || null, pct: n });
  }
  if (!composition.length) throw new MaterialInputError("Enter the composition");
  const sum = composition.reduce((s, f) => s + f.pct, 0);
  if (sum !== 100) throw new MaterialInputError(`The composition adds up to ${sum}%, not 100%`);
  if (new Set(composition.map((f) => `${f.fiber}:${f.standard}`)).size !== composition.length)
    throw new MaterialInputError("Each fibre once");
  return { materialCode: base.material, gsm: base.gsm, composition, confirmRange: base.confirmRange === "on" };
}

export class MaterialInputError extends Error {}

/** One lab result from the factory form */
export function parseMeasurementForm(entries: Record<string, string>) {
  const kind = findKind(entries.kind ?? "");
  if (!kind) throw new MaterialInputError("Choose the test");
  const v = z
    .object({
      value: z.string().trim().transform(Number).refine((n) => Number.isFinite(n) && n >= 0 && n < 1e6, "Enter the result as a number"),
      lab: z.string().trim().max(80),
      labName: z.string().trim().max(120),
      accreditationNo: z.string().trim().max(60),
      reportRef: z.string().trim().max(80),
      testedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the test date"),
    })
    .parse({
      value: entries.value ?? "",
      lab: entries.lab ?? "",
      labName: entries.labName ?? "",
      accreditationNo: entries.accreditationNo ?? "",
      reportRef: entries.reportRef ?? "",
      testedOn: entries.testedOn ?? "",
    });
  if (!v.lab && !v.labName) throw new MaterialInputError("Choose the lab or type its name");
  const testedOn = new Date(`${v.testedOn}T00:00:00Z`);
  if (testedOn.getTime() > Date.now()) throw new MaterialInputError("The test date is in the future");
  return { kind, ...v, testedOn };
}
