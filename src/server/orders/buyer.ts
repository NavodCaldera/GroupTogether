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
  basket: { select: { id: true, status: true, total: true } },
  lines: {
    select: {
      id: true,
      qty: true,
      status: true,
      collectedAt: true,
      unitPrice: true,
      returnedQty: true,
      missingQty: true,
      variant: {
        select: {
          size: true,
          colour: true,
          product: { select: { id: true, title: true } },
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

/** The buyer home: codes ready to collect, returns to hand over, orders and the token balance. */
export async function buyerHome(buyerId: string, now = new Date()) {
  await assertBuyerAccount(buyerId);
  const settings = await getSettings();
  const [waiting, handovers, orders, balance] = await Promise.all([
    db.orderLine.findMany({
      where: { collectedAt: null, status: "ACTIVE", order: { buyerId, status: "RECEIVED" } },
      select: { qty: true, missingQty: true, order: { select: { agentId: true } } },
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
    db.order.findMany({
      where: { buyerId, status: { in: ["PENDING", "PAID", "RECEIVED"] } },
      select: orderSelect,
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    tokenBalance(buyerId),
  ]);
  const pieces = new Map<string, number>();
  for (const l of waiting)
    if (l.qty - l.missingQty > 0)
      pieces.set(l.order.agentId, (pieces.get(l.order.agentId) ?? 0) + l.qty - l.missingQty);
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
    return [{ code, pieces: pieces.get(id) ?? 0, agent, open: openNow(agent.hours, now) }];
  });
  return { ready, handovers, orders, balance, lockAt: toD(settings.basketLockAmount) };
}

export async function buyerOrders(buyerId: string) {
  await assertBuyerAccount(buyerId);
  const [orders, settings] = await Promise.all([
    db.order.findMany({ where: { buyerId }, select: orderSelect, orderBy: { createdAt: "desc" } }),
    getSettings(),
  ]);
  return { orders, lockAt: toD(settings.basketLockAmount) };
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
    },
  });
  if (!order) return null;
  const settings = await getSettings();
  const returnUntil = order.receivedAt
    ? new Date(order.receivedAt.getTime() + settings.collectHours * 3600_000)
    : null;
  const canReturn =
    order.status === "RECEIVED" && !!returnUntil && now.getTime() <= returnUntil.getTime();
  return {
    order,
    returnUntil,
    canReturn,
    canCancel: order.status === "PAID" && order.basket?.status === "OPEN",
    lockAt: toD(settings.basketLockAmount),
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
