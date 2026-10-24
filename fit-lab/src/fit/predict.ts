import { CAL } from "../calibration";
import type { Garment, GarmentKey } from "../garments/database";
import { probBetween } from "../measure/geometry";
import type { Body, Estimate } from "../types";
import { BODY_FOR, EASE, STRETCHES, WEIGHT, type EaseBand } from "./ease";

export type Verdict = "too_tight" | "snug" | "good" | "roomy" | "too_loose";

export interface DimensionFit {
  key: GarmentKey;
  garment: number;
  weight: number;
  body?: Estimate;
  /** Effective ease including fabric stretch, cm. */
  ease?: number;
  sd?: number;
  verdict?: Verdict;
  /** P(ease in the good band). */
  pGood?: number;
  /** P(ease between too tight and too loose). */
  pWearable?: number;
  /** P(ease below the good band). */
  pTight?: number;
  /** P(ease above the good band). */
  pLoose?: number;
  /** Expected penalty over the measurement uncertainty. */
  penalty?: number;
}

export interface SizeFit {
  label: string;
  dims: DimensionFit[];
  /** Weighted mean expected penalty; lower is better. */
  penalty: number;
  /** P(every compared measurement is wearable). */
  wearable: number;
}

export interface Recommendation {
  garment: Garment;
  sizes: SizeFit[];
  best: SizeFit | null;
  /** A neighbouring size almost as good as the best. */
  alternative: SizeFit | null;
  /** 0..1 */
  confidence: number;
  level: "high" | "medium" | "low";
  tight: GarmentKey[];
  loose: GarmentKey[];
  /** Measurements in the size chart the body has no value for. */
  missing: GarmentKey[];
  noGoodSize: boolean;
}

export function verdict(ease: number, b: EaseBand): Verdict {
  if (ease < b.tight) return "too_tight";
  if (ease < b.snug) return "snug";
  if (ease <= b.roomy) return "good";
  if (ease <= b.loose) return "roomy";
  return "too_loose";
}

/** 0 in the good band; tight costs twice as much as loose because loose can still be worn. */
export function penaltyAt(ease: number, b: EaseBand): number {
  if (ease >= b.snug && ease <= b.roomy) return 0;
  if (ease < b.snug) {
    const step = Math.max(b.snug - b.tight, 0.5);
    return ease >= b.tight ? (2 * (b.snug - ease)) / step : 2 + (4 * (b.tight - ease)) / step;
  }
  const step = Math.max(b.loose - b.roomy, 0.5);
  return ease <= b.loose ? (ease - b.roomy) / step : 1 + (2 * (ease - b.loose)) / step;
}

const Z = Array.from({ length: 25 }, (_, i) => -3 + i * 0.25);
const W = Z.map((z) => Math.exp((-z * z) / 2));
const WSUM = W.reduce((a, b) => a + b, 0);

export function expectedPenalty(mean: number, sd: number, b: EaseBand): number {
  if (sd <= 0) return penaltyAt(mean, b);
  return Z.reduce((acc, z, i) => acc + W[i] * penaltyAt(mean + z * sd, b), 0) / WSUM;
}

function fitDimension(garment: Garment, key: GarmentKey, value: number, body: Body): DimensionFit {
  const weight = WEIGHT[garment.category][key] ?? 1;
  const b = EASE[garment.category][key]?.[garment.fit];
  const est = body[BODY_FOR[key]];
  if (!b || !est) return { key, garment: value, weight, body: est };

  const stretch = STRETCHES.includes(key)
    ? (est.value * garment.fabric.stretchPct * CAL.stretchUse) / 100
    : 0;
  const ease = value - est.value + stretch;
  const sd = Math.hypot(est.sd, CAL.garmentSd);
  return {
    key,
    garment: value,
    weight,
    body: est,
    ease,
    sd,
    verdict: verdict(ease, b),
    pGood: probBetween(ease, sd, b.snug, b.roomy),
    pWearable: probBetween(ease, sd, b.tight, b.loose),
    pTight: probBetween(ease, sd, -Infinity, b.snug),
    pLoose: probBetween(ease, sd, b.roomy, Infinity),
    penalty: expectedPenalty(ease, sd, b),
  };
}

export function fitSize(garment: Garment, label: string, body: Body): SizeFit {
  const size = garment.sizes.find((s) => s.label === label);
  if (!size) throw new Error(`Unknown size ${label}`);
  const dims = (Object.entries(size.measurements) as [GarmentKey, number][]).map(([k, v]) =>
    fitDimension(garment, k, v, body),
  );
  const scored = dims.filter((d) => d.penalty !== undefined);
  const wsum = scored.reduce((a, d) => a + d.weight, 0);
  return {
    label,
    dims,
    penalty: wsum ? scored.reduce((a, d) => a + d.weight * d.penalty!, 0) / wsum : Infinity,
    wearable: scored.reduce((a, d) => a * d.pWearable!, 1),
  };
}

const POSSIBLE = 0.3;

export function recommend(garment: Garment, body: Body): Recommendation {
  const sizes = garment.sizes.map((s) => fitSize(garment, s.label, body));
  const ranked = sizes
    .filter((s) => Number.isFinite(s.penalty))
    .sort((a, b) => a.penalty - b.penalty);
  const best = ranked[0] ?? null;

  const keys = Object.keys(garment.sizes[0]?.measurements ?? {}) as GarmentKey[];
  const missing = keys.filter((k) => !body[BODY_FOR[k]]);
  if (!best) {
    return {
      garment,
      sizes,
      best,
      alternative: null,
      confidence: 0,
      level: "low",
      tight: [],
      loose: [],
      missing,
      noGoodSize: false,
    };
  }

  const i = sizes.indexOf(best);
  const alternative =
    [sizes[i - 1], sizes[i + 1]]
      .filter((s): s is SizeFit => !!s && Number.isFinite(s.penalty))
      .filter((s) => s.penalty - best.penalty < 0.25)
      .sort((a, b) => a.penalty - b.penalty)[0] ?? null;

  const scored = best.dims.filter((d) => d.verdict);
  const tight = scored
    .filter((d) => d.verdict === "too_tight" || d.verdict === "snug" || d.pTight! >= POSSIBLE)
    .map((d) => d.key);
  const loose = scored
    .filter((d) => d.verdict === "too_loose" || d.verdict === "roomy" || d.pLoose! >= POSSIBLE)
    .map((d) => d.key);

  const missingCritical = missing.filter((k) => (WEIGHT[garment.category][k] ?? 1) >= 2).length;
  const confidence = best.wearable * 0.85 ** missing.length * 0.6 ** missingCritical;
  return {
    garment,
    sizes,
    best,
    alternative,
    confidence,
    level: confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low",
    tight,
    loose,
    missing,
    noGoodSize: best.wearable < 0.2,
  };
}
