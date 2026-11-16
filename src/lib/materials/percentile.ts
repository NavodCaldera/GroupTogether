/**
 * Measured path (DEC-022): a value's position among the reference swatch set, by percentile
 * rank of its log. Mid-rank for ties, so a value equal to every swatch sits at 50.
 * Returns null when the set is too small: the axis then falls back to the estimate.
 */
export function logPercentile(
  value: number,
  reference: number[],
  minSwatches: number,
): number | null {
  const ref = reference.filter((v) => Number.isFinite(v) && v > 0);
  if (!(value > 0) || ref.length < minSwatches) return null;
  const x = Math.log(value);
  const logs = ref.map(Math.log);
  const below = logs.filter((v) => v < x).length;
  const equal = logs.filter((v) => v === x).length;
  const pct = ((below + equal / 2) / logs.length) * 100;
  return Math.round(pct * 10) / 10;
}
