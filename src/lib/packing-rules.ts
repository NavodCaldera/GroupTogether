import type { CartStatus } from "./cart-rules";

/**
 * Packing in our store, with no database (CLAUDE.md rule 17, product owner 2026-10-18).
 * One of the packing staff packs a confirmed cart, two other staff check that everything is in
 * order (never the packer: product owner, 2026-10-19), and only then is it handed to PickMe.
 */
export const CHECKS_NEEDED = 2;

/** Paid carts not yet delivered: the ones the packing staff work on. */
export const PACKABLE: readonly CartStatus[] = ["CONFIRMED", "DISPATCHED"];

/** PickMe states in which the parcel can still be handed to the driver. */
export const HANDOVER_DELIVERY: readonly string[] = ["BOOKED", "PICKED_UP"];

export type PackingStage = "to-pack" | "to-check" | "ready" | "handed-over";

export const PACKING_STAGE_LABEL: Record<PackingStage, string> = {
  "to-pack": "To pack",
  "to-check": "To check",
  ready: "Ready for PickMe",
  "handed-over": "Handed to PickMe",
};

export type PackingLike = {
  packedById: string;
  checks: readonly { userId: string }[];
  handedOverAt: Date | null;
} | null;

export function packingStage(p: PackingLike): PackingStage {
  if (!p) return "to-pack";
  if (p.handedOverAt) return "handed-over";
  return p.checks.length >= CHECKS_NEEDED ? "ready" : "to-check";
}

/** Why `userId` can't certify this packing now, or null if they can. */
export function checkBlockReason(p: PackingLike, userId: string): string | null {
  if (!p) return "Pack this order first";
  if (p.handedOverAt) return "This order has already gone to PickMe";
  if (p.packedById === userId) return "You packed this order, so you can't check it";
  if (p.checks.some((c) => c.userId === userId))
    return "You already checked it. Someone else must check it.";
  if (p.checks.length >= CHECKS_NEEDED) return "Already checked twice";
  return null;
}

/** Why the parcel can't be handed to the PickMe driver yet, or null if it can. */
export function handOverBlockReason(
  p: PackingLike,
  delivery: { status: string } | null,
): string | null {
  if (!p) return "Pack this order first";
  if (p.handedOverAt) return "This order has already gone to PickMe";
  const missing = CHECKS_NEEDED - p.checks.length;
  if (missing > 0) return `Needs ${missing === 1 ? "1 more check" : `${missing} more checks`}`;
  if (!delivery) return "PickMe isn't booked yet";
  if (!HANDOVER_DELIVERY.includes(delivery.status)) return "PickMe drop closed. Ask the admin.";
  return null;
}

/** "Amal", "Amal and Nimal", "Amal, Nimal and Kamal". */
export function namesList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
