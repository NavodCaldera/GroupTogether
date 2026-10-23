import "server-only";
import { z } from "zod";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { notify, notifyRole } from "./notify";

/**
 * Factory sellers' stock offers (product owner, 2026-10-19). A seller sends a name, details about
 * the stock and the total price for all of it; an admin accepts or declines it, and the seller is
 * told in the app. An offer is not a shop product: if we take the stock, the admin lists it.
 * An offer is a few test pieces of a design or a bulk (2026-10-24); a bulk of a design the
 * factory already tested names that design, and its pieces go onto the same product.
 */

export const offerSchema = z.object({
  name: z.string().trim().min(2, "Enter the product name").max(120),
  description: z
    .string()
    .trim()
    .min(3, "Add some details about the stock")
    .max(2000, "Keep the details under 2,000 characters"),
  amount: z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter the total price, such as 250000"))
    .refine((v) => Number(v) > 0, "Enter the total price, such as 250000"),
  kind: z.enum(["TEST", "BULK"], { message: "Choose test pieces or bulk" }).default("BULK"),
  /** A bulk of one of the factory's designs: that shop product */
  productId: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
});

export async function createOffer(sellerId: string, input: unknown) {
  const o = offerSchema.parse(input);
  const seller = await db.user.findUnique({
    where: { id: sellerId },
    select: { role: true, name: true, company: true },
  });
  if (seller?.role !== "SELLER") throw new CatalogueError("Only factory sellers can send offers");
  if (o.productId) {
    if (o.kind !== "BULK") throw new CatalogueError("Test pieces are for a new design");
    const mine = await db.product.count({ where: { id: o.productId, sellerId } });
    if (!mine) throw new CatalogueError("Choose one of your designs");
  }
  const offer = await db.stockOffer.create({ data: { sellerId, ...o } });
  await notifyRole("ADMIN", {
    title: "Stock offer to review",
    body: `${seller.company || seller.name}: ${o.name}`,
    href: `/admin/offers/${offer.id}`,
  });
  return offer;
}

/** IN_REVIEW → ACCEPTED or DECLINED, once. Tells the seller, with the admin's note if any. */
export async function decideOffer(id: string, accept: boolean, note: string) {
  const text = note.trim().slice(0, 500) || null;
  const r = await db.stockOffer.updateMany({
    where: { id, status: "IN_REVIEW" },
    data: { status: accept ? "ACCEPTED" : "DECLINED", note: text, decidedAt: new Date() },
  });
  if (r.count === 0) throw new CatalogueError("This offer has already been answered");
  const o = await db.stockOffer.findUniqueOrThrow({ where: { id } });
  await notify([o.sellerId], {
    title: accept ? "Your offer was accepted" : "Your offer was declined",
    body: text ? `${o.name}: ${text}` : o.name,
    href: "/seller",
  });
}
