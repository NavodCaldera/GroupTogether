/**
 * Fit heatmap constants (DEC-020). Starting values, to be calibrated from "How did it fit?"
 * feedback (`FitFeedback`). Tension is 0 (slack) to 1 (tight).
 *
 * Per area, with ease = garment cm − body cm:
 *
 *   deficit            = max(0, −ease)
 *   stretchRelief      = max(minStretchKeep, 1 − stretchFactor × stretchPct / 100)   (lengths: 1)
 *   effectiveDeficit   = deficit × stretchRelief
 *   shift(ease)        = k × effectiveDeficit − k2 × max(0, ease)
 *
 *   with a simulation:  tension = clamp(base + shift(buyer ease) − shift(archetype ease), drapeFloor, 1)
 *   without one:        tension = clamp(neutral + shift(buyer ease), drapeFloor, 1)
 *
 * The simulation's base tension already reflects the archetype's own ease, so only the
 * difference between the buyer and the archetype is added; a buyer measuring exactly like the
 * archetype sees the simulated tension unchanged.
 */
export const FIT = {
  /** Tension added per cm the garment is smaller than the body. */
  k: 0.08,
  /** Tension removed per cm of room. */
  k2: 0.03,
  /** Each stretch percent removes this many percent of the deficit… */
  stretchFactor: 2.5,
  /** …but at least this share of it is always felt. */
  minStretchKeep: 0.1,
  /** A garment never hangs with zero tension. */
  drapeFloor: 0.05,
  /** Tension at zero ease when there is no simulation for the product. */
  neutral: 0.6,
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
