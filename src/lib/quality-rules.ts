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
