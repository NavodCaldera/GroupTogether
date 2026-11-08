import "server-only";
import { db, type Tx } from "../db";
import { CartError } from "@/server/errors";

/** Lock order everywhere: user advisories (sorted) -> Order rows (sorted) -> basket advisory
 * basket:<agentId>:<factoryId> -> Basket rows -> ledger User rows (sorted).
 * Variant rows are locked after any basket advisory, in variantId order. Basket rows are only
 * written while their basket advisory is held, so Basket and Variant rows may be taken in either
 * order relative to each other (markOrdersPaid: Variant then Basket; cancelOrder: Basket then
 * Variant) without a deadlock.
 */
export async function lockUserAdvisory(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
}

/** Serializes pickup-code lookups for one agent. A user-level advisory: it goes first. */
export async function lockPickupAgent(tx: Tx, agentId: string) {
  const key = `pickup:${agentId}`;
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

export async function lockLedgerUsers(tx: Tx, userIds: string[]) {
  for (const id of [...new Set(userIds)].sort())
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${id} FOR UPDATE`;
}

export async function lockBasketSlot(tx: Tx, agentId: string, factoryId: string) {
  const key = `basket:${agentId}:${factoryId}`;
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${key}))) AS l`;
}

/** User advisories (sorted) -> Order rows (sorted) -> work. Retries serialization conflicts. */
export async function withOrderTransaction<T>(
  userIds: string[],
  orderIds: string[],
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const users = [...new Set(userIds)].sort();
  const orders = [...new Set(orderIds)].sort();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          for (const id of users) await lockUserAdvisory(tx, id);
          for (const id of orders)
            await tx.$queryRaw`SELECT 1 FROM "Order" WHERE id = ${id} FOR UPDATE`;
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034") throw error;
    }
  }
  throw new CartError("Busy, try again.");
}
