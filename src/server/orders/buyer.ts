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
      lockedAt: true,
      deliveredAt: true,
      courier: { select: { givenToDriverAt: true } },
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
      variantLabel: true,
      variant: {
        select: {
          options: true,
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

/** Pickup codes ready at each agent: pieces and the cash agent fee to bring (DEC-019). One code
 * per buyer and agent covers every uncollected item there, whatever the order. */
async function readyPickups(buyerId: string, now: Date) {
  const waiting = await db.orderLine.findMany({
    where: { collectedAt: null, status: "ACTIVE", order: { buyerId, status: "RECEIVED" } },
    select: {
      qty: true,
      missingQty: true,
      cashFeeEach: true,
      order: { select: { agentId: true } },
    },
  });
  const pieces = new Map<string, number>();
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
  if (!agentIds.length) return [];
  const [codes, agents] = await Promise.all([
    db.pickupCode.findMany({
      where: { buyerId, agentId: { in: agentIds } },
      select: { agentId: true, code: true },
    }),
    db.agent.findMany({ where: { id: { in: agentIds } }, select: agentSelect }),
  ]);
  return agentIds.flatMap((id) => {
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
}

/** The buyer home: codes ready to collect and returns to hand over. */
export async function buyerHome(buyerId: string, now = new Date()) {
  await assertBuyerAccount(buyerId);
  const [ready, handovers] = await Promise.all([
    readyPickups(buyerId, now),
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
  return { ready, handovers };
}

export async function buyerOrders(buyerId: string) {
  await assertBuyerAccount(buyerId);
  const [orders, settings] = await Promise.all([
    // Orders never paid are not the buyer's orders (DEC-026).
    db.order.findMany({
      where: { buyerId, paidAt: { not: null } },
      select: orderSelect,
      orderBy: { createdAt: "desc" },
    }),
    getSettings(),
  ]);
  return {
    orders,
    own: await ownProgress(orders),
    ownMinItems: settings.ownMinItems,
    lockAt: toD(settings.basketLockAmount),
  };
}

export type OwnProgress = Map<string, { items: number }>;

/** Open own baskets on order cards: items so far (DEC-023). */
async function ownProgress(
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
  const lines = await db.orderLine.findMany({
    where: { status: "ACTIVE", order: { basketId: { in: openOwn }, status: "PAID" } },
    select: { qty: true, order: { select: { basketId: true } } },
  });
  return new Map(
    openOwn.map((id) => [
      id,
      {
        items: lines.reduce((n, l) => (l.order.basketId === id ? n + l.qty : n), 0),
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
      agent: { select: agentSelect },
      productRatings: { select: { productId: true, stars: true } },
      basket: {
        select: {
          ...orderSelect.basket.select,
          deliveryArea: true,
          deliveryAddress: true,
          deliveryPhone: true,
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
  const [settings, own, ready] = await Promise.all([
    getSettings(),
    ownProgress([order]),
    order.agentId &&
    order.status === "RECEIVED" &&
    order.lines.some((l) => l.status === "ACTIVE" && !l.collectedAt && l.qty > l.missingQty)
      ? readyPickups(buyerId, now)
      : [],
  ]);
  // The code at this order's agent, with every piece waiting there and the cash fee for them.
  const pickup = ready.find((r) => r.agent.id === order.agentId) ?? null;
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
    lockAt: toD(settings.basketLockAmount),
    own,
    ownMinItems: settings.ownMinItems,
    pickup,
  };
}

export async function tokenHistory(userId: string) {
  await assertBuyerAccount(userId);
  const [balance, rows] = await Promise.all([
    tokenBalance(userId),
    db.tokenEntry.findMany({
      where: { userId, NOT: { amount: new D(0).toFixed(2) } },
      select: {
        id: true,
        amount: true,
        kind: true,
        note: true,
        createdAt: true,
        orderId: true,
        counterpartyId: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  // Transfers name the other person; only their name is read.
  const ids = [...new Set(rows.flatMap((r) => (r.counterpartyId ? [r.counterpartyId] : [])))];
  const people = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(people.map((p) => [p.id, p.name]));
  const entries = rows.map(({ counterpartyId, ...r }) => ({
    ...r,
    counterparty: counterpartyId ? (names.get(counterpartyId) ?? null) : null,
  }));
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
