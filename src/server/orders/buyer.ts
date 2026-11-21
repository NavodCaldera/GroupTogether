import "server-only";
import { D, toD } from "@/lib/decimal";
import { openNow } from "@/lib/agent-rules";
import { db } from "../db";
import { getSettings } from "../settings";
import { tokenBalance } from "../tokens";
import { assertBuyer } from "./checkout";

/** Buyer screens read only the signed-in buyer's own rows; the shared buy gate refuses anyone else. */
const assertBuyerAccount = (userId: string) => assertBuyer(db, userId);

const agentSelect = {
  id: true,
  lat: true,
  lng: true,
  address: true,
  city: true,
  user: { select: { name: true } },
  hours: {
    select: { weekday: true, opensAt: true, closesAt: true },
    orderBy: { weekday: "asc" as const },
  },
};

const orderSelect = {
  id: true,
  status: true,
  createdAt: true,
  paidAt: true,
  receivedAt: true,
  itemsTotal: true,
  courierTotal: true,
  agentFeeTotal: true,
  tokensApplied: true,
  gatewayFee: true,
  amountDue: true,
  agentId: true,
  agent: { select: { user: { select: { name: true } } } },
  factory: { select: { name: true, company: true } },
  basket: {
    select: {
      id: true,
      status: true,
      total: true,
      kind: true,
      ownerId: true,
      owner: { select: { name: true } },
    },
  },
  lines: {
    select: {
      id: true,
      qty: true,
      status: true,
      collectedAt: true,
      unitPrice: true,
      factoryPrice: true,
      returnedQty: true,
      missingQty: true,
      cashFeeEach: true,
      cashFeePaid: true,
      variant: {
        select: {
          size: true,
          colour: true,
          product: { select: { id: true, title: true, photoKey: true, category: true } },
        },
      },
    },
    orderBy: { id: "asc" as const },
  },
};

export type LineState = "Unpaid" | "Paid" | "Cancelled" | "Received" | "Collected";

export function lineState(
  order: { status: string },
  line: { status: string; collectedAt: Date | null },
): LineState {
  if (order.status === "CANCELLED" || line.status === "CANCELLED") return "Cancelled";
  if (line.collectedAt) return "Collected";
  if (order.status === "RECEIVED") return "Received";
  if (order.status === "PAID") return "Paid";
  return "Unpaid";
}

/** What the buyer pays in all for an order: tokens plus the online amount. */
export function orderTotal(o: {
  tokensApplied: { toString(): string };
  amountDue: { toString(): string };
}) {
  return toD(o.tokensApplied).plus(toD(o.amountDue));
}

/** The buyer home: codes ready to collect and returns to hand over. */
export async function buyerHome(buyerId: string, now = new Date()) {
  await assertBuyerAccount(buyerId);
  const [waiting, handovers] = await Promise.all([
    db.orderLine.findMany({
      where: { collectedAt: null, status: "ACTIVE", order: { buyerId, status: "RECEIVED" } },
      select: {
        qty: true,
        missingQty: true,
        cashFeeEach: true,
        order: { select: { agentId: true } },
      },
    }),
    db.returnRequest.findMany({
      where: { buyerId, status: "AWAITING_HANDOVER" },
      select: {
        id: true,
        qty: true,
        handoverDueAt: true,
        handoverAgent: { select: { address: true, city: true, user: { select: { name: true } } } },
        orderLine: {
          select: { orderId: true, variant: { select: { product: { select: { title: true } } } } },
        },
      },
      orderBy: { handoverDueAt: "asc" },
    }),
  ]);
  const pieces = new Map<string, number>();
  // The cash agent fee the buyer brings to each agent (DEC-019).
  const fees = new Map<string, D>();
  for (const l of waiting) {
    const qty = l.qty - l.missingQty;
    // Own-basket orders have no agent and no pickup code (DEC-023).
    if (qty <= 0 || !l.order.agentId) continue;
    pieces.set(l.order.agentId, (pieces.get(l.order.agentId) ?? 0) + qty);
    fees.set(
      l.order.agentId,
      (fees.get(l.order.agentId) ?? new D(0)).plus(toD(l.cashFeeEach).times(qty)),
    );
  }
  const agentIds = [...pieces.keys()].sort();
  const [codes, agents] = await Promise.all([
    db.pickupCode.findMany({
      where: { buyerId, agentId: { in: agentIds } },
      select: { agentId: true, code: true },
    }),
    db.agent.findMany({ where: { id: { in: agentIds } }, select: agentSelect }),
  ]);
  const ready = agentIds.flatMap((id) => {
    const code = codes.find((c) => c.agentId === id)?.code;
    const agent = agents.find((a) => a.id === id);
    if (!code || !agent) return [];
    return [
      {
        code,
        pieces: pieces.get(id) ?? 0,
        fee: fees.get(id) ?? new D(0),
        agent,
        open: openNow(agent.hours, now),
      },
    ];
  });
  return { ready, handovers };
}

export async function buyerOrders(buyerId: string) {
  await assertBuyerAccount(buyerId);
  const [orders, settings] = await Promise.all([
    db.order.findMany({ where: { buyerId }, select: orderSelect, orderBy: { createdAt: "desc" } }),
    getSettings(),
  ]);
  return {
    orders,
    own: await ownProgress(buyerId, orders),
    ownMinItems: settings.ownMinItems,
    lockAt: toD(settings.basketLockAmount),
  };
}

export type OwnProgress = Map<string, { items: number; shareCode: string | null }>;

/** Open own baskets on order cards: items so far, and the share link for the owner (DEC-023). */
async function ownProgress(
  buyerId: string,
  orders: { basket: { id: string; kind: string; status: string } | null }[],
): Promise<OwnProgress> {
  const openOwn = [
    ...new Set(
      orders.flatMap((o) =>
        o.basket?.kind === "OWN" && o.basket.status === "OPEN" ? [o.basket.id] : [],
      ),
    ),
  ];
  if (!openOwn.length) return new Map();
  const [lines, shares] = await Promise.all([
    db.orderLine.findMany({
      where: { order: { basketId: { in: openOwn }, status: "PAID" } },
      select: { qty: true, order: { select: { basketId: true } } },
    }),
    db.basket.findMany({
      where: { id: { in: openOwn }, ownerId: buyerId },
      select: { id: true, shareCode: true },
    }),
  ]);
  return new Map(
    openOwn.map((id) => [
      id,
      {
        items: lines.reduce((n, l) => (l.order.basketId === id ? n + l.qty : n), 0),
        shareCode: shares.find((b) => b.id === id)?.shareCode ?? null,
      },
    ]),
  );
}

/** One of the buyer's own orders, with its returns, ratings and the return window. */
export async function buyerOrder(buyerId: string, orderId: string, now = new Date()) {
  await assertBuyerAccount(buyerId);
  const order = await db.order.findFirst({
    where: { id: orderId, buyerId },
    select: {
      ...orderSelect,
      agent: {
        select: {
          address: true,
          city: true,
          lat: true,
          lng: true,
          user: { select: { name: true } },
        },
      },
      productRatings: { select: { productId: true, stars: true } },
      basket: {
        select: {
          ...orderSelect.basket.select,
          lockedAt: true,
          deliveredAt: true,
          deliveryArea: true,
          deliveryAddress: true,
          deliveryPhone: true,
          owner: { select: { name: true } },
        },
      },
    },
  });
  if (!order) return null;
  // The delivery address and phone are the owner's own (DEC-023).
  if (order.basket && order.basket.ownerId !== buyerId) {
    order.basket.deliveryAddress = null;
    order.basket.deliveryPhone = null;
  }
  const [settings, own] = await Promise.all([getSettings(), ownProgress(buyerId, [order])]);
  const returnUntil = order.receivedAt
    ? new Date(order.receivedAt.getTime() + settings.collectHours * 3600_000)
    : null;
  // Own baskets have no returns (DEC-023).
  const canReturn =
    !!order.agentId &&
    order.status === "RECEIVED" &&
    !!returnUntil &&
    now.getTime() <= returnUntil.getTime();
  return {
    order,
    returnUntil,
    canReturn,
    canCancel:
      order.status === "PAID" &&
      order.basket?.status === "OPEN" &&
      !(order.basket.kind === "OWN" && order.basket.ownerId === buyerId),
    lockAt: toD(settings.basketLockAmount),
    own,
    ownMinItems: settings.ownMinItems,
  };
}

export async function tokenHistory(userId: string) {
  await assertBuyerAccount(userId);
  const [balance, entries] = await Promise.all([
    tokenBalance(userId),
    db.tokenEntry.findMany({
      where: { userId, NOT: { amount: new D(0).toFixed(2) } },
      select: { id: true, amount: true, kind: true, note: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  return { balance, entries };
}

/** The buyer's saved map pin, or null. */
export async function buyerPin(buyerId: string) {
  await assertBuyerAccount(buyerId);
  const user = await db.user.findUniqueOrThrow({
    where: { id: buyerId },
    select: { lat: true, lng: true },
  });
  return user.lat != null && user.lng != null ? { lat: user.lat, lng: user.lng } : null;
}
