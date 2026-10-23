import "server-only";
import type { Tx } from "./db";

/**
 * Shop price history (product owner, 2026-10-24): the seller dashboard charts each design's price
 * against the pieces sold. Adds a row for each product whose price differs from its last one;
 * call it after anything that changes `Product.price` (saving a product, a lot's price, the lot
 * price drop).
 */
export async function logPrices(tx: Tx, productIds: string[], at = new Date()) {
  if (productIds.length === 0) return;
  await tx.$executeRaw`
    INSERT INTO "PriceChange" ("id", "productId", "price", "at")
    SELECT 'pc_' || md5(random()::text || p."id"), p."id", p."price", ${at}
    FROM "Product" p
    WHERE p."id" = ANY(${productIds})
      AND p."price" IS DISTINCT FROM (
        SELECT pc."price" FROM "PriceChange" pc
        WHERE pc."productId" = p."id" ORDER BY pc."at" DESC LIMIT 1
      )`;
}
