import "server-only";
import { db } from "./db";

/**
 * Receiving sellers' stock in our store (product owner, 2026-10-20). Once an admin accepts a
 * stock offer it shows under "To receive". Packing staff left with the area-agent model, so no
 * one marks it received any more; Task 18 removes stock offers. No amounts here.
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
