import "server-only";
import { db } from "./db";

/** Private offer images: admin, supplying brand, or that gift's recipient only. */
export async function brandPhotoFor(
  user: { id: string; role: string } | null,
  offerId: string,
  revision?: number,
) {
  if (!user) return null;
  // Re-read admin scope: callers may supply only the historical id/role shape.
  if (
    user.role === "ADMIN" &&
    !(await db.user.count({
      where: { id: user.id, role: "ADMIN", adminArea: "PREMIUM", locked: false },
    }))
  )
    return null;
  if (revision !== undefined) {
    if (
      !Number.isInteger(revision) ||
      revision < 1 ||
      (user.role !== "ADMIN" && user.role !== "SELLER")
    )
      return null;
    const entry = await db.brandOfferRevision.findFirst({
      where: {
        offerId,
        version: revision,
        offer: {
          seller: { isBrand: true },
          ...(user.role === "ADMIN" ? {} : { sellerId: user.id }),
        },
      },
    });
    if (!entry) return null;
    const data = entry.snapshot as Record<string, unknown>;
    return {
      photoKey: typeof data.photoKey === "string" ? data.photoKey : null,
      photoType: typeof data.photoType === "string" ? data.photoType : null,
    };
  }
  return db.stockOffer.findFirst({
    where: {
      id: offerId,
      seller: { isBrand: true },
      ...(user.role === "ADMIN"
        ? {}
        : user.role === "SELLER"
          ? { sellerId: user.id }
          : user.role === "CUSTOMER"
            ? { gifts: { some: { recipientId: user.id, status: { not: "CANCELLED" } } } }
            : { id: "" }),
    },
    select: { photoKey: true, photoType: true },
  });
}
