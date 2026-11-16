/**
 * Feel profile (DEC-022): per axis, measured → declared → estimated → not available.
 * Only accredited measurements take the measured path; others are shown in the details, flagged.
 */
import { estimateBreath, estimateSoft, estimateSurface, type Estimate } from "./estimate";
import { logPercentile } from "./percentile";
import {
  BREATH_MEAS,
  SOFT_MEAS,
  SURFACE_MEAS,
  WEIGHT_TESTS,
  ruleRef,
  type MeasuredRule,
} from "./rules";
import type { AxisKey, AxisResult, CalibrationValues, FabricFacts, MeasurementLite } from "./types";
import { weightBand, weightPosition } from "./weight";

const na = (axis: AxisKey): AxisResult => ({
  axis,
  basis: "NOT_AVAILABLE",
  value: null,
  band: null,
  rule: null,
  evidenceCodes: [],
  measurementIds: [],
});

const estimated = (axis: AxisKey, rule: string, e: Estimate | null): AxisResult =>
  e
    ? {
        axis,
        basis: "ESTIMATED",
        value: null,
        band: e.band,
        rule: ruleRef(rule),
        evidenceCodes: e.evidenceCodes,
        measurementIds: [],
      }
    : na(axis);

export function firstAccepted(
  ms: MeasurementLite[],
  accepts: readonly { testStandard: string; property: string; unit: string }[],
): MeasurementLite | null {
  for (const a of accepts) {
    const m = ms.find(
      (x) =>
        x.accredited &&
        x.testStandard === a.testStandard &&
        x.property === a.property &&
        x.unit === a.unit,
    );
    if (m) return m;
  }
  return null;
}

function measured(
  axis: AxisKey,
  code: string,
  rule: MeasuredRule,
  f: FabricFacts,
  calibration: CalibrationValues[],
): AxisResult | null {
  for (const a of rule.accepts) {
    const m = firstAccepted(f.measurements, [a]);
    const ref = calibration.find((c) => c.property === a.property && c.unit === a.unit);
    if (!m || !ref) continue;
    const pct = logPercentile(m.value, ref.values, rule.minSwatches);
    if (pct == null) continue;
    const value = rule.higherIsRight ? pct : Math.round((100 - pct) * 10) / 10;
    return {
      axis,
      basis: "MEASURED",
      value,
      band: null,
      rule: ruleRef(code),
      evidenceCodes: [],
      measurementIds: [m.id],
    };
  }
  return null;
}

export function weightAxis(f: FabricFacts): AxisResult {
  const axis = "LIGHT_SUBSTANTIAL";
  const rule = ruleRef("WEIGHT");
  const m = firstAccepted(f.measurements, WEIGHT_TESTS);
  if (m) {
    return {
      axis,
      basis: "MEASURED",
      value: weightPosition(m.value),
      band: null,
      rule,
      evidenceCodes: [],
      measurementIds: [m.id],
    };
  }
  if (f.gsm != null) {
    return {
      axis,
      basis: "DECLARED",
      value: weightPosition(f.gsm),
      band: null,
      rule,
      evidenceCodes: [],
      measurementIds: [],
    };
  }
  const ev = f.evidence.find(
    (e) =>
      e.subjectType === "MATERIAL" &&
      e.subjectCode === f.materialCode &&
      e.attribute === "typical_gsm",
  );
  if (f.gsmRange && ev) {
    return {
      axis,
      basis: "ESTIMATED",
      value: null,
      band: weightBand(...f.gsmRange),
      rule,
      evidenceCodes: [ev.code],
      measurementIds: [],
    };
  }
  return na(axis);
}

export function computeProfile(
  f: FabricFacts,
  calibration: CalibrationValues[] = [],
): AxisResult[] {
  return [
    measured("SOFT_FIRM", "SOFT_MEAS", SOFT_MEAS, f, calibration) ??
      estimated("SOFT_FIRM", "SOFT_EST", estimateSoft(f)),
    weightAxis(f),
    measured("SMOOTH_TEXTURED", "SURFACE_MEAS", SURFACE_MEAS, f, calibration) ??
      estimated("SMOOTH_TEXTURED", "SURFACE_EST", estimateSurface(f)),
    measured("BREATHABLE_INSULATING", "BREATH_MEAS", BREATH_MEAS, f, calibration) ??
      estimated("BREATHABLE_INSULATING", "BREATH_EST", estimateBreath(f)),
  ];
}
