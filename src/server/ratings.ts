import "server-only";
import { CartError } from "./carts/errors";
import { withCartTransaction } from "./carts/locks";
import {
  photoRequired,
  reportRequired,
  REPORT_REASONS,
  type ReportReason,
} from "@/lib/quality-rules";
import { checkUpload, saveUpload, IMAGE_TYPES } from "./storage";
import { db } from "./db";

/**
 * Factory ratings (product owner, 2026-11-03): each member of a delivered cart rates the factory
 * that packed and shipped it, 1–5 stars, once. Products show the factory's average and count.
 */
export type RatingSummary = { average: number; count: number };

/** Averages for these factories, one grouped query; factories with no ratings are left out. */
export async function ratingSummaries(factoryIds: (string | null)[]) {
  const ids = [...new Set(factoryIds.filter((x): x is string => !!x))];
  const rows = ids.length
    ? await db.factoryRating.groupBy({
        by: ["factoryId"],
        where: { factoryId: { in: ids } },
        _avg: { stars: true },
        _count: true,
      })
    : [];
  const products = await db.product.findMany({
    where: { sellerId: { in: ids } },
    select: { sellerId: true, productRatings: { select: { stars: true } } },
  });
  const combined = new Map<string, { sum: number; count: number }>();
  for (const r of rows)
    combined.set(r.factoryId, { sum: (r._avg.stars ?? 0) * r._count, count: r._count });
  for (const p of products) {
    if (!p.sellerId) continue;
    const score = combined.get(p.sellerId) ?? { sum: 0, count: 0 };
    for (const r of p.productRatings) {
      score.sum += r.stars;
      score.count++;
    }
    if (score.count) combined.set(p.sellerId, score);
  }
  return new Map<string, RatingSummary>(
    [...combined].map(([id, r]) => [id, { average: r.sum / r.count, count: r.count }]),
  );
}

/** The member's own rating of this cart, if any. */
export const myRating = (userId: string, cartId: string) =>
  db.factoryRating.findUnique({ where: { cartId_userId: { cartId, userId } } });

export async function rateProduct(
  userId: string,
  cartId: string,
  productId: string,
  stars: number,
  report?: { reason: ReportReason; note: string; photos: File[] },
): Promise<void> {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    throw new CartError("Choose 1 to 5 stars");
  if (reportRequired(stars) && !report) throw new CartError("A low rating needs a report");
  if (
    report &&
    (!REPORT_REASONS.includes(report.reason) ||
      report.note.length > 2000 ||
      report.photos.length > 5)
  )
    throw new CartError("Check the report and use at most five photos");
  if (report && photoRequired(report.reason) && !report.photos.length)
    throw new CartError("Add at least one report photo");
  for (const file of report?.photos ?? []) checkUpload(file, IMAGE_TYPES, "report photo");
  const eligible = async (client: import("./db").Tx) => {
    if (
      !(await client.user.count({ where: { id: userId, role: "CUSTOMER", locked: false } })) ||
      !(await client.cartLine.count({
        where: {
          cartId,
          userId,
          status: { in: ["ACTIVE", "RETURNED"] },
          variant: { productId },
          cart: { status: "DELIVERED" },
        },
      }))
    )
      throw new CartError("Rate only products you received in a delivered order");
    if (await client.productRating.count({ where: { cartId, userId, productId } }))
      throw new CartError("You've already rated this product in this order");
  };
  await eligible(db);
  await withCartTransaction([cartId], [userId], async (tx) => {
    await eligible(tx);
    const photos = [];
    for (const file of report?.photos ?? [])
      photos.push(await saveUpload(file, "report-photos", IMAGE_TYPES));
    await tx.productRating.create({
      data: {
        cartId,
        userId,
        productId,
        stars,
        ...(report
          ? {
              report: {
                create: {
                  reason: report.reason,
                  note: report.note.trim(),
                  photos: { create: photos },
                },
              },
            }
          : {}),
      },
    });
  });
}
export async function productRatingSummaries(productIds: string[]) {
  const rows = await db.productRating.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _avg: { stars: true },
    _count: true,
  });
  return new Map(rows.map((r) => [r.productId, { average: r._avg.stars ?? 0, count: r._count }]));
}
