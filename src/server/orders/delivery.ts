import "server-only";
import { randomInt } from "node:crypto";
import type { BasketStatus } from "@/generated/prisma/client";
import { D, toD } from "@/lib/decimal";
import { AGENTS_AREA } from "@/lib/admin-access";
import { missingDeduction, missingRefund } from "@/lib/agent-money";
import { factoryOf } from "@/lib/factory-roles";
import { canMoveBasket } from "@/lib/order-rules";
import { validCommission } from "@/lib/price-rules";
import { AGENT_ACCESS } from "../auth/service";
import { db, type Tx } from "../db";
import { notify } from "../notify";
import { post } from "../tokens";
import { CartError } from "@/server/errors";
import { lockBasketSlot, withOrderTransaction } from "./locks";

export class DeliveryError extends CartError {}

const NOTE_MAX = 500;
const FIELD_MAX = 100;
const CODE_TRIES = 10;

/** A factory account or its Owner/Packing staff, for the given factory. */
async function requirePacker(userId: string, factoryId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, locked: true, factoryId: true, factoryRole: true },
  });
  if (!user || user.role !== "SELLER" || user.locked) throw new DeliveryError("Not allowed");
  const f = factoryOf(user);
  if (f.factoryId !== factoryId || (f.factoryRole !== "OWNER" && f.factoryRole !== "PACKING"))
    throw new DeliveryError("Not allowed");
}

async function requireAdmin(adminId: string, area: string) {
  const user = await db.user.findUnique({
    where: { id: adminId },
    select: { role: true, locked: true, adminArea: true },
  });
  if (!user || user.role !== "ADMIN" || user.locked || user.adminArea !== area)
    throw new DeliveryError("Not allowed");
}

async function basketKey(basketId: string) {
  const basket = await db.basket.findUnique({
    where: { id: basketId },
    select: { id: true, agentId: true, factoryId: true },
  });
  if (!basket) throw new DeliveryError("Basket not found");
  return basket;
}

/** Caller holds any earlier locks. Takes the basket advisory, then the Basket row. */
async function lockBasketRow(tx: Tx, b: { id: string; agentId: string; factoryId: string }) {
  await lockBasketSlot(tx, b.agentId, b.factoryId);
  await tx.$queryRaw`SELECT 1 FROM "Basket" WHERE id = ${b.id} FOR UPDATE`;
  return tx.basket.findUniqueOrThrow({ where: { id: b.id }, include: { courier: true } });
}

function requireMove(from: BasketStatus, to: BasketStatus) {
  if (!canMoveBasket(from, to)) throw new DeliveryError("This basket cannot move to that step");
}

/** Factory Owner/Packing: LOCKED -> PACKED. */
export async function markPacked(userId: string, basketId: string): Promise<void> {
  const key = await basketKey(basketId);
  await requirePacker(userId, key.factoryId);
  await withOrderTransaction([], [], async (tx) => {
    const basket = await lockBasketRow(tx, key);
    requireMove(basket.status, "PACKED");
    await tx.basket.update({ where: { id: basket.id }, data: { status: "PACKED" } });
  });
}

/** Agents and orders admin: books (or re-books) the courier for a PACKED basket. */
export async function bookCourier(
  adminId: string,
  basketId: string,
  c: { fee: string; driverName: string; driverPhone: string; vehicleNo: string },
): Promise<void> {
  await requireAdmin(adminId, AGENTS_AREA);
  const fee = typeof c.fee === "string" ? c.fee.trim() : "";
  if (!validCommission(fee) || new D(fee).lte(0))
    throw new DeliveryError("Enter a positive courier fee with at most two decimals");
  const fields = {
    driverName: String(c.driverName ?? "").trim(),
    driverPhone: String(c.driverPhone ?? "").trim(),
    vehicleNo: String(c.vehicleNo ?? "").trim(),
  };
  for (const v of Object.values(fields))
    if (!v || v.length > FIELD_MAX) throw new DeliveryError("Enter the driver and vehicle details");
  const key = await basketKey(basketId);
  await withOrderTransaction([], [], async (tx) => {
    const basket = await lockBasketRow(tx, key);
    if (basket.status !== "PACKED") throw new DeliveryError("The basket is not packed");
    const data = { fee: new D(fee).toFixed(2), ...fields, bookedById: adminId };
    await tx.courierBooking.upsert({
      where: { basketId: basket.id },
      create: { basketId: basket.id, ...data },
      update: data,
    });
  });
}

/** Factory Owner/Packing: hands a booked PACKED basket to the driver -> WITH_COURIER. */
export async function givenToDriver(userId: string, basketId: string): Promise<void> {
  const key = await basketKey(basketId);
  await requirePacker(userId, key.factoryId);
  await withOrderTransaction([], [], async (tx) => {
    const basket = await lockBasketRow(tx, key);
    requireMove(basket.status, "WITH_COURIER");
    if (!basket.courier) throw new DeliveryError("Book a courier first");
    // A pending report can only be removed before the basket ships.
    const pending = await tx.orderLine.count({
      where: {
        status: "ACTIVE",
        missingReportedQty: { gt: 0 },
        order: { basketId: basket.id, status: "PAID" },
      },
    });
    if (pending > 0) throw new DeliveryError("Resolve the missing items first");
    const now = new Date();
    await tx.courierBooking.update({
      where: { basketId: basket.id },
      data: { givenToDriverAt: now },
    });
    await tx.basket.update({ where: { id: basket.id }, data: { status: "WITH_COURIER" } });
  });
}

async function lineContext(orderLineId: string) {
  const line = await db.orderLine.findUnique({
    where: { id: orderLineId },
    select: { id: true, order: { select: { id: true, buyerId: true, basketId: true } } },
  });
  if (!line || !line.order.basketId) throw new DeliveryError("Item not found");
  return { lineId: line.id, orderId: line.order.id, buyerId: line.order.buyerId };
}

/** Lock order: buyer advisory -> Order row -> basket advisory -> Basket row. */
async function lockLine(tx: Tx, lineId: string) {
  const line = await tx.orderLine.findUniqueOrThrow({
    where: { id: lineId },
    include: {
      order: true,
      variant: { select: { product: { select: { title: true } } } },
    },
  });
  if (line.order.status !== "PAID" || !line.order.basketId || line.status !== "ACTIVE")
    throw new DeliveryError("This item can no longer change");
  const basket = await lockBasketRow(tx, {
    id: line.order.basketId,
    agentId: line.order.agentId,
    factoryId: line.order.factoryId,
  });
  if (basket.status !== "LOCKED" && basket.status !== "PACKED")
    throw new DeliveryError("The basket has left the factory");
  return { line, basket };
}

/** Factory Owner/Packing: reports units of a line it cannot supply, while LOCKED or PACKED. */
export async function reportMissing(
  userId: string,
  orderLineId: string,
  qty: number,
  note: string,
): Promise<void> {
  const text = typeof note === "string" ? note.trim() : "";
  if (!text || text.length > NOTE_MAX) throw new DeliveryError("Add a note");
  if (!Number.isInteger(qty) || qty <= 0) throw new DeliveryError("Enter a quantity");
  const ctx = await lineContext(orderLineId);
  const factoryId = (
    await db.order.findUniqueOrThrow({ where: { id: ctx.orderId }, select: { factoryId: true } })
  ).factoryId;
  await requirePacker(userId, factoryId);
  await withOrderTransaction([ctx.buyerId], [ctx.orderId], async (tx) => {
    const { line, basket } = await lockLine(tx, ctx.lineId);
    if (basket.factoryId !== factoryId) throw new DeliveryError("Not allowed");
    if (qty > line.qty - line.missingQty) throw new DeliveryError("That is more than ordered");
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        missingReportedQty: qty,
        missingNote: text,
        missingReportedAt: new Date(),
        missingReportedById: userId,
      },
    });
  });
}

/** Factory admin: removes the reported units, refunds the buyer in tokens and queues a deduction
 * from the factory's next payout. Lock order: buyer advisory -> Order row -> basket advisory ->
 * Basket row -> ledger.
 */
export async function removeMissingLine(adminId: string, orderLineId: string): Promise<void> {
  await requireAdmin(adminId, "FACTORY");
  const ctx = await lineContext(orderLineId);
  const done = await withOrderTransaction([ctx.buyerId], [ctx.orderId], async (tx) => {
    const { line, basket } = await lockLine(tx, ctx.lineId);
    const removed = line.missingReportedQty;
    if (removed <= 0) throw new DeliveryError("Nothing is reported missing");
    const missingQty = line.missingQty + removed;
    if (missingQty > line.qty) throw new DeliveryError("That is more than ordered");
    const unitPrice = toD(line.unitPrice);
    const courierEach = toD(line.courierEach);
    const agentFeeEach = toD(line.agentFeeEach);
    const refund = missingRefund(removed, unitPrice, courierEach, agentFeeEach);
    const deduction = missingDeduction(
      removed,
      unitPrice,
      toD(line.factoryPrice),
      courierEach,
      agentFeeEach,
    );
    const eventKey = `missing:${line.id}:${missingQty}`;

    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        missingQty,
        missingReportedQty: 0,
        ...(missingQty === line.qty ? { status: "CANCELLED" as const } : {}),
      },
    });
    const total = D.max(toD(basket.total).minus(unitPrice.times(removed)), 0);
    await tx.basket.update({ where: { id: basket.id }, data: { total: total.toFixed(2) } });
    if (deduction.gt(0))
      await tx.payoutDeduction.create({
        data: {
          factoryId: basket.factoryId,
          kind: "MISSING_ITEM",
          amount: deduction.toFixed(2),
          ref: eventKey,
        },
      });
    await post(tx, {
      userId: line.order.buyerId,
      amount: refund,
      kind: "MISSING_ITEM",
      eventKey,
      note: "Item the factory could not supply",
      orderId: line.order.id,
      orderLineId: line.id,
    });
    return { refund, removed, title: line.variant.product.title, eventKey };
  });
  await notify(
    [ctx.buyerId],
    {
      title: "Item removed",
      body: `${done.removed} × ${done.title}: ${done.refund.toFixed(2)} tokens`,
      href: `/orders/${ctx.orderId}`,
    },
    done.eventKey,
  );
}

/** Factory admin: clears a wrong missing report, so the line ships and is paid as ordered.
 * Same locks as removeMissingLine: buyer advisory -> Order row -> basket advisory -> Basket row.
 */
export async function dismissMissingReport(adminId: string, orderLineId: string): Promise<void> {
  await requireAdmin(adminId, "FACTORY");
  const ctx = await lineContext(orderLineId);
  await withOrderTransaction([ctx.buyerId], [ctx.orderId], async (tx) => {
    const { line } = await lockLine(tx, ctx.lineId);
    if (line.missingReportedQty <= 0) throw new DeliveryError("Nothing is reported missing");
    await tx.orderLine.update({
      where: { id: line.id },
      data: {
        missingReportedQty: 0,
        missingNote: null,
        missingReportedAt: null,
        missingReportedById: null,
      },
    });
  });
}

/** Factory admin's queue: lines with a pending missing report, oldest first. */
export async function pendingMissingReports(adminId: string) {
  await requireAdmin(adminId, "FACTORY");
  return db.orderLine.findMany({
    where: { status: "ACTIVE", missingReportedQty: { gt: 0 }, order: { status: "PAID" } },
    orderBy: { missingReportedAt: "asc" },
    take: 100,
    select: {
      id: true,
      qty: true,
      missingQty: true,
      missingReportedQty: true,
      missingNote: true,
      missingReportedAt: true,
      unitPrice: true,
      variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
      order: {
        select: {
          buyer: { select: { name: true } },
          factory: { select: { name: true, company: true } },
          basket: {
            select: { status: true, agent: { select: { user: { select: { name: true } } } } },
          },
        },
      },
    },
  });
}

/** Caller holds the basket lock. Returns the buyer's code at this agent, creating it if missing.
 * Inserts use ON CONFLICT DO NOTHING so a clash never aborts the transaction.
 */
async function ensurePickupCode(tx: Tx, buyerId: string, agentId: string): Promise<string> {
  for (let i = 0; i < CODE_TRIES; i++) {
    const existing = await tx.pickupCode.findUnique({
      where: { buyerId_agentId: { buyerId, agentId } },
      select: { code: true },
    });
    if (existing) return existing.code;
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const made = await tx.pickupCode.createMany({
      data: [{ buyerId, agentId, code }],
      skipDuplicates: true,
    });
    if (made.count === 1) return code;
  }
  throw new DeliveryError("Busy, try again.");
}

/** The basket's agent: WITH_COURIER -> AT_AGENT. Orders become RECEIVED (the agent pays the driver
 * from its agent fees, DEC-018), every buyer gets a pickup code and listed returns go back to the factory.
 * A second call on an AT_AGENT basket changes nothing. Lock order: Order rows -> basket advisory ->
 * Basket row -> ledger.
 */
export async function markBasketReceived(
  agentUserId: string,
  basketId: string,
  sentBackReturnIds: string[],
): Promise<void> {
  const agent = await db.agent.findUnique({
    where: { userId: agentUserId },
    select: { id: true, status: true, user: { select: { name: true, locked: true } } },
  });
  const key = await basketKey(basketId);
  if (
    !agent ||
    agent.user.locked ||
    key.agentId !== agent.id ||
    !AGENT_ACCESS.includes(agent.status)
  )
    throw new DeliveryError("Not allowed");
  const returnIds = [...new Set(sentBackReturnIds ?? [])];
  // No order joins a basket once it has left OPEN, so this set is stable for a shipped basket.
  const orderIds = (
    await db.order.findMany({ where: { basketId, status: "PAID" }, select: { id: true } })
  ).map((o) => o.id);

  const ready = await withOrderTransaction([], orderIds, async (tx) => {
    const basket = await lockBasketRow(tx, key);
    if (basket.status === "AT_AGENT") {
      // Already received: change nothing, but resend the (deduplicated) notices so a crash
      // between commit and notify is recovered by retrying.
      const received = await tx.order.findMany({
        where: { basketId: basket.id, status: "RECEIVED" },
        select: { buyerId: true },
      });
      const codes = await tx.pickupCode.findMany({
        where: { agentId: agent.id, buyerId: { in: [...new Set(received.map((o) => o.buyerId))] } },
        select: { buyerId: true, code: true },
      });
      return new Map(codes.map((c) => [c.buyerId, c.code]));
    }
    requireMove(basket.status, "AT_AGENT");
    if (!basket.courier) throw new DeliveryError("No courier is booked");
    const orders = await tx.order.findMany({
      where: { basketId: basket.id, status: "PAID" },
      select: { id: true, buyerId: true },
      orderBy: { id: "asc" },
    });
    if (orders.some((o) => !orderIds.includes(o.id))) throw new DeliveryError("Busy, try again.");
    const now = new Date();

    if (returnIds.length) {
      const moved = await tx.returnRequest.updateMany({
        where: {
          id: { in: returnIds },
          status: "HANDED_OVER",
          handoverAgentId: agent.id,
          factoryId: basket.factoryId,
        },
        data: { status: "PICKED_UP", sentBackBasketId: basket.id },
      });
      if (moved.count !== returnIds.length)
        throw new DeliveryError("A return cannot go back in this basket");
    }

    await tx.basket.update({ where: { id: basket.id }, data: { status: "AT_AGENT" } });
    await tx.courierBooking.update({ where: { basketId: basket.id }, data: { receivedAt: now } });
    await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) }, status: "PAID" },
      data: { status: "RECEIVED", receivedAt: now },
    });
    const codes = new Map<string, string>();
    for (const buyerId of [...new Set(orders.map((o) => o.buyerId))].sort())
      codes.set(buyerId, await ensurePickupCode(tx, buyerId, agent.id));

    return codes;
  });
  for (const [buyerId, code] of ready)
    await notify(
      [buyerId],
      {
        title: "Ready to collect",
        body: `Code ${code} at ${agent.user.name}`,
        href: "/",
      },
      // notify appends the user id: the notice id is ready:<basketId>:<buyerId>.
      `ready:${basketId}`,
    );
}
