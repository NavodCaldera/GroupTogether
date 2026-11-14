import "server-only";
import { D, toD } from "@/lib/decimal";
import { db } from "../db";
import { getSettings } from "../settings";
import { tokenBalance } from "../tokens";

/** Reads for the agent's own screens. Every query is scoped to the caller's agent row. */

const factoryName = (f: { company: string | null; name: string }) => f.company ?? f.name;

/** WITH_COURIER baskets on their way to this agent, with the booked courier and the held returns
 * that may go back to that factory in the same trip. */
export async function arriving(agentId: string) {
  const baskets = await db.basket.findMany({
    where: { agentId, status: "WITH_COURIER" },
    select: {
      id: true,
      factoryId: true,
      factory: { select: { company: true, name: true } },
      courier: {
        select: { driverName: true, driverPhone: true, vehicleNo: true, fee: true },
      },
      _count: { select: { orders: { where: { status: "PAID" } } } },
    },
    orderBy: { lockedAt: "asc" },
  });
  const held = await heldReturns(agentId);
  return baskets.map((b) => ({
    id: b.id,
    factory: factoryName(b.factory),
    courier: b.courier,
    orders: b._count.orders,
    returns: held.filter((r) => r.factoryId === b.factoryId),
  }));
}

/** Returns the agent took from buyers that still wait for a courier back to the factory. */
export async function heldReturns(agentId: string) {
  const rows = await db.returnRequest.findMany({
    where: { handoverAgentId: agentId, status: "HANDED_OVER" },
    select: {
      id: true,
      qty: true,
      factoryId: true,
      handedOverAt: true,
      orderLine: {
        select: { variant: { select: { size: true, product: { select: { title: true } } } } },
      },
    },
    orderBy: { handedOverAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    qty: r.qty,
    factoryId: r.factoryId,
    handedOverAt: r.handedOverAt,
    item: r.orderLine
      ? `${r.orderLine.variant.product.title} · ${r.orderLine.variant.size}`
      : "Item",
  }));
}

/** Buyers with parcels at this agent not yet collected, oldest arrival first. */
export async function waitingForPickup(agentId: string) {
  const lines = await db.orderLine.findMany({
    where: { collectedAt: null, status: "ACTIVE", order: { agentId, status: "RECEIVED" } },
    select: {
      qty: true,
      missingQty: true,
      agentFeeEach: true,
      order: {
        select: { buyerId: true, receivedAt: true, buyer: { select: { name: true } } },
      },
    },
  });
  const byBuyer = new Map<
    string,
    { buyerId: string; name: string; items: number; fee: D; receivedAt: Date | null }
  >();
  for (const l of lines) {
    const qty = l.qty - l.missingQty;
    if (qty <= 0) continue;
    const row = byBuyer.get(l.order.buyerId) ?? {
      buyerId: l.order.buyerId,
      name: l.order.buyer.name,
      items: 0,
      fee: new D(0),
      receivedAt: l.order.receivedAt,
    };
    row.items += qty;
    row.fee = row.fee.plus(toD(l.agentFeeEach).times(qty));
    if (l.order.receivedAt && (!row.receivedAt || l.order.receivedAt < row.receivedAt))
      row.receivedAt = l.order.receivedAt;
    byBuyer.set(l.order.buyerId, row);
  }
  return [...byBuyer.values()].sort(
    (a, b) => (a.receivedAt?.getTime() ?? 0) - (b.receivedAt?.getTime() ?? 0),
  );
}

/** Accepted returns a buyer is to hand to this agent, soonest deadline first. */
export async function returnsToCollect(agentId: string) {
  const rows = await db.returnRequest.findMany({
    where: { handoverAgentId: agentId, status: "AWAITING_HANDOVER" },
    select: {
      id: true,
      qty: true,
      fault: true,
      handoverDueAt: true,
      buyerId: true,
      orderLine: {
        select: {
          variant: {
            select: { size: true, colour: true, product: { select: { title: true } } },
          },
        },
      },
    },
    orderBy: { handoverDueAt: "asc" },
  });
  const buyers = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.buyerId))] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(buyers.map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    id: r.id,
    qty: r.qty,
    fault: r.fault,
    dueAt: r.handoverDueAt,
    buyer: nameOf.get(r.buyerId) ?? "",
    item: r.orderLine
      ? [r.orderLine.variant.product.title, r.orderLine.variant.size, r.orderLine.variant.colour]
          .filter(Boolean)
          .join(" · ")
      : "Item",
  }));
}

/** Buyer-fault items this agent holds for resale (DEC-017). The agent sells at the price the
 * buyer paid, keeps the commission share and gives the buyer the factory price; only for these
 * items does the agent see prices (DATA-001 exception). */
export async function resaleItems(agentId: string) {
  const rows = await db.returnRequest.findMany({
    where: { handoverAgentId: agentId, status: "WITH_AGENT", fault: "BUYER" },
    select: {
      id: true,
      qty: true,
      buyerId: true,
      handedOverAt: true,
      orderLine: {
        select: {
          unitPrice: true,
          factoryPrice: true,
          variant: {
            select: { size: true, colour: true, product: { select: { title: true } } },
          },
        },
      },
    },
    orderBy: { handedOverAt: "asc" },
  });
  const buyers = await db.user.findMany({
    where: { id: { in: [...new Set(rows.map((r) => r.buyerId))] } },
    select: { id: true, name: true },
  });
  const nameOf = new Map(buyers.map((b) => [b.id, b.name]));
  return rows.map((r) => ({
    id: r.id,
    qty: r.qty,
    buyer: nameOf.get(r.buyerId) ?? "",
    item: [
      r.orderLine!.variant.product.title,
      r.orderLine!.variant.size,
      r.orderLine!.variant.colour,
    ]
      .filter(Boolean)
      .join(" · "),
    price: toD(r.orderLine!.unitPrice).times(r.qty),
    buyerShare: toD(r.orderLine!.factoryPrice).times(r.qty),
  }));
}

/** OPEN baskets with their fill against the lock amount and the maximum-wait deadline, then the
 * locked and packed ones still at the factory. */
export async function basketsFilling(agentId: string) {
  const [settings, rows] = await Promise.all([
    getSettings(),
    db.basket.findMany({
      where: {
        agentId,
        status: { in: ["OPEN", "LOCKED", "PACKED"] },
        orders: { some: { status: "PAID" } },
      },
      select: {
        id: true,
        status: true,
        total: true,
        firstOrderAt: true,
        factory: { select: { company: true, name: true } },
      },
      orderBy: [{ status: "asc" }, { firstOrderAt: "asc" }],
    }),
  ]);
  const lockAt = toD(settings.basketLockAmount);
  return {
    lockAt,
    baskets: rows.map((b) => ({
      id: b.id,
      status: b.status,
      factory: factoryName(b.factory),
      total: toD(b.total),
      shipsBy:
        b.status === "OPEN" && b.firstOrderAt
          ? new Date(b.firstOrderAt.getTime() + settings.maxWaitDays * 86_400_000)
          : null,
    })),
  };
}

/** The agent's token figures: balance, fee earnings, courier repayments and the deposit. */
export async function agentTokens(agent: { id: string; userId: string }) {
  const [balance, sums, row, entries] = await Promise.all([
    tokenBalance(agent.userId),
    db.tokenEntry.groupBy({
      by: ["kind"],
      where: { userId: agent.userId, kind: { in: ["AGENT_FEE", "COURIER_REPAY"] } },
      _sum: { amount: true },
    }),
    db.agent.findUniqueOrThrow({
      where: { id: agent.id },
      select: { depositAmount: true, depositPaidAt: true, lossAmount: true, status: true },
    }),
    db.tokenEntry.findMany({
      where: { userId: agent.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: { id: true, amount: true, note: true, createdAt: true },
    }),
  ]);
  const sum = (kind: string) => {
    const s = sums.find((x) => x.kind === kind)?._sum.amount;
    return s == null ? new D(0) : toD(s);
  };
  return {
    balance,
    fees: sum("AGENT_FEE"),
    courier: sum("COURIER_REPAY"),
    deposit: toD(row.depositAmount),
    depositPaidAt: row.depositPaidAt,
    losses: toD(row.lossAmount),
    status: row.status,
    entries,
  };
}

/** The signed-in user's own agent application, if any, with the deposit due when approved. */
export async function myApplication(userId: string) {
  const agent = await db.agent.findUnique({
    where: { userId },
    select: { id: true, status: true, statusNote: true, address: true, city: true },
  });
  return agent;
}
