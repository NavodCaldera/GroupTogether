import "server-only";
import { D, toD } from "@/lib/decimal";
import { cancelRefund } from "@/lib/agent-money";
import { canMoveBasket, canMoveOrder } from "@/lib/order-rules";
import { db, type Tx } from "../db";
import { getSettings } from "../settings";
import { post } from "../tokens";
import { CartError } from "../carts/errors";
import { CheckoutError } from "./checkout";
import { lockBasketSlot, withOrderTransaction } from "./locks";

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
 * Agent rows (FOR SHARE, sorted) -> basket advisories (sorted) -> Variant rows (variantId order)
 * -> Basket rows -> ledger User rows (SPEND entries last). A basket for an agent that is no
 * longer LIVE (suspended or leaving while the buyer paid) locks at once.
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

  // Suspension and leave update the Agent row before locking OPEN baskets: holding it FOR SHARE
  // means they either see the basket this call makes, or this call sees their status.
  const agentIds = [...new Set(orders.map((o) => o.agentId))].sort();
  for (const id of agentIds) await tx.$queryRaw`SELECT 1 FROM "Agent" WHERE id = ${id} FOR SHARE`;
  const live = new Set(
    (
      await tx.agent.findMany({
        where: { id: { in: agentIds }, status: "LIVE" },
        select: { id: true },
      })
    ).map((a) => a.id),
  );

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
    if (total.gte(lockAt) || !live.has(o.agentId)) {
      await lockBasket(tx, basket.id, total.gte(lockAt) ? "AMOUNT" : "SUSPENDED", now);
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

/** Caller holds the buyer advisory and the Order rows. Cancels the orders that are still
 * PENDING: Variant rows (variantId order) reserved -> available, then the token hold is released
 * on the ledger. No basket is touched. Returns how many orders were cancelled.
 */
export async function releasePendingOrders(tx: Tx, orderIds: string[]): Promise<number> {
  const orders = await tx.order.findMany({
    where: { id: { in: [...new Set(orderIds)] }, status: "PENDING" },
    include: { lines: { select: { variantId: true, qty: true } } },
    orderBy: { id: "asc" },
  });
  if (!orders.length) return 0;
  const perVariant = new Map<string, number>();
  for (const o of orders)
    for (const line of o.lines)
      perVariant.set(line.variantId, (perVariant.get(line.variantId) ?? 0) + line.qty);
  for (const variantId of [...perVariant.keys()].sort()) {
    const qty = perVariant.get(variantId)!;
    const moved = await tx.variant.updateMany({
      where: { id: variantId, reserved: { gte: qty } },
      data: { reserved: { decrement: qty }, available: { increment: qty } },
    });
    if (moved.count !== 1) throw new BasketError("Reserved stock is missing");
  }
  for (const o of orders) {
    if (!canMoveOrder(o.status, "CANCELLED"))
      throw new BasketError("This order cannot be cancelled");
    await tx.order.update({ where: { id: o.id }, data: { status: "CANCELLED" } });
  }
  for (const o of orders)
    if (toD(o.tokensApplied).gt(0))
      await post(tx, {
        userId: o.buyerId,
        amount: toD(o.tokensApplied),
        kind: "RELEASE",
        eventKey: `release:${o.id}`,
        note: "Tokens released from unpaid order",
        orderId: o.id,
      });
  return orders.length;
}

/** Cancels unpaid orders whose payment window has closed. Each attempt (or buyer, for orders
 * without one) runs in its own short transaction: buyer advisory -> Order rows -> Variant rows ->
 * ledger. Returns the number of orders cancelled.
 */
export async function expireOrders(now: Date): Promise<number> {
  let cancelled = 0;
  const attempts = await db.paymentAttempt.findMany({
    where: { purpose: "ORDERS", status: "PENDING", expiresAt: { lte: now } },
    select: { id: true, buyerId: true, orders: { select: { id: true } } },
    orderBy: { id: "asc" },
  });
  for (const a of attempts) {
    try {
      cancelled += await withOrderTransaction(
        [a.buyerId ?? a.id],
        a.orders.map((o) => o.id),
        async (tx) => {
          const attempt = await tx.paymentAttempt.findUniqueOrThrow({
            where: { id: a.id },
            select: { status: true, expiresAt: true },
          });
          if (attempt.status !== "PENDING" || attempt.expiresAt > now) return 0;
          const count = await releasePendingOrders(
            tx,
            a.orders.map((o) => o.id),
          );
          await tx.paymentAttempt.update({ where: { id: a.id }, data: { status: "EXPIRED" } });
          return count;
        },
      );
    } catch (error) {
      console.error("Payment expiry will retry", a.id, error);
    }
  }

  const orphans = await db.order.findMany({
    where: { status: "PENDING", paymentAttemptId: null, holdUntil: { lte: now } },
    select: { id: true, buyerId: true },
    orderBy: { id: "asc" },
  });
  const byBuyer = new Map<string, string[]>();
  for (const o of orphans) byBuyer.set(o.buyerId, [...(byBuyer.get(o.buyerId) ?? []), o.id]);
  for (const [buyerId, ids] of byBuyer)
    try {
      cancelled += await withOrderTransaction([buyerId], ids, async (tx) => {
        const due = await tx.order.findMany({
          where: { id: { in: ids }, status: "PENDING", holdUntil: { lte: now } },
          select: { id: true },
        });
        return releasePendingOrders(
          tx,
          due.map((o) => o.id),
        );
      });
    } catch (error) {
      console.error("Order expiry will retry", buyerId, error);
    }
  return cancelled;
}

/** The buyer cancels a paid order while its basket is still OPEN; everything paid comes back as
 * tokens. Lock order: buyer advisory -> Order row -> basket advisory -> Basket row -> Variant rows
 * (variantId order) -> ledger.
 */
export async function cancelOrder(buyerId: string, orderId: string): Promise<void> {
  await withOrderTransaction([buyerId], [orderId], async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { lines: { select: { variantId: true, qty: true } } },
    });
    if (!order || order.buyerId !== buyerId) throw new CheckoutError("Order not found");
    if (order.status !== "PAID" || !order.basketId || !canMoveOrder(order.status, "CANCELLED"))
      throw new CheckoutError("This order can no longer be cancelled");
    await lockBasketSlot(tx, order.agentId, order.factoryId);
    await tx.$queryRaw`SELECT 1 FROM "Basket" WHERE id = ${order.basketId} FOR UPDATE`;
    const basket = await tx.basket.findUniqueOrThrow({ where: { id: order.basketId } });
    if (basket.status !== "OPEN") throw new CheckoutError("This order can no longer be cancelled");

    const perVariant = new Map<string, number>();
    for (const line of order.lines)
      perVariant.set(line.variantId, (perVariant.get(line.variantId) ?? 0) + line.qty);
    for (const variantId of [...perVariant.keys()].sort()) {
      const qty = perVariant.get(variantId)!;
      const moved = await tx.variant.updateMany({
        where: { id: variantId, sold: { gte: qty } },
        data: { sold: { decrement: qty }, available: { increment: qty } },
      });
      if (moved.count !== 1) throw new BasketError("Sold stock is missing");
    }

    await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
    const earliest = await tx.order.findFirst({
      where: { basketId: basket.id, status: "PAID" },
      orderBy: [{ paidAt: "asc" }, { id: "asc" }],
      select: { paidAt: true },
    });
    const total = toD(basket.total).minus(toD(order.itemsTotal));
    if (total.lt(0)) throw new BasketError("Basket total would go below zero");
    await tx.basket.update({
      where: { id: basket.id },
      data: { total: total.toFixed(2), firstOrderAt: earliest?.paidAt ?? null },
    });

    const refund = cancelRefund({
      tokensApplied: toD(order.tokensApplied),
      remainder: toD(order.amountDue).minus(toD(order.gatewayFee)),
      fee: toD(order.gatewayFee),
    });
    if (refund.gt(0))
      await post(tx, {
        userId: order.buyerId,
        amount: refund,
        kind: "ORDER_CANCEL",
        eventKey: `cancel:${order.id}`,
        note: "Order cancelled before the basket locked",
        orderId: order.id,
      });
  });
}
