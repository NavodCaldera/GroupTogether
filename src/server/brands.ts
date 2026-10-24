import "server-only";
import { z } from "zod";
import { brandOfferTotal, linkOnSite } from "@/lib/brand-rules";
import { toD } from "@/lib/decimal";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { notifyRole } from "./notify";

/**
 * Luxury brands (product owner, 2026-10-24). A brand is a seller account marked `isBrand`, with its
 * website. On its profile page it publishes each discounted product: name, details, its actual
 * price, the discount price a piece we buy at, the pieces, and the product's page on its own
 * website showing the actual price. An admin reviews it like any stock offer; once we list it,
 * our shop shows the actual price with that link. Rules: `src/lib/brand-rules.ts`.
 */

const money = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, message))
    .refine((v) => Number(v) > 0, message);

export const brandOfferSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the product name").max(120),
    description: z
      .string()
      .trim()
      .min(3, "Add some details about the product")
      .max(2000, "Keep the details under 2,000 characters"),
    actualPrice: money("Enter the actual price, such as 18500"),
    offerPrice: money("Enter the discount price, such as 9800"),
    pieces: z.coerce
      .number({ message: "Enter the number of pieces" })
      .int("Enter whole pieces")
      .min(1, "Enter the number of pieces")
      .max(100_000, "That's too many pieces"),
    productUrl: z.string().trim().max(500),
  })
  .refine((v) => toD(v.offerPrice).lt(toD(v.actualPrice)), {
    message: "The discount price must be below the actual price",
    path: ["offerPrice"],
  });

export async function createBrandOffer(sellerId: string, input: unknown) {
  const o = brandOfferSchema.parse(input);
  const brand = await db.user.findUnique({
    where: { id: sellerId },
    select: { role: true, isBrand: true, name: true, company: true, website: true },
  });
  if (brand?.role !== "SELLER" || !brand.isBrand)
    throw new CatalogueError("Only luxury brands can publish discounted products");
  if (!linkOnSite(o.productUrl, brand.website))
    throw new CatalogueError(
      brand.website
        ? `Link to the product on ${brand.website} (https://…)`
        : "Enter the product's link on your website (https://…)",
    );
  const offer = await db.stockOffer.create({
    data: {
      sellerId,
      kind: "BULK",
      name: o.name,
      description: o.description,
      actualPrice: o.actualPrice,
      offerPrice: o.offerPrice,
      pieces: o.pieces,
      productUrl: o.productUrl,
      amount: brandOfferTotal(o.offerPrice, o.pieces).toString(),
    },
  });
  await notifyRole("ADMIN", {
    title: "Brand product to review",
    body: `${brand.company || brand.name}: ${o.name}`,
    href: `/admin/offers/${offer.id}`,
  });
  return offer;
}
