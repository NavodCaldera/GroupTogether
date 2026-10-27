import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { CatalogueError } from "./catalogue";
import { communicationActor, appendBrandEvent, flushBrandNotices } from "./brand-communications";
import { toD } from "@/lib/decimal";

type OfferTerms = {
  name: string;
  description: string;
  actualPrice: { toString(): string } | null;
  offerPrice: { toString(): string } | null;
  pieces: number | null;
  productUrl: string | null;
  photoKey: string | null;
  photoType: string | null;
  packDetails: string | null;
  packSize: string | null;
  dispatchDays: number | null;
  hasExpiry: boolean;
  expiryDate: Date | null;
  minShelfLifeDays: number | null;
};
export function offerSnapshot(offer: OfferTerms): Prisma.InputJsonObject {
  return {
    name: offer.name,
    description: offer.description,
    actualPrice: offer.actualPrice?.toString() ?? null,
    offerPrice: offer.offerPrice?.toString() ?? null,
    pieces: offer.pieces,
    productUrl: offer.productUrl,
    photoKey: offer.photoKey,
    photoType: offer.photoType,
    packDetails: offer.packDetails,
    packSize: offer.packSize,
    dispatchDays: offer.dispatchDays,
    hasExpiry: offer.hasExpiry,
    expiryDate: offer.expiryDate?.toISOString() ?? null,
    minShelfLifeDays: offer.minShelfLifeDays,
  };
}
export type Snapshot = ReturnType<typeof snapshotTerms>;
export function snapshotTerms(input: Prisma.JsonValue) {
  const value = input as Record<string, unknown>;
  const str = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : null);
  const num = (key: string) => (typeof value[key] === "number" ? (value[key] as number) : null);
  return {
    name: str("name") ?? "Gift product",
    description: str("description") ?? "",
    actualPrice: str("actualPrice"),
    offerPrice: str("offerPrice"),
    pieces: num("pieces"),
    productUrl: str("productUrl"),
    photoKey: str("photoKey"),
    photoType: str("photoType"),
    packDetails: str("packDetails"),
    packSize: str("packSize"),
    dispatchDays: num("dispatchDays"),
    hasExpiry: value.hasExpiry === true,
    expiryDate: str("expiryDate") ? new Date(str("expiryDate")!) : null,
    minShelfLifeDays: num("minShelfLifeDays"),
  };
}

export async function saveRevision(
  tx: Tx,
  offer: OfferTerms & { id: string; sellerId: string; revision: number },
  authorId: string,
  body: string,
) {
  await tx.brandOfferRevision.updateMany({
    where: { offerId: offer.id, status: "IN_REVIEW", supersededAt: null },
    data: { supersededAt: new Date() },
  });
  await tx.brandOfferRevision.create({
    data: {
      offerId: offer.id,
      version: offer.revision,
      snapshot: offerSnapshot(offer),
      submittedById: authorId,
    },
  });
  const event = await appendBrandEvent(tx, {
    brandId: offer.sellerId,
    kind: "PRODUCT",
    subjectId: offer.id,
    title: offer.name,
    authorId,
    body,
    requestKey: `offer-submission:${offer.id}:${offer.revision}`,
  });
  await tx.brandConversation.update({
    where: { id: event.conversationId },
    data: { lastHumanSide: "BRAND", resolved: false },
  });
}

export async function reviewBrandOffer(
  adminId: string,
  offerId: string,
  version: number,
  decision: string,
  note: string,
) {
  const actor = await communicationActor(adminId);
  if (actor.role !== "ADMIN") throw new CatalogueError("Only admins can review products");
  if (!["approve", "changes", "decline"].includes(decision) || !Number.isInteger(version))
    throw new CatalogueError("Choose a review decision");
  const text = note.trim();
  if (text.length > 2000 || (decision !== "approve" && text.length < 3))
    throw new CatalogueError("Explain the changes or reason for declining");
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM "StockOffer" WHERE id=${offerId} FOR UPDATE`;
    const offer = await tx.stockOffer.findFirst({
      where: { id: offerId, seller: { isBrand: true } },
    });
    const revision = await tx.brandOfferRevision.findUnique({
      where: { offerId_version: { offerId, version } },
    });
    if (!offer || !revision || offer.revision !== version || revision.status !== "IN_REVIEW")
      throw new CatalogueError(
        "This submission has changed or was already reviewed. Refresh before deciding.",
      );
    const terms = snapshotTerms(revision.snapshot);
    const status =
      decision === "approve"
        ? "ACCEPTED"
        : decision === "changes"
          ? "CHANGES_REQUESTED"
          : "DECLINED";
    await tx.brandOfferRevision.update({
      where: { id: revision.id },
      data: { status, reviewedById: adminId, reviewedAt: new Date() },
    });
    const base = { note: text || null, decidedAt: new Date() };
    if (decision === "approve") {
      if (!terms.offerPrice || !terms.actualPrice || terms.pieces === null)
        throw new CatalogueError("The submission is missing pricing or quantity");
      const allocated = await tx.giftOrder.count({
        where: { offerId, status: { not: "CANCELLED" } },
      });
      // Availability can change during review: preserve the brand's live campaign quantity.
      const pieces = offer.approvedRevision ? (offer.pieces ?? terms.pieces) : terms.pieces;
      if (pieces < allocated)
        throw new CatalogueError("Quantity is below existing gift allocations");
      const amount = toD(terms.offerPrice).times(pieces);
      if (amount.gte("1000000000000"))
        throw new CatalogueError(
          "Reduce the campaign quantity or proposed partner price before approval",
        );
      await tx.stockOffer.update({
        where: { id: offerId },
        data: {
          ...terms,
          actualPrice: terms.actualPrice,
          offerPrice: terms.offerPrice,
          pieces,
          amount: amount.toString(),
          status,
          approvedRevision: version,
          ...base,
        },
      });
    } else
      await tx.stockOffer.update({
        where: { id: offerId },
        data: { ...base, ...(!offer.approvedRevision ? { status } : {}) },
      });
    const event = await appendBrandEvent(tx, {
      brandId: offer.sellerId,
      kind: "PRODUCT",
      subjectId: offerId,
      title: terms.name,
      authorId: adminId,
      body: `Revision ${version} ${decision === "approve" ? "approved" : decision === "changes" ? "needs changes" : "declined"}.${text ? ` ${text}` : ""}`,
      requestKey: `offer-review:${offerId}:${version}`,
    });
    await tx.brandConversation.update({
      where: { id: event.conversationId },
      data: { lastHumanSide: decision === "changes" ? "ADMIN" : null },
    });
    return offer.sellerId;
  });
  await flushBrandNotices().catch(() => {});
  return result;
}
