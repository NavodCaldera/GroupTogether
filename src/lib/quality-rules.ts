export type ReportReason = "DAMAGED" | "WRONG_ITEM" | "STITCHING" | "SIZE" | "OTHER";
export const REPORT_REASONS: ReportReason[] = [
  "DAMAGED",
  "WRONG_ITEM",
  "STITCHING",
  "SIZE",
  "OTHER",
];
export const reportRequired = (stars: number) => stars <= 2;
export const photoRequired = (reason: ReportReason) =>
  ["DAMAGED", "WRONG_ITEM", "STITCHING"].includes(reason);
export function factoryScore(
  productStars: number[],
  oldFactoryStars: number[],
): { average: number; count: number } {
  const all = [...productStars, ...oldFactoryStars];
  return {
    average: all.length ? all.reduce((s, n) => s + n, 0) / all.length : 0,
    count: all.length,
  };
}

export function productFlagged(stars: number[], reportDates: Date[], now: Date): boolean {
  const rating = stars.length >= 10 && stars.reduce((s, n) => s + n, 0) / stars.length < 3;
  const from = now.getTime() - 30 * 86400000;
  return rating || reportDates.filter((d) => d.getTime() >= from && d <= now).length >= 3;
}
export const factoryFlagged = (
  score: { average: number; count: number },
  flaggedProducts: number,
): boolean => (score.count >= 20 && score.average < 3) || flaggedProducts >= 3;
