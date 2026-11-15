import type { Landmark } from "../types";

/** Ramanujan's approximation of an ellipse perimeter from its semi-axes. */
export function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

export function distance(p: { x: number; y: number }, q: { x: number; y: number }): number {
  return Math.hypot(p.x - q.x, p.y - q.y);
}

export function midpoint(p: Landmark, q: Landmark): Landmark {
  return {
    x: (p.x + q.x) / 2,
    y: (p.y + q.y) / 2,
    visibility: Math.min(p.visibility, q.visibility),
  };
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Standard normal CDF (Abramowitz and Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

/** P(lo <= X <= hi) for X ~ N(mean, sd). */
export function probBetween(mean: number, sd: number, lo: number, hi: number): number {
  if (sd <= 0) return mean >= lo && mean <= hi ? 1 : 0;
  return normalCdf((hi - mean) / sd) - normalCdf((lo - mean) / sd);
}
