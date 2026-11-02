import "server-only";
import { CartError } from "./carts/service";
import { db } from "./db";

/**
 * Factory ratings (product owner, 2026-11-03): each member of a delivered cart rates the factory
 * that packed and shipped it, 1–5 stars, once. Products show the factory's average and count.
 */
export type RatingSummary = { average: number; count: number };

export async function rateFactory(userId: string, cartId: string, stars: number) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    throw new CartError("Choose 1 to 5 stars");
  const cart = await db.groupCart.findFirst({
    where: { id: cartId, status: "DELIVERED", members: { some: { userId } } },
    select: {
      lines: {
        select: { variant: { select: { product: { select: { sellerId: true } } } } },
        take: 1,
      },
    },
  });
  if (!cart) throw new CartError("You can rate the factory once your group order is delivered");
  const factoryId = cart.lines[0]?.variant.product.sellerId;
  if (!factoryId) throw new CartError("This order didn't come from a factory");
  if (await db.factoryRating.count({ where: { cartId, userId } }))
    throw new CartError("You've already rated this order");
  return db.factoryRating.create({ data: { cartId, userId, factoryId, stars } });
}

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
  return new Map<string, RatingSummary>(
    rows.map((r) => [r.factoryId, { average: r._avg.stars ?? 0, count: r._count }]),
  );
}

/** The member's own rating of this cart, if any. */
export const myRating = (userId: string, cartId: string) =>
  db.factoryRating.findUnique({ where: { cartId_userId: { cartId, userId } } });
