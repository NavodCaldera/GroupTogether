import "server-only";
import { D, toD } from "@/lib/decimal";
import { canMoveBasket, canMoveOrder } from "@/lib/order-rules";
import type { Tx } from "../db";
import { getSettings } from "../settings";
import { post } from "../tokens";
import { CartError } from "../carts/errors";
import { lockBasketSlot } from "./locks";

export class BasketError extends CartError {}

/** Caller holds the basket slot. Moves an OPEN basket to LOCKED. */
export async function lockBasket(
  tx: Tx,
  basketId: string,
  reason: "AMOUNT" | "MAX_WAIT" | "SUSPENDED",
  now: Date,
): Promise<void> {
  const basket = await tx.basket.findUniqueOrThrow({
    where: { id: basketId },
    select: { status: true },
  });
  if (!canMoveBasket(basket.status, "LOCKED"))
    throw new BasketError("This basket cannot be locked");
  await tx.basket.update({
    where: { id: basketId },
    data: { status: "LOCKED", lockedAt: now, lockReason: reason },
  });
}

/** Caller holds the buyer advisories and the Order rows. Lock order from here:
 * basket advisories (sorted) -> Variant rows (variantId order) -> Basket rows -> ledger User
 * rows (SPEND entries last).
 * Returns the ids of baskets this call locked.
 */
export async function markOrdersPaid(tx: Tx, orderIds: string[], now: Date): Promise<string[]> {
  const ids = [...new Set(orderIds)].sort();
  const orders = await tx.order.findMany({
    where: { id: { in: ids } },
    include: { lines: { select: { variantId: true, qty: true } } },
    orderBy: { id: "asc" },
  });
  if (orders.length !== ids.length) throw new BasketError("Order not found");
  for (const o of orders)
    if (!canMoveOrder(o.status, "PAID"))
      throw new BasketError("This order is no longer waiting for payment");
  const settings = await getSettings(tx);
  const lockAt = toD(settings.basketLockAmount);

  const slots = [...new Set(orders.map((o) => `${o.agentId}:${o.factoryId}`))].sort();
  for (const slot of slots) {
    const [agentId, factoryId] = slot.split(":");
    await lockBasketSlot(tx, agentId, factoryId);
  }

  // Variant rows after the basket advisories, in variantId order across all orders.
  const perVariant = new Map<string, number>();
  for (const o of orders)
    for (const line of o.lines)
      perVariant.set(line.variantId, (perVariant.get(line.variantId) ?? 0) + line.qty);
  for (const variantId of [...perVariant.keys()].sort()) {
    const qty = perVariant.get(variantId)!;
    const moved = await tx.variant.updateMany({
      where: { id: variantId, reserved: { gte: qty } },
      data: { reserved: { decrement: qty }, sold: { increment: qty } },
    });
    if (moved.count !== 1) throw new BasketError("Reserved stock is missing");
  }

  const locked: string[] = [];
  for (const o of orders) {
    let basket = await tx.basket.findFirst({
      where: { agentId: o.agentId, factoryId: o.factoryId, status: "OPEN" },
    });
    basket ??= await tx.basket.create({
      data: { agentId: o.agentId, factoryId: o.factoryId, firstOrderAt: now },
    });
    const total = toD(basket.total).plus(toD(o.itemsTotal));
    await tx.basket.update({
      where: { id: basket.id },
      data: { total: total.toFixed(2), firstOrderAt: basket.firstOrderAt ?? now },
    });
    await tx.order.update({
      where: { id: o.id },
      data: { status: "PAID", paidAt: now, basketId: basket.id },
    });
    if (total.gte(lockAt)) {
      await lockBasket(tx, basket.id, "AMOUNT", now);
      locked.push(basket.id);
    }
  }

  for (const o of orders)
    await post(tx, {
      userId: o.buyerId,
      amount: new D(0),
      kind: "SPEND",
      eventKey: `spend:${o.id}`,
      note: `${toD(o.tokensApplied).toFixed(2)} tokens spent on order`,
      orderId: o.id,
    });
  return locked;
}
