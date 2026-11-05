import "server-only";
import type { Tx } from "../db";
import type { GroupCart } from "@/generated/prisma/client";
import { notify } from "../notify";

/** Capture before mutation and evaluate after mutation while holding the same cart lock. */
export async function trackDoneTransition(tx: Tx, cart: GroupCart) {
  const before = await doneProgress(tx, cart.id, cart.ownerId);
  return async () => {
    const after = await doneProgress(tx, cart.id, cart.ownerId);
    return (
      (cart.status === "OPEN" || cart.status === "READY") &&
      before.done < before.required &&
      after.required > 0 &&
      after.done === after.required
    );
  };
}

/** Call only after the transaction commits. */
export async function notifyDoneTransition(cart: GroupCart, becameDone: boolean) {
  if (becameDone)
    await notify([cart.ownerId], { title: "Everyone is done", body: "", href: `/c/${cart.code}` });
}
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
