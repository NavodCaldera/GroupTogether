/**
 * Where a buyer's order is (owner, 2026-11-21, DEC-026): Filling, Packing, On the way, Delivered,
 * or Refunded when its basket was cancelled. Orders never paid have no stage and are not listed.
 */
export type Stage = "filling" | "packing" | "on_the_way" | "delivered" | "refunded";

export const STAGES: readonly Stage[] = [
  "filling",
  "packing",
  "on_the_way",
  "delivered",
  "refunded",
];

export const STAGE_LABEL: Record<Stage, string> = {
  filling: "Filling",
  packing: "Packing",
  on_the_way: "On the way",
  delivered: "Delivered",
  refunded: "Refunded",
};

/** The tracker's four steps. */
export const TRACK = ["filling", "packing", "on_the_way", "delivered"] as const;

export function orderStage(o: {
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELLED";
  paidAt: Date | null;
  basket: { status: string } | null;
}): Stage | null {
  if (!o.paidAt) return null;
  if (o.status === "CANCELLED" || o.basket?.status === "CANCELLED") return "refunded";
  if (o.status === "RECEIVED") return "delivered";
  switch (o.basket?.status) {
    case "LOCKED":
    case "PACKED":
    case "AWAITING_FEE": // legacy own-basket status, no longer written
      return "packing";
    case "WITH_COURIER":
      return "on_the_way";
    case "AT_AGENT":
    case "DELIVERED":
      return "delivered";
    default:
      return "filling";
  }
}
