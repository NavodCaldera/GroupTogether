import "server-only";
import type { GroupCart } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import { CartError } from "./errors";
class ChangedParticipants extends Error {}
export async function lockUserAdvisory(tx: Tx, userId: string) {
  await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtext(${userId}))) AS l`;
}
export async function lockCart(tx: Tx, cartId: string): Promise<GroupCart> {
  await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${cartId} FOR UPDATE`;
  const cart = await tx.groupCart.findUnique({ where: { id: cartId } });
  if (!cart) throw new CartError("This cart no longer exists");
  return cart;
}
async function participants(tx: Tx, cartIds: string[], extra: string[]) {
  const carts = await tx.groupCart.findMany({
    where: { id: { in: cartIds } },
    select: {
      ownerId: true,
      members: { select: { userId: true } },
      lines: { select: { userId: true } },
    },
  });
  return [
    ...new Set([
      ...extra,
      ...carts.flatMap((c) => [
        c.ownerId,
        ...c.members.map((m) => m.userId),
        ...c.lines.map((l) => l.userId),
      ]),
    ]),
  ].sort();
}
/** All user advisories (sorted) -> all cart rows (sorted) -> ledger User rows (sorted).
 * Snapshot participants first; if a join/merge changed them while we waited, roll back and retry
 * rather than acquiring a newly discovered user advisory after holding a cart row.
 */
export async function withCartTransaction<T>(
  cartIds: string[],
  extraUsers: string[],
  work: (tx: Tx) => Promise<T>,
): Promise<T> {
  const ids = [...new Set(cartIds)].sort();
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const users = await participants(tx, ids, extraUsers);
          for (const id of users) await lockUserAdvisory(tx, id);
          for (const id of ids)
            await tx.$queryRaw`SELECT 1 FROM "GroupCart" WHERE id = ${id} FOR UPDATE`;
          const fresh = await participants(tx, ids, extraUsers);
          if (fresh.some((id) => !users.includes(id))) throw new ChangedParticipants();
          return work(tx);
        },
        { maxWait: 10000, timeout: 30000 },
      );
    } catch (error) {
      if (!(error instanceof ChangedParticipants) && (error as { code?: string }).code !== "P2034")
        throw error;
    }
  }
  throw new CartError("The cart changed. Try again.");
}
export async function lockLedgerUsers(tx: Tx, userIds: string[]) {
  for (const id of [...new Set(userIds)].sort())
    await tx.$queryRaw`SELECT 1 FROM "User" WHERE id = ${id} FOR UPDATE`;
}
