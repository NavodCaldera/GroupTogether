import "server-only";
import { db, type Tx } from "./db";
import { toD } from "@/lib/decimal";
import { credit } from "./tokens";
import { lockLedgerUsers } from "./carts/locks";
import { CartError } from "./carts/errors";
import { notify } from "./notify";
/** Caller holds participant advisories -> cart row(s). Call flushCancellationNotices AFTER commit.
 * Durable line markers and notify keys make a partially completed notification sweep retryable.
 */
export async function cancelPaidLines(tx: Tx, lineIds: string[], reason: string): Promise<void> {
  if (!reason.trim()) throw new CartError("Give the cancellation reason");
  const lines = await tx.cartLine.findMany({
    where: {
      id: { in: lineIds },
      status: "ACTIVE",
      cart: { status: { in: ["CONFIRMED", "DISPATCHED"] } },
    },
    include: { cart: { select: { status: true } } },
    orderBy: [{ userId: "asc" }, { id: "asc" }],
  });
  if (new Set(lines.map((l) => l.cartId)).size > 1)
    throw new CartError("Cancel one cart per transaction");
  await lockLedgerUsers(
    tx,
    lines.map((l) => l.userId),
  );
  for (const line of lines) {
    await credit(
      tx,
      line.userId,
      toD(line.unitPrice).times(line.qty),
      "CANCELLATION",
      { cartLineId: line.id },
      reason,
    );
    // Hidden goods leave sold stock; never put them back into saleable availability.
    await tx.variant.update({
      where: { id: line.variantId },
      data: { sold: { decrement: line.qty } },
    });
    await tx.cartLine.update({
      where: { id: line.id },
      data: { status: "CANCELLED", notEarned: true, cancelledAt: new Date(), cancelReason: reason },
    });
  }
  if (lines.length) {
    const cartId = lines[0].cartId;
    if (!(await tx.cartLine.count({ where: { cartId, status: "ACTIVE" } })))
      await tx.groupCart.update({
        where: { id: cartId },
        data: {
          status: "CANCELLED",
          closedReason: reason,
          cancelPickupReview: lines[0].cart.status === "DISPATCHED",
        },
      });
  }
}
export async function flushCancellationNotices(): Promise<void> {
  const lines = await db.cartLine.findMany({
    where: { status: "CANCELLED", cancelledAt: { not: null }, cancelNotifiedAt: null },
    select: { id: true, userId: true, cancelReason: true, cart: { select: { code: true } } },
  });
  for (const line of lines) {
    await notify(
      [line.userId],
      {
        title: `Item cancelled in ${line.cart.code}`,
        body: line.cancelReason ?? "",
        href: `/c/${line.cart.code}`,
      },
      `cancelled-line:${line.id}`,
    );
    await db.cartLine.update({ where: { id: line.id }, data: { cancelNotifiedAt: new Date() } });
  }
  const carts = await db.groupCart.findMany({
    where: { cancelPickupReview: true },
    select: { id: true, code: true },
  });
  if (carts.length) {
    const admins = await db.user.findMany({
      where: { role: "ADMIN", adminArea: "WAREHOUSE", locked: false },
      select: { id: true },
    });
    for (const cart of carts) {
      await notify(
        admins.map((a) => a.id),
        {
          title: `Cancelled dispatched cart ${cart.code}`,
          body: "Arrange the pickup manually.",
          href: `/admin/carts/${cart.code}`,
        },
        `cancelled-dispatched:${cart.id}`,
      );
      await db.groupCart.update({ where: { id: cart.id }, data: { cancelPickupReview: false } });
    }
  }
}
