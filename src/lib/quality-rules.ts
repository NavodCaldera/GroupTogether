/**
 * Factory-fault return and quality report reasons. The general ones apply to every product; the
 * clothing ones only where the category lists them in `Category.returnReasons` (DEC-029).
 */
export const GENERAL_REPORT_REASONS = [
  "DAMAGED",
  "WRONG_ITEM",
  "NOT_AS_DESCRIBED",
  "MISSING_PARTS",
  "EXPIRED",
] as const;
export const CATEGORY_REPORT_REASONS = ["STITCHING", "SIZE"] as const;
export type ReportReason =
  (typeof GENERAL_REPORT_REASONS)[number] | (typeof CATEGORY_REPORT_REASONS)[number] | "OTHER";
/** Every value, in form order. */
export const REPORT_REASONS: ReportReason[] = [
  ...GENERAL_REPORT_REASONS,
  ...CATEGORY_REPORT_REASONS,
  "OTHER",
];
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  NOT_AS_DESCRIBED: "Not as described",
  MISSING_PARTS: "Missing parts",
  EXPIRED: "Expired",
  STITCHING: "Stitching",
  SIZE: "Size",
  OTHER: "Other",
};
/** The report reasons offered for a category whose resolved return reasons are `listed`. */
export const reportReasonsFor = (listed: readonly string[]): ReportReason[] =>
  REPORT_REASONS.filter(
    (r) => !(CATEGORY_REPORT_REASONS as readonly string[]).includes(r) || listed.includes(r),
  );
export const reportRequired = (stars: number) => stars <= 2;
export const photoRequired = (reason: ReportReason) =>
  ["DAMAGED", "WRONG_ITEM", "STITCHING", "MISSING_PARTS", "EXPIRED"].includes(reason);
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
