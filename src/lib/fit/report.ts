/**
 * Personalized fit report (DEC-020): per size and body area, how tight a garment will be on
 * this buyer. Cheap arithmetic over precomputed simulation tensions; no simulation runs here.
 * Formula and constants: ./config.ts.
 */
import { easeFor, FIT, type FitClass, type FitConfig } from "./config";
import { IS_LENGTH, REGIONS, type Region } from "./regions";

/** A body measurement in cm with its uncertainty interval. */
export interface Measure {
  value: number;
  low: number;
  high: number;
}

export type Body = Partial<Record<Region, Measure>>;
/** Garment measurements in cm: size → area → cm. */
export type SizeChart = Record<string, Partial<Record<Region, number>>>;
/** Simulated tension: size → area → 0..1. */
export type BaseTension = Record<string, Partial<Record<Region, number>>>;

export type Band = "loose" | "comfortable" | "snug" | "tight";

export interface RegionFit {
  region: Region;
  tension: number;
  tensionLow: number;
  tensionHigh: number;
  uncertain: boolean;
  verdict: Band;
  /** Garment cm − body cm. */
  ease: number;
}

export interface SizeOption {
  size: string;
  /** 0..100, higher is more comfortable overall. */
  score: number;
  /** Every area below the tight threshold. */
  fits: boolean;
  regions: RegionFit[];
  notes: string[];
}

export interface FitReport {
  recommendedSize: string | null;
  confidence: "high" | "medium" | "low";
  /** No size keeps every area below tight; the least tight is recommended. */
  noGoodSize: boolean;
  /** At least one tension came from a simulation rather than measurements alone. */
  simulated: boolean;
  sizeOptions: SizeOption[];
}

export interface FitInput {
  body: Body;
  /** Sizes in order, smallest first. Sizes missing from the chart are skipped. */
  sizes: string[];
  chart: SizeChart;
  stretchPct: number;
  /** The archetype the simulation ran on, in cm. */
  archetype?: Partial<Record<Region, number>> | null;
  base?: BaseTension | null;
  /** Garment type: sets the ideal ease per area (./config.ts EASE). */
  fitClass?: FitClass;
  config?: FitConfig;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places;

export function band(t: number, c: FitConfig = FIT): Band {
  if (t >= c.tightFrom) return "tight";
  if (t >= c.snugFrom) return "snug";
  if (t >= c.comfortableFrom) return "comfortable";
  return "loose";
}

/**
 * Tension shift from the comfortable centre caused by `ease` cm of room (negative ease = the
 * garment is smaller than the body). See ./config.ts.
 */
export function shift(
  region: Region,
  ease: number,
  stretchPct: number,
  cls: FitClass = "top",
  c: FitConfig = FIT,
) {
  const { ideal, looseAt } = easeFor(cls, region);
  if (ease >= ideal) return (-(c.centre - c.comfortableFrom) * (ease - ideal)) / looseAt;
  const zero = ideal > 0 ? c.snugAtZero - c.centre : 0;
  if (ease >= 0) return (zero * (ideal - ease)) / ideal;
  const relief = IS_LENGTH[region]
    ? 1
    : Math.max(c.minStretchKeep, 1 - (c.stretchFactor * clamp(stretchPct, 0, 100)) / 100);
  return zero + c.k * -ease * relief;
}

/** Displayed tension for one area at one body measurement. */
export function regionTension(
  region: Region,
  garmentCm: number,
  bodyCm: number,
  stretchPct: number,
  sim: { base: number; archetypeCm: number } | null,
  cls: FitClass = "top",
  c: FitConfig = FIT,
) {
  const drop = region === "torso" ? c.torsoHemDrop : 0;
  const own = shift(region, garmentCm - bodyCm - drop, stretchPct, cls, c);
  const raw = sim
    ? sim.base + own - shift(region, garmentCm - sim.archetypeCm - drop, stretchPct, cls, c)
    : c.centre + own;
  return clamp(raw, c.drapeFloor, 1);
}

const SCORE: Record<Band, number> = { comfortable: 1, snug: 0.6, loose: 0.6, tight: 0 };

const AREA: Record<Region, string> = {
  chest: "chest",
  waist: "waist",
  hip: "hips",
  upperArm: "upper arms",
  thigh: "thighs",
  shoulder: "shoulders",
  torso: "length",
};

function note(r: RegionFit, size: string, larger: string | undefined, chart: SizeChart): string {
  const more = larger ? (chart[larger]?.[r.region] ?? 0) - (chart[size]?.[r.region] ?? 0) : 0;
  const bigger = larger && more > 0 ? ` — size ${larger} gives ${round(more, 1)} cm more room` : "";
  const longer = larger && more > 0 ? ` — size ${larger} is ${round(more, 1)} cm longer` : "";
  const unsure = r.uncertain ? " (measurement unsure)" : "";
  if (r.region === "torso") {
    if (r.verdict === "tight") return `Runs short for your measurements${longer}${unsure}`;
    if (r.verdict === "loose") return `Long for your measurements${unsure}`;
    return r.uncertain ? `Length may be ${r.verdict === "snug" ? "short" : "fine"}${unsure}` : "";
  }
  const area = AREA[r.region];
  if (r.verdict === "tight")
    return `Runs tight through the ${area} for your measurements${bigger}${unsure}`;
  if (r.verdict === "snug") return `Snug at the ${area}${unsure}`;
  if (r.verdict === "loose") return `Loose at the ${area}${unsure}`;
  return r.uncertain ? `Comfortable at the ${area}${unsure}` : "";
}

export function fitReport(input: FitInput): FitReport {
  const c = input.config ?? FIT;
  const sizes = input.sizes.filter((s) => input.chart[s]);
  const lowStretch = input.stretchPct < c.lowStretchPct;
  let simulated = false;

  const options: SizeOption[] = sizes.map((size, i) => {
    const regions: RegionFit[] = [];
    for (const region of REGIONS) {
      const g = input.chart[size]?.[region];
      const m = input.body[region];
      if (g === undefined || !m) continue;
      const base = input.base?.[size]?.[region];
      const archetypeCm = input.archetype?.[region];
      const sim = base !== undefined && archetypeCm !== undefined ? { base, archetypeCm } : null;
      if (sim) simulated = true;
      const at = (cm: number) =>
        regionTension(region, g, cm, input.stretchPct, sim, input.fitClass ?? "top", c);
      const tension = at(m.value);
      // A larger body measurement means less room, so `high` gives the higher tension.
      const tensionLow = at(Math.min(m.low, m.value));
      const tensionHigh = at(Math.max(m.high, m.value));
      const uncertain = band(tensionLow, c) !== band(tensionHigh, c);
      regions.push({
        region,
        tension: round(tension),
        tensionLow: round(tensionLow),
        tensionHigh: round(tensionHigh),
        uncertain,
        verdict: band(tension, c),
        ease: round(g - m.value - (region === "torso" ? c.torsoHemDrop : 0), 1),
      });
    }
    // Unsure areas on a fabric that barely stretches are judged at their tightest.
    const fits =
      regions.length > 0 &&
      regions.every((r) => (lowStretch && r.uncertain ? r.tensionHigh : r.tension) < c.tightFrom);
    const score = regions.length
      ? Math.round((100 * regions.reduce((s, r) => s + SCORE[r.verdict], 0)) / regions.length)
      : 0;
    const larger = sizes[i + 1];
    const notes = regions.map((r) => note(r, size, larger, input.chart)).filter(Boolean);
    return { size, score, fits, regions, notes };
  });

  const compared = options.filter((o) => o.regions.length);
  if (!compared.length)
    return {
      recommendedSize: null,
      confidence: "low",
      noGoodSize: false,
      simulated,
      sizeOptions: options,
    };

  const comfortable = (o: SizeOption) =>
    o.regions.filter((r) => r.verdict === "comfortable").length;
  const centre = (o: SizeOption) =>
    o.regions.reduce((s, r) => s + Math.abs(r.tension - c.centre), 0);
  const unsure = (o: SizeOption) => o.regions.some((r) => r.uncertain);
  const order = (o: SizeOption) => sizes.indexOf(o.size);

  // An unsure area that could turn snug or tight; on fabric that barely stretches, avoid it.
  const tightRisk = (o: SizeOption) =>
    o.regions.some((r) => r.uncertain && r.tensionHigh >= c.snugFrom);
  const fitting = compared.filter((o) => o.fits);
  let best: SizeOption;
  if (fitting.length) {
    const safe = lowStretch ? fitting.filter((o) => !tightRisk(o)) : fitting;
    if (safe.length) {
      const top = Math.max(...safe.map(comfortable));
      const tied = safe.filter((o) => comfortable(o) === top);
      best = tied.reduce((a, b) => (centre(b) < centre(a) - 1e-9 ? b : a));
    } else {
      best = fitting.reduce((a, b) => (order(b) > order(a) ? b : a));
    }
  } else {
    // Least tight; on a tie (everything maxed out) the larger size gives more room.
    const worst = (o: SizeOption) => Math.max(...o.regions.map((r) => r.tension));
    best = compared.reduce((a, b) =>
      worst(b) < worst(a) - 1e-9 || (Math.abs(worst(b) - worst(a)) <= 1e-9 && order(b) > order(a))
        ? b
        : a,
    );
  }

  const confidence = !best.fits
    ? "low"
    : unsure(best) || best.regions.length < 2
      ? "medium"
      : "high";
  return {
    recommendedSize: best.size,
    confidence,
    noGoodSize: !fitting.length,
    simulated,
    sizeOptions: options,
  };
}

/** What a buyer is matched to a standard shape (body cluster) by, in cm. */
export const MATCH_FEATURES = ["height", "chest", "waist", "hip"] as const;
export type MatchMeasurements = Partial<Record<(typeof MATCH_FEATURES)[number], number>>;

/** The matching features of a stored archetype's params (cm). */
export function matchParams(json: unknown): MatchMeasurements {
  const out: MatchMeasurements = {};
  if (json && typeof json === "object")
    for (const k of MATCH_FEATURES) {
      const v = (json as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
  return out;
}

/**
 * Nearest archetype by standardised distance over height, chest, waist and hip: each feature's
 * difference is divided by its spread among the candidate archetypes, so every feature counts by
 * how much the standard shapes differ in it. Only the given gender's archetypes when it is known
 * and has any; null when no feature can be compared.
 */
export function closestArchetype<A extends { gender: string; params: MatchMeasurements }>(
  measurements: MatchMeasurements,
  archetypes: A[],
  gender?: string | null,
): A | null {
  const own = gender ? archetypes.filter((a) => a.gender === gender) : [];
  const pool = own.length ? own : archetypes;
  const spread = Object.fromEntries(
    MATCH_FEATURES.map((k) => {
      const xs = pool.map((a) => a.params[k]).filter((v): v is number => v !== undefined);
      const mean = xs.reduce((t, v) => t + v, 0) / (xs.length || 1);
      const sd = Math.sqrt(xs.reduce((t, v) => t + (v - mean) ** 2, 0) / (xs.length || 1));
      return [k, sd > 1e-6 ? sd : 1];
    }),
  ) as Record<(typeof MATCH_FEATURES)[number], number>;
  let best: A | null = null;
  let bestD = Infinity;
  for (const a of pool) {
    let d = 0;
    let n = 0;
    for (const k of MATCH_FEATURES) {
      const m = measurements[k];
      const p = a.params[k];
      if (m === undefined || p === undefined) continue;
      d += ((m - p) / spread[k]) ** 2;
      n++;
    }
    if (n && d / n < bestD) {
      bestD = d / n;
      best = a;
    }
  }
  return best;
}
