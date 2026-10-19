import "server-only";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { notify } from "./notify";

/**
 * Review of products listed under a factory seller (`Product.sellerId`). Sellers no longer list
 * products themselves: since 2026-10-19 they send stock offers (`src/server/offers.ts`). An admin
 * can still publish or return a seller's product that is waiting for review.
 */

// ─── Admin review ─────────────────────────────────────────────────────────

/** IN_REVIEW → LIVE: on sale from now. The admin checks the stock has arrived first. */
export async function publishProduct(productId: string) {
  const r = await db.product.updateMany({
    where: { id: productId, status: "IN_REVIEW" },
    data: { status: "LIVE", reviewNote: null },
  });
  if (r.count === 0) throw new CatalogueError("This product isn't waiting for review");
  const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
  if (p.sellerId)
    await notify([p.sellerId], {
      title: "Your product is live",
      body: `${p.brand} ${p.title} is now on sale on GroupBasket.`,
      href: "/seller",
    });
}

/** IN_REVIEW → DRAFT with a note telling the seller what to fix. */
export async function returnToSeller(productId: string, note: string) {
  const reason = note.trim();
  if (reason.length < 3) throw new CatalogueError("Tell the seller what to change");
  const r = await db.product.updateMany({
    where: { id: productId, status: "IN_REVIEW" },
    data: { status: "DRAFT", reviewNote: reason },
  });
  if (r.count === 0) throw new CatalogueError("This product isn't waiting for review");
  const p = await db.product.findUniqueOrThrow({ where: { id: productId } });
  if (p.sellerId)
    await notify([p.sellerId], {
      title: "Your product needs changes",
      body: `${p.brand} ${p.title}: ${reason}`,
      href: "/seller",
    });
}
