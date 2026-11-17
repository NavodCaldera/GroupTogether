/**
 * Buyer Material Card payload (DEC-022). Built from plain data; every shown field is a
 * `Sourced` value or null. `sourcedFields` lists them all for the provenance check.
 */
import { MOISTURE, ruleRef } from "./rules";
import type {
  AxisKey,
  AxisResult,
  EvidenceLite,
  FiberShare,
  MeasurementLite,
  Provenance,
  Sourced,
} from "./types";
import { weightPosition, weightWord } from "./weight";

export type Badge = "LAB_MEASURED" | "FACTORY_DECLARED" | "LIBRARY_ESTIMATE";

export const BADGE_LABEL: Record<Badge, string> = {
  LAB_MEASURED: "Lab-measured",
  FACTORY_DECLARED: "Factory-declared",
  LIBRARY_ESTIMATE: "Estimated from fabric type",
};

export const AXIS_TEXT: Record<
  AxisKey,
  { name: string; left: string; right: string; zero: string }
> = {
  SOFT_FIRM: { name: "Softness", left: "Soft", right: "Firm", zero: "softest" },
  LIGHT_SUBSTANTIAL: { name: "Weight", left: "Light", right: "Substantial", zero: "lightest" },
  SMOOTH_TEXTURED: { name: "Surface", left: "Smooth", right: "Textured", zero: "smoothest" },
  BREATHABLE_INSULATING: {
    name: "Breathability",
    left: "Breathable",
    right: "Insulating",
    zero: "most breathable",
  },
};

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Screen-reader text for a slider */
export function axisText(a: AxisResult): string {
  const t = AXIS_TEXT[a.axis];
  const tail = `out of 100, where 0 is ${t.zero}`;
  if (a.basis === "ESTIMATED" && a.band)
    return `${t.name}: estimated ${fmt(a.band[0])}–${fmt(a.band[1])} ${tail}`;
  if (a.basis === "MEASURED" && a.value != null)
    return `${t.name}: measured ${fmt(a.value)} ${tail}`;
  if (a.basis === "DECLARED" && a.value != null)
    return `${t.name}: ${fmt(a.value)} from the factory's figure, ${tail}`;
  return `${t.name}: not yet measured`;
}

export type FactsForCard = {
  productMaterialId: string;
  displayName: string;
  materialCode: string;
  constructionCode: string;
  constructionName: string;
  yarnProcessName: string | null;
  feelsLikeAnchor: string | null;
  composition: FiberShare[];
  fiberNames: Record<string, string>;
  standardNames: Record<string, string>;
  actualGsm: number;
  careNotes: string | null;
  videoUrl: string | null;
  axes: AxisResult[];
  evidence: EvidenceLite[];
  measurements: MeasurementLite[];
};

export type MeasuredFigure = { value: number; unit: string; standard: string; accredited: boolean };

export type MaterialCard = {
  productMaterialId: string;
  badge: Badge;
  displayName: string;
  feelsLike: Sourced<string> | null;
  adjectives: Sourced<string[]> | null;
  axes: (AxisResult & { text: string })[];
  onSkin: Sourced<string> | null;
  madeFor: Sourced<string[]> | null;
  videoUrl: string | null;
  details: {
    weight: Sourced<{ gsm: number; caption: string }>;
    composition: Sourced<string>;
    construction: Sourced<string> | null;
    stretch: Sourced<MeasuredFigure> | null;
    breathability: Sourced<MeasuredFigure> | null;
    shrinkage: Sourced<MeasuredFigure> | null;
  };
  care: Sourced<string> | null;
};

const STRETCH = ["ISO_20932_1", "ASTM_D2594", "ASTM_D3107"];
const AIR = ["ISO_9237", "ASTM_D737"];
const SHRINK = ["ISO_5077", "AATCC_TM135"];
const MASS = ["ISO_3801", "EN_12127", "ASTM_D3776"];

/** Accredited results first, then the newest entered */
function pick(
  ms: MeasurementLite[],
  standards: string[],
  property: string,
): Sourced<MeasuredFigure> | null {
  const m = [...ms]
    .filter((x) => standards.includes(x.testStandard) && x.property === property)
    .sort((a, b) => Number(b.accredited) - Number(a.accredited))[0];
  return m
    ? {
        value: { value: m.value, unit: m.unit, standard: m.testStandard, accredited: m.accredited },
        provenance: { kind: "measurement", measurementIds: [m.id] },
      }
    : null;
}

function forSubject(f: FactsForCard, attribute: string): EvidenceLite[] {
  return f.evidence.filter(
    (e) =>
      e.verified &&
      e.attribute === attribute &&
      ((e.subjectType === "MATERIAL" && e.subjectCode === f.materialCode) ||
        (e.subjectType === "CONSTRUCTION" && e.subjectCode === f.constructionCode)),
  );
}

function listFrom(rows: EvidenceLite[], max: number): Sourced<string[]> | null {
  const vals = rows.filter((r) => r.valueText).slice(0, max);
  return vals.length
    ? {
        value: vals.map((r) => r.valueText as string),
        provenance: { kind: "evidence", evidenceCodes: vals.map((r) => r.code) },
      }
    : null;
}

export function moistureLine(
  f: Pick<FactsForCard, "composition" | "evidence">,
): Sourced<string> | null {
  const main = [...f.composition].sort((a, b) => b.pct - a.pct)[0];
  if (!main || main.pct < 50) return null;
  const ev = f.evidence.find(
    (e) =>
      e.verified &&
      e.subjectType === "FIBER" &&
      e.subjectCode === main.fiber &&
      e.attribute === "moisture_regain_pct" &&
      e.valueMin != null,
  );
  if (!ev || ev.valueMin == null) return null;
  const regain = ev.valueMax != null ? (ev.valueMin + ev.valueMax) / 2 : ev.valueMin;
  const text =
    regain >= MOISTURE.absorbsFromPct
      ? "Absorbs sweat"
      : regain < MOISTURE.littleBelowPct
        ? "Absorbs very little moisture"
        : null;
  return text
    ? {
        value: text,
        provenance: {
          kind: "rule",
          rule: ruleRef("MOISTURE"),
          evidenceCodes: [ev.code],
          measurementIds: [],
        },
      }
    : null;
}

export function badgeFor(
  axes: AxisResult[],
  measurements: MeasurementLite[],
  declaredComposition: boolean,
): Badge {
  const shown = axes.filter((a) => a.basis !== "NOT_AVAILABLE");
  if (shown.length && shown.every((a) => a.basis === "MEASURED")) return "LAB_MEASURED";
  if (measurements.length || declaredComposition) return "FACTORY_DECLARED";
  return "LIBRARY_ESTIMATE";
}

export function compositionText(
  f: Pick<FactsForCard, "composition" | "fiberNames" | "standardNames" | "yarnProcessName">,
): string {
  const parts = [...f.composition]
    .sort((a, b) => b.pct - a.pct)
    .map((c) => {
      const std = c.standard ? f.standardNames[c.standard] : null;
      return `${c.pct}% ${std ? `${std} ` : ""}${f.fiberNames[c.fiber] ?? c.fiber}`;
    });
  return [parts.join(", "), f.yarnProcessName].filter(Boolean).join(" · ");
}

export function buildCard(f: FactsForCard, opts: { declaredComposition: boolean }): MaterialCard {
  const weightRule = ruleRef("WEIGHT");
  const mass = pick(f.measurements, MASS, "mass_per_area");
  const gsm = mass?.value.accredited ? mass.value.value : f.actualGsm;
  const weightProv: Provenance =
    mass?.value.accredited && mass.provenance.kind === "measurement"
      ? { kind: "measurement", measurementIds: mass.provenance.measurementIds, rule: weightRule }
      : { kind: "declared", rule: weightRule };
  const construction = forSubject(f, "structure").filter((e) => e.subjectType === "CONSTRUCTION");
  const feelsEv = forSubject(f, "feels_like").filter((e) => e.subjectType === "MATERIAL");

  return {
    productMaterialId: f.productMaterialId,
    badge: badgeFor(f.axes, f.measurements, opts.declaredComposition),
    displayName: f.displayName,
    feelsLike:
      f.feelsLikeAnchor && feelsEv.length
        ? {
            value: f.feelsLikeAnchor,
            provenance: { kind: "evidence", evidenceCodes: feelsEv.map((e) => e.code) },
          }
        : null,
    adjectives: listFrom(forSubject(f, "haptic_adjective"), 3),
    axes: f.axes.map((a) => ({ ...a, text: axisText(a) })),
    onSkin: moistureLine(f),
    madeFor: listFrom(forSubject(f, "end_use"), 4),
    videoUrl: f.videoUrl,
    details: {
      weight: { value: { gsm, caption: weightWord(weightPosition(gsm)) }, provenance: weightProv },
      composition: { value: compositionText(f), provenance: { kind: "declared" } },
      construction: construction.length
        ? {
            value: f.constructionName,
            provenance: { kind: "evidence", evidenceCodes: construction.map((e) => e.code) },
          }
        : null,
      stretch: pick(f.measurements, STRETCH, "stretch"),
      breathability: pick(f.measurements, AIR, "air_permeability"),
      shrinkage: pick(f.measurements, SHRINK, "shrinkage"),
    },
    care: f.careNotes ? { value: f.careNotes, provenance: { kind: "declared" } } : null,
  };
}

/** Every buyer-visible value with its provenance, for the provenance check and "How we know this" */
export function sourcedFields(
  c: MaterialCard,
): { field: string; provenance: Provenance | null; shown: boolean }[] {
  const out: { field: string; provenance: Provenance | null; shown: boolean }[] = [];
  const add = (field: string, s: Sourced<unknown> | null) =>
    out.push({ field, provenance: s?.provenance ?? null, shown: s != null });
  add("feelsLike", c.feelsLike);
  add("adjectives", c.adjectives);
  add("onSkin", c.onSkin);
  add("madeFor", c.madeFor);
  add("care", c.care);
  for (const [k, v] of Object.entries(c.details)) add(`details.${k}`, v as Sourced<unknown> | null);
  for (const a of c.axes) {
    const shown = a.basis !== "NOT_AVAILABLE";
    const provenance: Provenance | null = !shown
      ? null
      : a.basis === "DECLARED"
        ? { kind: "declared", rule: a.rule ?? undefined }
        : {
            kind: "rule",
            rule: a.rule!,
            evidenceCodes: a.evidenceCodes,
            measurementIds: a.measurementIds,
          };
    out.push({ field: `axes.${a.axis}`, provenance, shown });
  }
  return out;
}

/** A shown value is properly sourced when its provenance names something checkable */
export function isSourced(p: Provenance | null): boolean {
  if (!p) return false;
  switch (p.kind) {
    case "measurement":
      return p.measurementIds.length > 0;
    case "evidence":
      return p.evidenceCodes.length > 0;
    case "rule":
      return !!p.rule && p.evidenceCodes.length + p.measurementIds.length > 0;
    case "declared":
      return true;
  }
}
