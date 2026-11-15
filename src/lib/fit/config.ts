/**
 * Fit heatmap constants (DEC-020). Starting values, to be calibrated from "How did it fit?"
 * feedback (`FitFeedback`). Tension is 0 (slack) to 1 (tight).
 *
 * Every area of every garment type has an ideal ease (garment cm − body cm) and a distance
 * past it at which the area reads loose (`EASE`). Per area, with ease = garment − body:
 *
 *   ease ≥ ideal        shift = −(centre − comfortableFrom) × (ease − ideal) / looseAt
 *   0 ≤ ease < ideal    shift = (snugAtZero − centre) × (ideal − ease) / ideal
 *   ease < 0            shift = zero + k × deficit × stretchRelief
 *                       (zero = snugAtZero − centre, or 0 when the ideal is 0;
 *                        stretchRelief = max(minStretchKeep, 1 − stretchFactor × stretch% / 100),
 *                        1 for lengths)
 *
 *   with a simulation:  tension = clamp(base + shift(buyer ease) − shift(archetype ease), drapeFloor, 1)
 *   without one:        tension = clamp(centre + shift(buyer ease), drapeFloor, 1)
 *
 * So the ideal ease reads comfortable (centre), no room at all reads snug, a garment smaller
 * than the body reads tight unless the fabric stretches, and `looseAt` cm past the ideal reads
 * loose. The simulation's base already reflects the archetype's own ease, so only the
 * difference between buyer and archetype is added. tools/fit-simulation/simulate.py repeats
 * this table; keep them equal.
 */
export const FIT = {
  /** Tension added per cm the garment is smaller than the body. */
  k: 0.08,
  /** Each stretch percent removes this many percent of the deficit… */
  stretchFactor: 2.5,
  /** …but at least this share of it is always felt. */
  minStretchKeep: 0.1,
  /** A garment never hangs with zero tension. */
  drapeFloor: 0.05,
  /** Tension at the ideal ease. */
  centre: 0.4,
  /** Tension with no room at all (ease 0) where some room is ideal. */
  snugAtZero: 0.65,
  /** Bands: loose < comfortableFrom ≤ comfortable < snugFrom ≤ snug < tightFrom ≤ tight. */
  comfortableFrom: 0.2,
  snugFrom: 0.6,
  tightFrom: 0.75,
  /**
   * The body's torso is shoulder line to hip line; a top's length runs to its hem, which should
   * fall this many cm lower. Added to the body (and archetype) torso before the ease.
   */
  torsoHemDrop: 12,
  /** Fabrics stretching less than this prefer the larger size when unsure. */
  lowStretchPct: 10,
} as const;

export type FitConfig = { [K in keyof typeof FIT]: number };

export type FitClass = "top" | "outer" | "bottom" | "dress";

type Ease = { ideal: number; looseAt: number };

/** Ideal ease and loose distance in cm, per garment type and area (regular fit). */
export const EASE: Record<FitClass, Partial<Record<string, Ease>>> = {
  top: {
    chest: { ideal: 10, looseAt: 16 },
    waist: { ideal: 12, looseAt: 18 },
    hip: { ideal: 8, looseAt: 14 },
    upperArm: { ideal: 6, looseAt: 10 },
    // The shoulder seam sits on the shoulder point.
    shoulder: { ideal: 0, looseAt: 4 },
    torso: { ideal: 0, looseAt: 10 },
  },
  // Hoodies and jackets are worn over other clothes.
  outer: {
    chest: { ideal: 16, looseAt: 16 },
    waist: { ideal: 18, looseAt: 18 },
    hip: { ideal: 12, looseAt: 14 },
    upperArm: { ideal: 8, looseAt: 10 },
    shoulder: { ideal: 1, looseAt: 5 },
    torso: { ideal: 0, looseAt: 10 },
  },
  bottom: {
    waist: { ideal: 2, looseAt: 6 },
    hip: { ideal: 6, looseAt: 12 },
    thigh: { ideal: 6, looseAt: 10 },
  },
  dress: {
    chest: { ideal: 8, looseAt: 14 },
    waist: { ideal: 6, looseAt: 14 },
    hip: { ideal: 8, looseAt: 16 },
    shoulder: { ideal: 0, looseAt: 4 },
    torso: { ideal: 0, looseAt: 10 },
  },
};

export const easeFor = (cls: FitClass, region: string): Ease =>
  EASE[cls][region] ?? EASE.top[region] ?? { ideal: 4, looseAt: 10 };
