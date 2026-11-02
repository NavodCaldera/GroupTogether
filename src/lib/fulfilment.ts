/**
 * Who packs paid orders (product owner, 2026-11-03). FACTORY: each factory packs its own orders
 * and we book PickMe from the factory. WAREHOUSE: the parked store flow with our packing staff,
 * kept so the model can switch back.
 */
export type FulfilmentMode = "FACTORY" | "WAREHOUSE";

/** FACTORY unless a deployment sets FULFILMENT_MODE=WAREHOUSE to bring the store flow back. */
export const fulfilmentMode = (): FulfilmentMode =>
  process.env.FULFILMENT_MODE === "WAREHOUSE" ? "WAREHOUSE" : "FACTORY";

export const factoryFulfilment = () => fulfilmentMode() === "FACTORY";

/**
 * A cart ships as one parcel from one factory. `existing` are the factories (product seller,
 * null for our own listings) already in the cart; null when `incoming` may join.
 */
export function factoryConflict(
  existing: readonly (string | null)[],
  incoming: string | null,
): string | null {
  return existing.some((f) => f !== incoming)
    ? "This cart is from another factory. Start a separate cart for this item."
    : null;
}
