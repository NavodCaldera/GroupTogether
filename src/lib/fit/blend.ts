/**
 * Per-vertex blend weights for the fit heatmap (DEC-020), computed once when a garment loads so
 * neighbouring areas fade into each other instead of meeting as patches.
 *
 * Each vertex keeps weight 1 for its own baked `region_id`; another area r adds
 * exp(−(d / σ)²), where d is the vertex's distance beyond r's mean radius around r's centroid
 * and σ = softness × the garment's mean area radius. Weights are normalised to sum 1.
 * Neutral vertices (id 255) get no heat at all.
 *
 * Output: two vec4 attributes per vertex. `a` holds areas 0–3; `b` holds areas 4–6 and, in its
 * last component, 1 for a heat vertex or 0 for a neutral one.
 */
export const REGION_COUNT = 7;
export const NEUTRAL = 255;

export function regionWeights(
  positions: ArrayLike<number>,
  regionIds: ArrayLike<number>,
  softness = 0.8,
): { a: Float32Array; b: Float32Array } {
  const n = regionIds.length;
  const sum = new Float64Array(REGION_COUNT * 3);
  const count = new Float64Array(REGION_COUNT);
  for (let i = 0; i < n; i++) {
    const r = Math.round(regionIds[i]);
    if (r < 0 || r >= REGION_COUNT) continue;
    count[r]++;
    for (let k = 0; k < 3; k++) sum[r * 3 + k] += positions[i * 3 + k];
  }
  const centre = sum.map((v, j) => (count[Math.floor(j / 3)] ? v / count[Math.floor(j / 3)] : 0));
  const dist = (i: number, r: number) =>
    Math.hypot(
      positions[i * 3] - centre[r * 3],
      positions[i * 3 + 1] - centre[r * 3 + 1],
      positions[i * 3 + 2] - centre[r * 3 + 2],
    );
  const radius = new Float64Array(REGION_COUNT);
  for (let i = 0; i < n; i++) {
    const r = Math.round(regionIds[i]);
    if (r >= 0 && r < REGION_COUNT) radius[r] += dist(i, r) / count[r];
  }
  const present = [...count.keys()].filter((r) => count[r] > 0);
  const meanRadius = present.reduce((s, r) => s + radius[r], 0) / (present.length || 1);
  const sigma = Math.max(1e-6, softness * meanRadius);

  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  const w = new Float64Array(REGION_COUNT);
  for (let i = 0; i < n; i++) {
    const own = Math.round(regionIds[i]);
    if (own < 0 || own >= REGION_COUNT) continue;
    w.fill(0);
    let total = 0;
    for (const r of present) {
      const d = Math.max(0, dist(i, r) - radius[r]);
      w[r] = r === own ? 1 : Math.exp(-((d / sigma) ** 2));
      total += w[r];
    }
    for (let r = 0; r < REGION_COUNT; r++) {
      const v = w[r] / total;
      if (r < 4) a[i * 4 + r] = v;
      else b[i * 4 + (r - 4)] = v;
    }
    b[i * 4 + 3] = 1;
  }
  return { a, b };
}
