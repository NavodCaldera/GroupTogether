import "server-only";
import { z } from "zod";
import { brandOfferTotal, linkOnSite } from "@/lib/brand-rules";
import { toD } from "@/lib/decimal";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { IMAGE_TYPES, checkUpload, saveUpload } from "./storage";
import { colomboIsoDay } from "@/lib/format";
import { saveRevision, snapshotTerms } from "./brand-reviews";
import { flushBrandNotices } from "./brand-communications";

/** Private partner offerings for direct gift fulfilment. Campaign capacity is not a payable bill. */

const validMoney = (value: string) => /^\d+(\.\d{1,2})?$/.test(value);

const money = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/,/g, ""))
    .pipe(z.string().regex(/^\d+(\.\d{1,2})?$/, message))
    .refine((v) => validMoney(v) && toD(v).gt(0) && toD(v).lt("1000000000000"), message);

const brandOfferSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the product name").max(120),
    description: z.string().trim().max(2000, "Keep the details under 2,000 characters").default(""),
    packDetails: z.string().trim().min(3, "Enter what the gift contains").max(1000),
    packSize: z.string().trim().min(1, "Enter the gift size, weight or volume").max(120),
    dispatchDays: z.coerce
      .number()
      .int("Enter whole business days")
      .min(1, "Enter at least one business day")
      .max(365, "Enter no more than 365 business days"),
    hasExpiry: z.preprocess((v) => v === true || v === "on", z.boolean()),
    expiryDate: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine(
        (value) =>
          !value ||
          (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
            !Number.isNaN(Date.parse(value + "T00:00:00Z")) &&
            new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value &&
            value > colomboIsoDay()),
        "Enter a valid future expiry date",
      ),
    minShelfLifeDays: z.preprocess(
      (v) => (v === "" || v == null ? null : v),
      z.coerce.number().int("Enter whole shelf-life days").min(1).max(3650).nullable(),
    ),
    actualPrice: money("Enter the actual price, such as 18500"),
    offerPrice: money("Enter the discount price, such as 9800"),
    pieces: z.coerce
      .number({ message: "Enter the number of pieces" })
      .int("Enter whole pieces")
      .min(1, "Enter the number of pieces")
      .max(100_000, "That's too many pieces"),
    productUrl: z.string().trim().max(500),
  })
  .refine((v) => !v.hasExpiry || !!v.expiryDate || v.minShelfLifeDays !== null, {
    message: "Enter an expiry date or minimum remaining shelf life",
    path: ["expiryDate"],
  })
  .refine(
    (v) =>
      !validMoney(v.offerPrice) ||
      !validMoney(v.actualPrice) ||
      toD(v.offerPrice).lt(toD(v.actualPrice)),
    {
      message: "The discount price must be below the actual price",
      path: ["offerPrice"],
    },
  )
  .refine(
    (v) =>
      !validMoney(v.offerPrice) ||
      !Number.isInteger(v.pieces) ||
      brandOfferTotal(v.offerPrice, v.pieces).lt("1000000000000"),
    {
      message: "Reduce the campaign quantity or partner price",
      path: ["pieces"],
    },
  );

function detailData(o: ReturnType<typeof brandOfferSchema.parse>) {
  return {
    packDetails: o.packDetails,
    packSize: o.packSize,
    dispatchDays: o.dispatchDays,
    hasExpiry: o.hasExpiry,
    expiryDate: o.hasExpiry && o.expiryDate ? new Date(o.expiryDate + "T00:00:00Z") : null,
    minShelfLifeDays: o.hasExpiry ? o.minShelfLifeDays : null,
  };
}

export async function createBrandOffer(
  sellerId: string,
  input: unknown,
  photo: File | null = null,
) {
  const o = brandOfferSchema.parse(input);
  const brand = await db.user.findUnique({
    where: { id: sellerId },
    select: { role: true, isBrand: true, locked: true, name: true, company: true, website: true },
  });
  if (brand?.role !== "SELLER" || !brand.isBrand || brand.locked)
    throw new CatalogueError("Only luxury brands can publish discounted products");
  if (!brand.website || !linkOnSite(o.productUrl, brand.website))
    throw new CatalogueError(
      brand.website
        ? `Link to the product on ${brand.website} (https://…)`
        : "Enter the product's link on your website (https://…)",
    );
  checkUpload(photo, IMAGE_TYPES, "gift photo");
  const saved = await saveUpload(photo!, "brand-gifts", IMAGE_TYPES);
  const offer = await db.$transaction(async (tx) => {
    const created = await tx.stockOffer.create({
      data: {
        sellerId,
        kind: "BULK",
        name: o.name,
        description: o.description,
        ...detailData(o),
        photoKey: saved.storageKey,
        photoType: saved.contentType,
        actualPrice: o.actualPrice,
        offerPrice: o.offerPrice,
        pieces: o.pieces,
        productUrl: o.productUrl,
        amount: brandOfferTotal(o.offerPrice, o.pieces).toString(),
      },
    });
    await saveRevision(tx, created, sellerId, "Revision 1 submitted for review.");
    return created;
  });
  await flushBrandNotices().catch(() => {});
  return offer;
}

export async function reviseBrandOffer(
  sellerId: string,
  offerId: string,
  input: unknown,
  photo: File | null = null,
  expectedRevision?: number,
) {
  const o = brandOfferSchema.parse(input);
  const brand = await db.user.findFirst({
    where: { id: sellerId, role: "SELLER", isBrand: true, locked: false },
  });
  if (!brand) throw new CatalogueError("Only premium brands can revise gift products");
  if (!brand.website || !linkOnSite(o.productUrl, brand.website))
    throw new CatalogueError("Use a product link on your brand website");
  const existing = await db.stockOffer.findFirst({
    where: { id: offerId, sellerId },
    include: { revisions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!existing) throw new CatalogueError("Gift product not found");
  const previous = existing.revisions[0] ? snapshotTerms(existing.revisions[0].snapshot) : existing;
  let image: { photoKey: string; photoType: string } | undefined;
  if (photo?.size || !previous.photoKey) {
    checkUpload(photo, IMAGE_TYPES, "gift photo");
    const saved = await saveUpload(photo!, "brand-gifts", IMAGE_TYPES);
    image = { photoKey: saved.storageKey, photoType: saved.contentType };
  }
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "StockOffer" WHERE id=${offerId} FOR UPDATE`;
    const current = await tx.stockOffer.findUniqueOrThrow({ where: { id: offerId } });
    if (current.revision !== (expectedRevision ?? existing.revision))
      throw new CatalogueError("The product changed. Refresh before resubmitting.");
    const proposal = {
      ...o,
      ...detailData(o),
      photoKey: image?.photoKey ?? previous.photoKey,
      photoType: image?.photoType ?? previous.photoType,
      amount: brandOfferTotal(o.offerPrice, o.pieces).toString(),
    };
    const version = current.revision + 1;
    await saveRevision(
      tx,
      { ...proposal, id: offerId, sellerId, revision: version, expiryDate: proposal.expiryDate },
      sellerId,
      `Revision ${version} submitted for review. Existing approved gift terms remain in force until approval.`,
    );
    await tx.stockOffer.update({
      where: { id: offerId },
      data: {
        revision: version,
        ...(!current.approvedRevision && current.status !== "ACCEPTED"
          ? { ...proposal, status: "IN_REVIEW", decidedAt: null }
          : {}),
      },
    });
  });
  await flushBrandNotices().catch(() => {});
}
