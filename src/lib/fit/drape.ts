/**
 * A garment drawn over the buyer's own 3D body (DEC-021, geometric engine): the body surface the
 * garment covers, pushed out by each area's room from the size chart. No cloth simulation; the
 * colour is the fit report's tension. Pure functions, run in the browser.
 */
import type { FitClass } from "./config";
import { NEUTRAL } from "./blend";
import { REGION_ID, type Region } from "./regions";
import type { RegionFit } from "./report";

/** Body part per vertex (`_BODY_PART` in the body file, tools/body-fitting/body.py `PART`). */
export const PART = {
  chest: 0,
  waist: 1,
  hip: 2,
  upperArm: 3,
  thigh: 4,
  shoulder: 5,
  lowerArm: 6,
  lowerLeg: 7,
  head: 8,
  end: 9,
  /** Below the hip joints, above the thigh: bottoms and dresses cover it, tops end above it. */
  seat: 10,
} as const;
const PART_COUNT = 11;

/** Parts each garment type covers (regular fit, short sleeves, full-length bottoms). */
export const COVER: Record<FitClass, number[]> = {
  top: [PART.chest, PART.waist, PART.hip, PART.upperArm, PART.shoulder],
  outer: [PART.chest, PART.waist, PART.hip, PART.upperArm, PART.shoulder, PART.lowerArm],
  bottom: [PART.waist, PART.hip, PART.seat, PART.thigh, PART.lowerLeg],
  dress: [PART.chest, PART.waist, PART.hip, PART.seat, PART.shoulder, PART.thigh],
};

/** Fit area shown on each part; parts without one are drawn in the plain garment colour. */
const PART_REGION: (Region | null)[] = [
  "chest",
  "waist",
  "hip",
  "upperArm",
  "thigh",
  "shoulder",
  null,
  null,
  null,
  null,
  "hip",
];

/** Gap between body and garment where the garment is at or below the body's size, cm. */
export const MIN_GAP_CM = 0.3;
/** Room shown at most, cm (a very loose size still drapes, it doesn't balloon). */
export const MAX_GAP_CM = 6;
/** Parts with no chart measurement (lengths, sleeves past the chart). */
const DEFAULT_GAP_CM = 0.8;

/**
 * Gap per part in cm for one size. A circumference's room spreads around the body, so the gap is
 * room / 2π; lengths and the shoulder seam sit close.
 */
export function partGaps(regions: Pick<RegionFit, "region" | "ease">[]): number[] {
  const gaps = Array<number>(PART_COUNT).fill(DEFAULT_GAP_CM);
  for (const r of regions) {
    if (r.region === "shoulder" || r.region === "torso") continue;
    const part = PART[r.region as keyof typeof PART];
    if (part === undefined) continue;
    gaps[part] = Math.min(MAX_GAP_CM, Math.max(MIN_GAP_CM, r.ease / (2 * Math.PI)));
    if (r.region === "hip") gaps[PART.seat] = gaps[part];
  }
  return gaps;
}

export interface Garment {
  /** Body vertex index for each garment vertex. */
  source: Uint32Array;
  indices: Uint32Array;
  /** `REGION_ID` per garment vertex, NEUTRAL for parts without a fit area. */
  regionIds: Float32Array;
  part: Uint8Array;
  /** Garment-vertex neighbours (CSR) for smoothing the gaps across part borders. */
  adjStart: Uint32Array;
  adj: Uint32Array;
}

/** The covered part of the body mesh, re-indexed. Built once per body and garment type. */
/** Shorts and skirts stop above the knee. */
export const isShort = (kind: string | null | undefined) => !!kind && /shorts|skirts/.test(kind);

export function garmentFrom(
  parts: ArrayLike<number>,
  indices: ArrayLike<number>,
  cls: FitClass,
  short = false,
): Garment {
  const cover = new Set(COVER[cls].filter((p) => !(short && p === PART.lowerLeg)));
  const map = new Int32Array(parts.length).fill(-1);
  const source: number[] = [];
  const tris: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i];
    const b = indices[i + 1];
    const c = indices[i + 2];
    if (
      !cover.has(Math.round(parts[a])) ||
      !cover.has(Math.round(parts[b])) ||
      !cover.has(Math.round(parts[c]))
    )
      continue;
    for (const v of [a, b, c]) {
      if (map[v] < 0) {
        map[v] = source.length;
        source.push(v);
      }
      tris.push(map[v]);
    }
  }
  const n = source.length;
  const part = new Uint8Array(n);
  const regionIds = new Float32Array(n);
  source.forEach((v, i) => {
    part[i] = Math.round(parts[v]);
    const region = PART_REGION[part[i]];
    regionIds[i] = region ? REGION_ID[region] : NEUTRAL;
  });
  // Neighbour lists from the triangles.
  const sets = Array.from({ length: n }, () => new Set<number>());
  for (let i = 0; i < tris.length; i += 3) {
    const [a, b, c] = [tris[i], tris[i + 1], tris[i + 2]];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const adjStart = new Uint32Array(n + 1);
  sets.forEach((s, i) => (adjStart[i + 1] = adjStart[i] + s.size));
  const adj = new Uint32Array(adjStart[n]);
  sets.forEach((s, i) => adj.set([...s], adjStart[i]));
  return {
    source: Uint32Array.from(source),
    indices: Uint32Array.from(tris),
    regionIds,
    part,
    adjStart,
    adj,
  };
}

/** The body's four bones and weights per garment vertex, so the garment moves with the body. */
export function garmentSkin(
  g: Garment,
  joints: ArrayLike<number>,
  weights: ArrayLike<number>,
): { skinIndex: Uint16Array; skinWeight: Float32Array } {
  const skinIndex = new Uint16Array(g.source.length * 4);
  const skinWeight = new Float32Array(g.source.length * 4);
  g.source.forEach((v, i) => {
    for (let c = 0; c < 4; c++) {
      skinIndex[i * 4 + c] = joints[v * 4 + c];
      skinWeight[i * 4 + c] = weights[v * 4 + c];
    }
  });
  return { skinIndex, skinWeight };
}

/**
 * Garment vertex positions: each body vertex moved out along its normal by its part's gap,
 * smoothed so neighbouring parts with different room meet without a step. Metres.
 */
export function drapePositions(
  g: Garment,
  bodyPositions: ArrayLike<number>,
  bodyNormals: ArrayLike<number>,
  gapsCm: number[],
  out: Float32Array<ArrayBuffer> = new Float32Array(g.source.length * 3),
  smoothing = 8,
): Float32Array<ArrayBuffer> {
  const n = g.source.length;
  let gap = Float32Array.from(g.part, (p) => gapsCm[p] / 100);
  let next = new Float32Array(n);
  for (let k = 0; k < smoothing; k++) {
    for (let i = 0; i < n; i++) {
      let sum = gap[i];
      const s = g.adjStart[i];
      const e = g.adjStart[i + 1];
      for (let j = s; j < e; j++) sum += gap[g.adj[j]];
      next[i] = sum / (1 + e - s);
    }
    [gap, next] = [next, gap];
  }
  for (let i = 0; i < n; i++) {
    const v = g.source[i] * 3;
    for (let c = 0; c < 3; c++) out[i * 3 + c] = bodyPositions[v + c] + bodyNormals[v + c] * gap[i];
  }
  return out;
}
