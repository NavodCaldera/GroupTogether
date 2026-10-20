import type { CartStatus } from "./cart-rules";

/**
 * Packing in our store, with no database (CLAUDE.md rule 17, product owner 2026-10-19).
 * Two steps by two different people: one checks every item and gathers it all together, then
 * someone else rechecks it and packs it. Only then is it handed to the PickMe driver.
 */

/** Paid carts not yet delivered: the ones the packing staff work on. */
export const PACKABLE: readonly CartStatus[] = ["CONFIRMED", "DISPATCHED"];

/** PickMe states in which the parcel can still be handed to the driver. */
export const HANDOVER_DELIVERY: readonly string[] = ["BOOKED", "PICKED_UP"];

export type PackingStage = "to-gather" | "to-pack" | "ready" | "handed-over";

export const PACKING_STAGE_LABEL: Record<PackingStage, string> = {
  "to-gather": "To gather",
  "to-pack": "To pack",
  ready: "For PickMe",
  "handed-over": "Handed over",
};

export type PackingLike = {
  gatheredById: string;
  packedById: string | null;
  handedOverAt: Date | null;
} | null;

export function packingStage(p: PackingLike): PackingStage {
  if (!p) return "to-gather";
  if (p.handedOverAt) return "handed-over";
  return p.packedById ? "ready" : "to-pack";
}

/** Why `userId` can't recheck and pack this order now, or null if they can. */
export function packBlockReason(p: PackingLike, userId: string): string | null {
  if (!p) return "Check and gather it first";
  if (p.handedOverAt) return "This order has already gone to PickMe";
  if (p.packedById) return "Already packed";
  if (p.gatheredById === userId) return "You gathered it, so someone else packs it";
  return null;
}

/** Why the parcel can't be handed to the PickMe driver yet, or null if it can. */
export function handOverBlockReason(
  p: PackingLike,
  delivery: { status: string } | null,
): string | null {
  if (!p) return "Check and gather it first";
  if (p.handedOverAt) return "This order has already gone to PickMe";
  if (!p.packedById) return "Not packed yet";
  if (!delivery) return "PickMe isn't booked yet";
  if (!HANDOVER_DELIVERY.includes(delivery.status)) return "PickMe drop closed. Ask the admin.";
  return null;
}

/**
 * Where a paid order is on the admin's Orders tab (product owner, 2026-10-21): no PickMe yet,
 * booked and still in our store, with the driver, failed (to book again), or delivered.
 */
export type OrderStage = "to-book" | "in-store" | "on-the-way" | "failed" | "delivered";

export const ORDER_STAGE_LABEL: Record<OrderStage, string> = {
  "to-book": "To book",
  "in-store": "In store",
  "on-the-way": "On the way",
  failed: "Failed",
  delivered: "Delivered",
};

export function orderStage(
  delivery: { status: string } | null,
  packing: { handedOverAt: Date | null } | null,
): OrderStage {
  if (!delivery) return "to-book";
  if (delivery.status === "DELIVERED") return "delivered";
  if (delivery.status === "FAILED" || delivery.status === "CANCELLED") return "failed";
  if (delivery.status === "PICKED_UP" || packing?.handedOverAt) return "on-the-way";
  return "in-store";
}
