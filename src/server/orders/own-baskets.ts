import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { D, toD } from "@/lib/decimal";
import { orderTotals, splitCheckout } from "@/lib/agent-money";
import { canMoveBasket, canMoveOrder } from "@/lib/order-rules";
import { db, type Tx } from "../db";
import { getSettings } from "../settings";
import { assertTokenHolder, post, tokenBalance } from "../tokens";
import { getGateway } from "../payments/gateway";
import { appUrl, notify } from "../notify";
import { assertBuyer, CheckoutError, ratesOf } from "./checkout";
import { cancelBasketOrders, markOrdersPaid } from "./baskets";
import { lockOwnBasket, withOrderTransaction } from "./locks";
import { validCommission } from "@/lib/price-rules";

/** Own baskets (DEC-023): a buyer starts a basket for one product, others buy that product into
 * it, and the whole basket goes to the owner's address. No agent, no agent or courier fee, no
 * returns. Once it holds ownMinItems items the owner places the order; the owner pays the courier
 * on delivery, outside GroupBasket. */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 20;
const MAX_QTY = 99;

export type OwnLineInput = { variantId: string; qty: number };
export type OwnBasketCreate = {
  productId: string;
  visibility: "LINK" | "PUBLIC";
  address: string;
  area: string;
  phone: string;
};

function cleanText(v: unknown, max: number, label: string): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s || s.length > max) throw new CheckoutError(`Enter ${label}`);
  return s;
}

function cleanLines(lines: OwnLineInput[]): OwnLineInput[] {
  const merged = new Map<string, number>();
  for (const l of lines ?? []) {
    if (typeof l?.variantId !== "string" || !Number.isInteger(l.qty) || l.qty < 0)
      throw new CheckoutError("Choose sizes and quantities");
    if (l.qty === 0) continue;
    merged.set(l.variantId, (merged.get(l.variantId) ?? 0) + l.qty);
  }
  const out = [...merged].map(([variantId, qty]) => ({ variantId, qty }));
  if (!out.length) throw new CheckoutError("Choose at least one size");
  if (out.length > MAX_LINES || out.some((l) => l.qty > MAX_QTY))
    throw new CheckoutError("Too many items");
  return out.sort((a, b) => a.variantId.localeCompare(b.variantId));
}

function parseTokens(tokens: string): D {
  if (typeof tokens !== "string" || !validCommission(tokens.trim()))
    throw new CheckoutError("Enter tokens as an amount with at most two decimals");
  return new D(tokens.trim());
}

/** Loads the product and the chosen variants; every variant must belong to the product. */
async function loadProductLines(tx: Tx, productId: string, lines: OwnLineInput[]) {
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      status: true,
      price: true,
      factoryPrice: true,
      sellerId: true,
      variants: { select: { id: true, size: true, colour: true } },
    },
  });
  if (!product || product.status !== "LIVE" || !product.sellerId || product.factoryPrice === null)
    throw new CheckoutError("This product cannot be bought");
  const ids = new Set(product.variants.map((v) => v.id));
  for (const l of lines)
    if (!ids.has(l.variantId)) throw new CheckoutError("Choose sizes of this product only");
  return { ...product, sellerId: product.sellerId, factoryPrice: product.factoryPrice };
}

/** Visible, joinable basket: OPEN, the owner has paid, and the viewer may see it. */
function joinable(
  b: {
    kind: string;
    status: string;
    firstOrderAt: Date | null;
    visibility: string | null;
    shareCode: string | null;
    ownerId: string | null;
  },
  viewerId: string | null,
  code: string | null,
) {
  if (b.kind !== "OWN" || b.status !== "OPEN" || !b.firstOrderAt) return false;
  if (b.ownerId && b.ownerId === viewerId) return true;
  return b.visibility === "PUBLIC" || (!!code && code === b.shareCode);
}

type Outcome = {
  attemptId: string | null;
  orderId: string;
  basketId: string;
  pay: { amount: string; buyer: { id: string; name: string; email: string | null } } | null;
};

/** Starts a new own basket (create) or buys into one (basketId). One order per call.
 * Lock order: buyer advisory -> own basket advisory -> Variant rows (variantId order) -> Order
 * row -> ledger User row -> Basket row. The gateway is called after commit. */
export async function startOwnCheckout(
  buyerId: string,
  input: {
    create?: OwnBasketCreate;
    basketId?: string;
    shareCode?: string;
    lines: OwnLineInput[];
    tokens: string;
    requestKey: string;
  },
): Promise<{ basketId: string; orderId: string; redirectUrl: string | null }> {
  if (typeof input.requestKey !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestKey))
    throw new CheckoutError("Invalid checkout request");
  if (!input.create === !input.basketId) throw new CheckoutError("Invalid checkout request");
  const lines = cleanLines(input.lines);

  const outcome = await withOrderTransaction<Outcome>([buyerId], [], async (tx) => {
    const previous = await tx.order.findFirst({
      where: { buyerId, checkoutKey: input.requestKey },
      select: {
        id: true,
        targetBasketId: true,
        paymentAttemptId: true,
        paymentAttempt: { select: { status: true, amount: true } },
        buyer: { select: { id: true, name: true, email: true } },
      },
    });
    if (previous?.targetBasketId)
      return {
        attemptId: previous.paymentAttemptId,
        orderId: previous.id,
        basketId: previous.targetBasketId,
        pay:
          previous.paymentAttempt?.status === "PENDING"
            ? { amount: toD(previous.paymentAttempt.amount).toFixed(2), buyer: previous.buyer }
            : null,
      };
    if (previous) throw new CheckoutError("Invalid checkout request");

    const buyer = await assertBuyer(tx, buyerId);
    const settings = await getSettings(tx);
    const rates = ratesOf(settings);
    const now = new Date();

    let basketId: string;
    let productId: string;
    let create: OwnBasketCreate | null = null;
    if (input.create) {
      create = {
        productId: cleanText(input.create.productId, 100, "a product"),
        visibility: input.create.visibility === "PUBLIC" ? "PUBLIC" : "LINK",
        address: cleanText(input.create.address, 300, "the delivery address"),
        area: cleanText(input.create.area, 60, "the town or area"),
        phone: cleanText(input.create.phone, 30, "a phone number"),
      };
      productId = create.productId;
      basketId = "";
    } else {
      const b = await tx.basket.findUnique({ where: { id: String(input.basketId) } });
      if (!b || !joinable(b, buyerId, input.shareCode ?? null))
        throw new CheckoutError("This basket is not open");
      await lockOwnBasket(tx, b.id);
      const fresh = await tx.basket.findUniqueOrThrow({ where: { id: b.id } });
      if (!joinable(fresh, buyerId, input.shareCode ?? null))
        throw new CheckoutError("This basket is not open");
      basketId = fresh.id;
      productId = fresh.productId!;
    }

    const product = await loadProductLines(tx, productId, lines);
    const unitPrice = toD(product.price);
    const factoryPrice = toD(product.factoryPrice);
    // No agent, so no agent fee: only the items are charged (DEC-023).
    const totals = orderTotals(
      lines.map((l) => ({ qty: l.qty, unitPrice })),
      { ...rates, agentFeeRate: new D(0) },
    );
    const wanted = parseTokens(input.tokens);
    if (wanted.gt(0)) {
      try {
        await assertTokenHolder(tx, buyerId);
      } catch {
        throw new CheckoutError("This account cannot use tokens");
      }
      if (wanted.gt(await tokenBalance(buyerId, tx)))
        throw new CheckoutError("You do not have that many tokens");
    }
    const [part] = splitCheckout([totals], D.min(wanted, totals.gross), rates.gatewayFeeRate);

    if (create) {
      const b = await tx.basket.create({
        data: {
          kind: "OWN",
          factoryId: product.sellerId,
          ownerId: buyerId,
          productId: product.id,
          visibility: create.visibility,
          shareCode: randomBytes(9).toString("base64url"),
          deliveryAddress: create.address,
          deliveryArea: create.area,
          deliveryPhone: create.phone,
        },
        select: { id: true },
      });
      basketId = b.id;
      await lockOwnBasket(tx, basketId);
    }

    for (const l of lines) {
      const reserved = await tx.variant.updateMany({
        where: { id: l.variantId, available: { gte: l.qty } },
        data: { available: { decrement: l.qty }, reserved: { increment: l.qty } },
      });
      if (reserved.count === 0) {
        const left = await tx.variant.findUnique({
          where: { id: l.variantId },
          select: { available: true },
        });
        throw new CheckoutError(`Only ${left?.available ?? 0} left of a size you chose`);
      }
    }

    const holdUntil = new Date(now.getTime() + settings.paymentHoldMinutes * 60_000);
    const attempt = part.due.gt(0)
      ? await tx.paymentAttempt.create({
          data: {
            purpose: "ORDERS",
            buyerId,
            amount: part.due.toFixed(2),
            currency: "LKR",
            gatewayRef: `ga_${randomUUID()}`,
            expiresAt: holdUntil,
          },
        })
      : null;

    const order = await tx.order.create({
      data: {
        buyerId,
        agentId: null,
        targetBasketId: basketId,
        factoryId: product.sellerId,
        paymentAttemptId: attempt?.id ?? null,
        itemsTotal: totals.items.toFixed(2),
        courierTotal: "0.00",
        agentFeeTotal: "0.00",
        tokensApplied: part.tokens.toFixed(2),
        gatewayFee: part.fee.toFixed(2),
        amountDue: part.due.toFixed(2),
        holdUntil,
        checkoutKey: input.requestKey,
        lines: {
          create: lines.map((l) => ({
            variantId: l.variantId,
            qty: l.qty,
            unitPrice: unitPrice.toFixed(2),
            factoryPrice: factoryPrice.toFixed(2),
            courierEach: "0.00",
            agentFeeEach: "0.00",
            cashFeeEach: "0.00",
          })),
        },
      },
      select: { id: true },
    });

    if (part.tokens.gt(0))
      await post(tx, {
        userId: buyerId,
        amount: part.tokens.neg(),
        kind: "HOLD",
        eventKey: `hold:${order.id}`,
        note: "Tokens held for order",
        orderId: order.id,
      });
    if (!attempt) await markOrdersPaid(tx, [order.id], now);

    return {
      attemptId: attempt?.id ?? null,
      orderId: order.id,
      basketId,
      pay: attempt ? { amount: part.due.toFixed(2), buyer } : null,
    };
  });

  let redirectUrl: string | null = null;
  if (outcome.attemptId && outcome.pay) {
    const { redirectUrl: url } = await getGateway().createCheckout({
      attemptId: outcome.attemptId,
      amount: outcome.pay.amount,
      currency: "LKR",
      returnUrl: appUrl(`/checkout/return/${outcome.attemptId}`),
      notifyUrl: appUrl("/api/payments/notify"),
      buyer: outcome.pay.buyer,
    });
    redirectUrl = url;
  }
  return { basketId: outcome.basketId, orderId: outcome.orderId, redirectUrl };
}

/** Owner only, lock held: the basket row, checked to be the owner's own basket. */
async function ownerBasket(tx: Tx, ownerId: string, basketId: string) {
  if (typeof basketId !== "string") throw new CheckoutError("Basket not found");
  await lockOwnBasket(tx, basketId);
  const b = await tx.basket.findUnique({ where: { id: basketId } });
  if (!b || b.kind !== "OWN" || b.ownerId !== ownerId) throw new CheckoutError("Basket not found");
  return b;
}

/** The owner switches between link-only and public while the basket is OPEN. */
export async function setOwnVisibility(
  ownerId: string,
  basketId: string,
  visibility: "LINK" | "PUBLIC",
): Promise<void> {
  await withOrderTransaction([ownerId], [], async (tx) => {
    const b = await ownerBasket(tx, ownerId, basketId);
    if (b.status !== "OPEN") throw new CheckoutError("This basket is closed");
    await tx.basket.update({
      where: { id: b.id },
      data: { visibility: visibility === "PUBLIC" ? "PUBLIC" : "LINK" },
    });
  });
}

/** Items in an own basket's paid orders. */
async function basketItems(tx: Tx, basketId: string): Promise<number> {
  const lines = await tx.orderLine.findMany({
    where: { order: { basketId, status: "PAID" } },
    select: { qty: true },
  });
  return lines.reduce((s, l) => s + l.qty, 0);
}

/** Caller holds the basket advisory. OPEN -> LOCKED once the basket holds ownMinItems items;
 * the order then goes to the factory. Refuses while someone is still paying to join. */
async function closeBasket(tx: Tx, basketId: string, now: Date): Promise<boolean> {
  const b = await tx.basket.findUniqueOrThrow({ where: { id: basketId } });
  if (b.status !== "OPEN" || !b.firstOrderAt) return false;
  if (await tx.order.count({ where: { targetBasketId: b.id, status: "PENDING" } })) return false;
  const { ownMinItems } = await getSettings(tx);
  if ((await basketItems(tx, b.id)) < ownMinItems || !canMoveBasket(b.status, "LOCKED"))
    return false;
  await tx.basket.update({
    where: { id: b.id },
    data: { status: "LOCKED", closedAt: now, lockedAt: now, lockReason: "OWNER" },
  });
  return true;
}

export type OwnEvent = "closed" | "shipped" | "delivered" | "cancelled";

/** After commit: tells the owner and every buyer in an own basket what happened (DEC-023).
 * Deduplicated per basket and event, so a retry sends nothing twice. */
export async function announceOwnBasket(basketId: string, event: OwnEvent): Promise<void> {
  const b = await db.basket.findUnique({
    where: { id: basketId },
    select: {
      kind: true,
      ownerId: true,
      product: { select: { title: true } },
      orders: {
        where: { status: event === "cancelled" ? "CANCELLED" : { in: ["PAID", "RECEIVED"] } },
        select: { buyerId: true },
      },
    },
  });
  if (!b || b.kind !== "OWN" || !b.ownerId) return;
  const href = `/own-baskets/${basketId}`;
  const title = b.product?.title ?? "Own basket";
  const joiners = b.orders.map((o) => o.buyerId).filter((id) => id !== b.ownerId);
  const key = `own:${basketId}:${event}`;
  if (event === "closed") {
    await notify([b.ownerId], { title: "Order placed", body: title, href }, key);
    await notify(joiners, { title: "Basket ordered", body: title, href }, `${key}:j`);
  } else if (event === "shipped") {
    await notify([b.ownerId, ...joiners], { title: "Basket on the way", body: title, href }, key);
  } else if (event === "delivered") {
    await notify(joiners, { title: "Collect from the basket owner", body: title, href }, key);
  } else {
    await notify(
      [b.ownerId, ...joiners],
      { title: "Basket cancelled", body: `${title} · refunded as tokens`, href },
      key,
    );
  }
}

/** The owner places the order once the basket holds enough items. */
export async function closeOwnBasket(ownerId: string, basketId: string): Promise<void> {
  await withOrderTransaction([ownerId], [], async (tx) => {
    const b = await ownerBasket(tx, ownerId, basketId);
    if (b.status !== "OPEN") throw new CheckoutError("This basket is already closed");
    if (await tx.order.count({ where: { targetBasketId: b.id, status: "PENDING" } }))
      throw new CheckoutError("Someone is paying to join. Try again in a few minutes");
    const { ownMinItems } = await getSettings(tx);
    if ((await basketItems(tx, b.id)) < ownMinItems)
      throw new CheckoutError(`The basket needs at least ${ownMinItems} items`);
    if (!(await closeBasket(tx, b.id, new Date())))
      throw new CheckoutError("This basket cannot be ordered yet");
  });
  await announceOwnBasket(basketId, "closed");
}

/** The owner confirms the courier delivered: WITH_COURIER -> DELIVERED, every paid order is
 * RECEIVED and its lines collected. There is no pickup code and no return (DEC-023). */
export async function confirmOwnDelivery(ownerId: string, basketId: string): Promise<void> {
  await withOrderTransaction([ownerId], [], async (tx) => {
    const b = await ownerBasket(tx, ownerId, basketId);
    if (b.status === "DELIVERED") return;
    if (!canMoveBasket(b.status, "DELIVERED"))
      throw new CheckoutError("The courier has not picked this basket up yet");
    const now = new Date();
    const orders = await tx.order.findMany({
      where: { basketId: b.id, status: "PAID" },
      select: { id: true, status: true },
      orderBy: { id: "asc" },
    });
    for (const o of orders) await tx.$queryRaw`SELECT 1 FROM "Order" WHERE id = ${o.id} FOR UPDATE`;
    for (const o of orders)
      if (!canMoveOrder(o.status, "RECEIVED")) throw new CheckoutError("Order cannot be received");
    await tx.basket.update({
      where: { id: b.id },
      data: { status: "DELIVERED", deliveredAt: now },
    });
    await tx.courierBooking.updateMany({ where: { basketId: b.id }, data: { receivedAt: now } });
    await tx.order.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: "RECEIVED", receivedAt: now },
    });
    await tx.orderLine.updateMany({
      where: { orderId: { in: orders.map((o) => o.id) }, status: "ACTIVE", collectedAt: null },
      data: { collectedAt: now },
    });
  });
  await announceOwnBasket(basketId, "delivered");
}

/** Sweep: an own basket past the maximum wait is ordered if it holds ownMinItems items;
 * otherwise it is cancelled and every buyer gets what they paid back as tokens. */
export async function sweepOwnBaskets(
  now: Date,
): Promise<{ ownClosed: number; ownCancelled: number }> {
  const { ownMaxWaitDays } = await getSettings();
  const cutoff = new Date(now.getTime() - ownMaxWaitDays * DAY_MS);
  let ownClosed = 0;
  let ownCancelled = 0;
  const waited = await db.basket.findMany({
    where: { kind: "OWN", status: "OPEN", firstOrderAt: { lte: cutoff } },
    select: {
      id: true,
      orders: { where: { status: "PAID" }, select: { id: true, buyerId: true } },
    },
    orderBy: { id: "asc" },
  });
  for (const b of waited)
    try {
      const result = await withOrderTransaction(
        b.orders.map((o) => o.buyerId),
        b.orders.map((o) => o.id),
        async (tx): Promise<"closed" | "cancelled" | null> => {
          await lockOwnBasket(tx, b.id);
          if (await closeBasket(tx, b.id, now)) return "closed";
          const row = await tx.basket.findUniqueOrThrow({ where: { id: b.id } });
          if (row.status !== "OPEN") return null;
          if (await tx.order.count({ where: { targetBasketId: b.id, status: "PENDING" } }))
            return null;
          const paid = await tx.order.findMany({
            where: { basketId: b.id, status: "PAID" },
            select: { id: true },
          });
          // A buyer who joined after the list was read is not locked: retry next sweep.
          if (paid.some((o) => !b.orders.some((x) => x.id === o.id))) return null;
          await tx.basket.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
          await cancelBasketOrders(tx, b.id, "Own basket cancelled: too few items");
          return "cancelled";
        },
      );
      if (result === "closed") ownClosed++;
      if (result === "cancelled") ownCancelled++;
      if (result) await announceOwnBasket(b.id, result);
    } catch (error) {
      console.error("Own basket sweep will retry", b.id, error);
    }
  return { ownClosed, ownCancelled };
}

const BASKET_CARD = {
  id: true,
  status: true,
  visibility: true,
  shareCode: true,
  deliveryArea: true,
  ownerId: true,
  firstOrderAt: true,
  kind: true,
  owner: { select: { name: true } },
  orders: { where: { status: "PAID" as const }, select: { lines: { select: { qty: true } } } },
} as const;

function itemCount(orders: { lines: { qty: number }[] }[]) {
  return orders.reduce((s, o) => s + o.lines.reduce((t, l) => t + l.qty, 0), 0);
}

/** Public own baskets for a product that can be joined now: area only, never the address. */
export async function publicOwnBaskets(productId: string) {
  const rows = await db.basket.findMany({
    where: {
      kind: "OWN",
      status: "OPEN",
      productId,
      visibility: "PUBLIC",
      firstOrderAt: { not: null },
    },
    select: BASKET_CARD,
    orderBy: { firstOrderAt: "asc" },
    take: 20,
  });
  return rows.map((b) => ({
    id: b.id,
    area: b.deliveryArea ?? "",
    owner: b.owner?.name ?? "",
    items: itemCount(b.orders),
  }));
}

/** One own basket as the viewer may see it, or null. The owner sees everything; anyone else sees
 * it only while it can be joined (public, or with the share code) or when they have an order in
 * it. The delivery address is shown to the owner only. */
export async function ownBasketView(
  basketId: string,
  viewerId: string | null,
  code: string | null,
) {
  if (typeof basketId !== "string") return null;
  const b = await db.basket.findUnique({
    where: { id: basketId },
    include: {
      owner: { select: { name: true } },
      product: {
        select: {
          id: true,
          title: true,
          price: true,
          status: true,
          photoKey: true,
          category: true,
          variants: {
            select: { id: true, size: true, colour: true, available: true },
            orderBy: { id: "asc" },
          },
        },
      },
      orders: {
        where: { status: { in: ["PAID", "RECEIVED"] } },
        select: {
          id: true,
          buyerId: true,
          buyer: { select: { name: true } },
          lines: { select: { qty: true, variant: { select: { size: true, colour: true } } } },
        },
        orderBy: { paidAt: "asc" },
      },
      courier: { select: { givenToDriverAt: true } },
    },
  });
  if (!b || b.kind !== "OWN" || !b.product) return null;
  const isOwner = !!viewerId && viewerId === b.ownerId;
  const hasOrder = !!viewerId && b.orders.some((o) => o.buyerId === viewerId);
  const canJoin = joinable(b, viewerId, code);
  if (!isOwner && !hasOrder && !canJoin) return null;
  return {
    id: b.id,
    status: b.status,
    isOwner,
    canJoin: canJoin && b.product.status === "LIVE",
    owner: b.owner?.name ?? "",
    area: b.deliveryArea ?? "",
    visibility: b.visibility,
    shareCode: isOwner ? b.shareCode : null,
    address: isOwner ? b.deliveryAddress : null,
    phone: isOwner ? b.deliveryPhone : null,
    minItems: (await getSettings()).ownMinItems,
    product: b.product,
    items: b.orders.reduce((s, o) => s + o.lines.reduce((t, l) => t + l.qty, 0), 0),
    // The owner sees who bought what, to hand items over; others see only their own.
    orders: b.orders
      .filter((o) => isOwner || o.buyerId === viewerId)
      .map((o) => ({
        id: o.id,
        buyer: o.buyer.name,
        mine: o.buyerId === viewerId,
        lines: o.lines.map((l) => ({ size: l.variant.size, colour: l.variant.colour, qty: l.qty })),
      })),
  };
}

/**
 * Everyone else in an own basket and what they bought, for a buyer who is in it (owner,
 * 2026-11-21). One row per buyer, owner first. The owner sees full names; anyone else sees first
 * names only. Empty unless the viewer has a paid order in the basket or owns it.
 */
export async function basketPeople(basketId: string, viewerId: string) {
  const b = await db.basket.findUnique({
    where: { id: basketId },
    select: {
      kind: true,
      ownerId: true,
      orders: {
        where: { status: { in: ["PAID", "RECEIVED"] } },
        select: {
          buyerId: true,
          buyer: { select: { name: true } },
          lines: {
            where: { status: "ACTIVE" },
            select: { qty: true, variant: { select: { size: true, colour: true } } },
          },
        },
        orderBy: { paidAt: "asc" },
      },
    },
  });
  if (!b || b.kind !== "OWN") return [];
  const isOwner = b.ownerId === viewerId;
  if (!isOwner && !b.orders.some((o) => o.buyerId === viewerId)) return [];
  const people = new Map<
    string,
    { name: string; owner: boolean; items: number; sizes: Map<string, number> }
  >();
  for (const o of b.orders) {
    if (o.buyerId === viewerId) continue;
    const name = isOwner ? o.buyer.name : (o.buyer.name.split(" ")[0] ?? o.buyer.name);
    const p = people.get(o.buyerId) ?? {
      name,
      owner: o.buyerId === b.ownerId,
      items: 0,
      sizes: new Map<string, number>(),
    };
    for (const l of o.lines) {
      const key = [l.variant.size, l.variant.colour].filter(Boolean).join(" · ");
      p.sizes.set(key, (p.sizes.get(key) ?? 0) + l.qty);
      p.items += l.qty;
    }
    people.set(o.buyerId, p);
  }
  return [...people.entries()]
    .map(([id, p]) => ({
      id,
      name: p.name,
      owner: p.owner,
      items: p.items,
      sizes: [...p.sizes].map(([size, qty]) => ({ size, qty })),
    }))
    .sort((a, c) => Number(c.owner) - Number(a.owner));
}
