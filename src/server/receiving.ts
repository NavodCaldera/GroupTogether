import "server-only";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { notify, notifyRole } from "./notify";

/**
 * Receiving sellers' stock in our store (product owner, 2026-10-20). Once an admin accepts a
 * stock offer it shows on the packing list under "To receive"; one of the packing staff presses
 * "Received" when the stock arrives. Packing staff never see money, so no amounts here.
 */

const seller = { select: { company: true, name: true, phone: true, address: true, city: true } };

/** Accepted offers whose stock hasn't arrived yet, oldest acceptance first. */
export function stockToReceive() {
  return db.stockOffer.findMany({
    where: { status: "ACCEPTED", receivedAt: null, seller: { isBrand: false } },
    orderBy: { decidedAt: "asc" },
    select: { id: true, name: true, decidedAt: true, seller },
  });
}

/** One accepted offer for the packing staff: what it is and who sends it. No amount. */
export function stockForPacker(id: string) {
  return db.stockOffer.findFirst({
    where: { id, status: "ACCEPTED", seller: { isBrand: false } },
    select: {
      id: true,
      name: true,
      description: true,
      note: true,
      decidedAt: true,
      receivedAt: true,
      receivedBy: { select: { name: true } },
      seller,
    },
  });
}

/** Records who received the stock and when (once); tells the seller and the admins. */
export async function receiveStock(staffId: string, offerId: string) {
  const r = await db.stockOffer.updateMany({
    where: { id: offerId, status: "ACCEPTED", receivedAt: null, seller: { isBrand: false } },
    data: { receivedById: staffId, receivedAt: new Date() },
  });
  if (r.count === 0) throw new CatalogueError("This stock has already been received");
  const o = await db.stockOffer.findUniqueOrThrow({
    where: { id: offerId },
    select: { name: true, sellerId: true, receivedBy: { select: { name: true } } },
  });
  await Promise.all([
    notify([o.sellerId], {
      title: "We received your stock",
      body: o.name,
      href: "/seller",
    }),
    notifyRole("ADMIN", {
      title: "Stock received",
      body: `${o.name}, by ${o.receivedBy?.name ?? "packing staff"}`,
      href: `/admin/offers/${offerId}`,
    }),
  ]);
}
