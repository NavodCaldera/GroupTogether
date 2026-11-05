import "server-only";
import type { Tx } from "../db";
/** Caller holds the cart row; share changes and done decisions serialize on that row. */
export async function resetMemberDone(tx: Tx, cartId: string, userId: string) {
  await tx.cartMember.updateMany({
    where: { cartId, userId, doneAt: { not: null } },
    data: { doneAt: null },
  });
}
export async function doneProgress(tx: Tx, cartId: string, ownerId: string) {
  const lines = await tx.cartLine.findMany({
    where: { cartId, userId: { not: ownerId } },
    distinct: ["userId"],
    select: { userId: true },
  });
  const members = await tx.cartMember.findMany({
    where: { cartId, userId: { in: lines.map((l) => l.userId) } },
    select: { doneAt: true },
  });
  return { required: lines.length, done: members.filter((m) => m.doneAt !== null).length };
}
