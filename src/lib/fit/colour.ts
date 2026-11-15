/**
 * The fit heatmap's continuous colour ramp (DEC-020): green 0 → yellow 0.5 → orange 0.75 →
 * deep red 1. The viewer's shader repeats these stops (`RAMP_GLSL`); keep them identical.
 */

export const STOPS: [number, [number, number, number]][] = [
  [0, [0.13, 0.62, 0.32]],
  [0.5, [0.96, 0.8, 0.18]],
  [0.75, [0.95, 0.48, 0.1]],
  [1, [0.6, 0.04, 0.07]],
];

export function rampRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    const [t0, c0] = STOPS[i - 1];
    if (x <= t1) {
      const f = (x - t0) / (t1 - t0);
      return [0, 1, 2].map((k) => c0[k] + (c1[k] - c0[k]) * f) as [number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Unsure areas: blended toward grey so they read as softer. */
export function heatCss(t: number, unsure = false) {
  const [r, g, b] = rampRgb(t).map((v) => (unsure ? v * 0.55 + 0.62 * 0.45 : v));
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}

/** CSS gradient of the whole ramp, for the legend. */
export const RAMP_CSS = `linear-gradient(to right, ${STOPS.map(([t, c]) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")}) ${t * 100}%`).join(", ")})`;

const f = (v: number) => v.toFixed(3);
export const RAMP_GLSL = `
vec3 fitRamp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(${STOPS[0][1].map(f).join(", ")});
  vec3 c1 = vec3(${STOPS[1][1].map(f).join(", ")});
  vec3 c2 = vec3(${STOPS[2][1].map(f).join(", ")});
  vec3 c3 = vec3(${STOPS[3][1].map(f).join(", ")});
  if (t < ${f(STOPS[1][0])}) return mix(c0, c1, t / ${f(STOPS[1][0])});
  if (t < ${f(STOPS[2][0])}) return mix(c1, c2, (t - ${f(STOPS[1][0])}) / ${f(STOPS[2][0] - STOPS[1][0])});
  return mix(c2, c3, (t - ${f(STOPS[2][0])}) / ${f(STOPS[3][0] - STOPS[2][0])});
}
`;

/** Value the shader and card show for an area: the midpoint of the interval when unsure. */
export const shownTension = (r: {
  tension: number;
  tensionLow: number;
  tensionHigh: number;
  uncertain: boolean;
}) => (r.uncertain ? (r.tensionLow + r.tensionHigh) / 2 : r.tension);
