/**
 * Per-vertex blend weights for the fit heatmap (DEC-020), computed once when a garment loads so
 * neighbouring areas fade into each other instead of meeting as patches.
 *
 * Each vertex keeps weight 1 for its own baked `region_id`; another area r adds
 * exp(−(d / σ)²), where d is the distance to the nearest vertex of r (sampled: at most
 * `SAMPLES` per area, so large meshes stay quick) and σ = softness × the garment's diagonal.
 * The fade therefore reaches a few centimetres either side of a seam whatever the area's
 * shape. Weights are normalised to sum 1. Neutral vertices (id 255) get no heat at all.
 *
 * Output: two vec4 attributes per vertex. `a` holds areas 0–3; `b` holds areas 4–6 and, in its
 * last component, 1 for a heat vertex or 0 for a neutral one.
 */
export const REGION_COUNT = 7;
export const NEUTRAL = 255;
const SAMPLES = 256;

export function regionWeights(
  positions: ArrayLike<number>,
  regionIds: ArrayLike<number>,
  softness = 0.03,
): { a: Float32Array; b: Float32Array } {
  const n = regionIds.length;
  const members: number[][] = Array.from({ length: REGION_COUNT }, () => []);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < n; i++) {
    const r = Math.round(regionIds[i]);
    if (r < 0 || r >= REGION_COUNT) continue;
    members[r].push(i);
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], positions[i * 3 + k]);
      hi[k] = Math.max(hi[k], positions[i * 3 + k]);
    }
  }
  const diagonal = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1;
  const sigma2 = (softness * diagonal) ** 2;
  // An even spread of each area's vertices to measure distances against.
  const samples = members.map((m) => {
    const step = Math.max(1, Math.ceil(m.length / SAMPLES));
    return m.filter((_, j) => j % step === 0);
  });

  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  const w = new Float64Array(REGION_COUNT);
  for (let i = 0; i < n; i++) {
    const own = Math.round(regionIds[i]);
    if (own < 0 || own >= REGION_COUNT) continue;
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    let total = 0;
    for (let r = 0; r < REGION_COUNT; r++) {
      if (r === own) {
        w[r] = 1;
      } else {
        let best = Infinity;
        for (const j of samples[r]) {
          const dx = positions[j * 3] - x;
          const dy = positions[j * 3 + 1] - y;
          const dz = positions[j * 3 + 2] - z;
          best = Math.min(best, dx * dx + dy * dy + dz * dz);
        }
        w[r] = best === Infinity ? 0 : Math.exp(-best / sigma2);
      }
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
