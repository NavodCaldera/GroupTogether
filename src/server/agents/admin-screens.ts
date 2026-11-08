import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { distanceKm } from "@/lib/distance";
import { db } from "../db";
import { getSettings } from "../settings";
import { ACTIVE_STATUSES, requireAgentsAdmin } from "./common";

const DAY_MS = 86_400_000;
const MISMATCH_OUTCOMES = ["AMOUNT_MISMATCH", "CURRENCY_MISMATCH", "UNKNOWN_ATTEMPT"];

const agentLabel = { select: { address: true, city: true, user: { select: { name: true } } } };
const factoryLabel = { select: { name: true, company: true } };

/** PACKED baskets waiting for the admin to book (or re-book) a courier, oldest lock first. */
export async function courierToBook(adminId: string) {
  await requireAgentsAdmin(adminId);
  const baskets = await db.basket.findMany({
    where: { status: "PACKED" },
    orderBy: { lockedAt: "asc" },
    select: {
      id: true,
      total: true,
      lockedAt: true,
      agent: agentLabel,
      factory: factoryLabel,
      courier: { select: { fee: true, driverName: true, driverPhone: true, vehicleNo: true } },
      orders: {
        where: { status: "PAID" },
        select: { lines: { where: { status: "ACTIVE" }, select: { qty: true, missingQty: true } } },
      },
    },
  });
  return baskets.map(({ orders, ...b }) => ({
    ...b,
    pieces: orders.reduce(
      (n, o) => n + o.lines.reduce((m, l) => m + Math.max(l.qty - l.missingQty, 0), 0),
      0,
    ),
  }));
}

/** Late payments credited as tokens, and gateway notices that did not match. */
export async function paymentProblems(adminId: string) {
  await requireAgentsAdmin(adminId);
  const payer = { select: { name: true, phone: true } };
  const [late, mismatched] = await Promise.all([
    db.paymentAttempt.findMany({
      where: { status: "LATE_PAID" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        purpose: true,
        amount: true,
        createdAt: true,
        buyer: payer,
        agent: { select: { user: payer } },
      },
    }),
    db.paymentEvent.findMany({
      where: { OR: MISMATCH_OUTCOMES.map((o) => ({ outcome: { equals: o } })) },
      orderBy: { verifiedAt: "desc" },
      take: 50,
      select: {
        id: true,
        outcome: true,
        verifiedAt: true,
        attempt: {
          select: { amount: true, buyer: payer, agent: { select: { user: payer } } },
        },
      },
    }),
  ]);
  return { late, mismatched };
}

/** APPLIED agents with their nearest active agent, and APPROVED ones waiting on the deposit. */
export async function agentApplications(adminId: string) {
  await requireAgentsAdmin(adminId);
  const [{ agentGapM }, applied, approved, active] = await Promise.all([
    getSettings(),
    db.agent.findMany({
      where: { status: "APPLIED" },
      orderBy: { updatedAt: "asc" },
      select: {
        id: true,
        lat: true,
        lng: true,
        address: true,
        city: true,
        storagePhotoKeys: true,
        updatedAt: true,
        user: { select: { name: true, phone: true, email: true } },
      },
    }),
    db.agent.findMany({
      where: { status: "APPROVED" },
      orderBy: { updatedAt: "asc" },
      select: { id: true, address: true, updatedAt: true, user: { select: { name: true } } },
    }),
    db.agent.findMany({
      where: { status: { in: ACTIVE_STATUSES } },
      select: { id: true, lat: true, lng: true, user: { select: { name: true } } },
    }),
  ]);
  return {
    agentGapM,
    approved,
    applied: applied.map(({ storagePhotoKeys, ...a }) => {
      const nearest = active
        .filter((o) => o.id !== a.id)
        .map((o) => ({ name: o.user.name, km: distanceKm(a, o) }))
        .sort((x, y) => x.km - y.km)[0];
      return {
        ...a,
        storagePhotos: storagePhotoKeys.length,
        nearest: nearest ?? null,
        clash: !!nearest && nearest.km * 1000 < agentGapM,
      };
    }),
  };
}

/** Agents holding a deposit, with the losses recorded against it. */
export async function agentDeposits(adminId: string) {
  await requireAgentsAdmin(adminId);
  return db.agent.findMany({
    where: { status: { in: ["LIVE", "SUSPENDED", "LEAVING"] } },
    orderBy: { user: { name: "asc" } },
    select: {
      id: true,
      status: true,
      address: true,
      depositAmount: true,
      lossAmount: true,
      statusNote: true,
      user: { select: { name: true, phone: true } },
      losses: {
        orderBy: { createdAt: "desc" },
        select: { id: true, amount: true, reason: true, createdAt: true },
      },
    },
  });
}

/** OPEN baskets with a paid order, oldest first, with the days since their first order. */
export async function oldOpenBaskets(adminId: string, now = new Date()) {
  await requireAgentsAdmin(adminId);
  const [{ maxWaitDays }, baskets] = await Promise.all([
    getSettings(),
    db.basket.findMany({
      where: { status: "OPEN", firstOrderAt: { not: null } },
      orderBy: { firstOrderAt: "asc" },
      take: 100,
      select: {
        id: true,
        total: true,
        firstOrderAt: true,
        agent: agentLabel,
        factory: factoryLabel,
      },
    }),
  ]);
  return {
    maxWaitDays,
    baskets: baskets.map((b) => ({
      ...b,
      days: Math.floor((now.getTime() - b.firstOrderAt!.getTime()) / DAY_MS),
    })),
  };
}

/** Orders by order id, basket id, pickup code or buyer phone. */
export async function searchOrders(adminId: string, raw: string) {
  await requireAgentsAdmin(adminId);
  const q = raw.trim();
  if (q.length < 3) return [];
  const digits = q.replace(/\D/g, "");
  const or: Prisma.OrderWhereInput[] = [{ id: q }, { basketId: q }];
  if (/^\d{6}$/.test(q)) {
    const codes = await db.pickupCode.findMany({
      where: { code: q },
      select: { buyerId: true, agentId: true },
    });
    for (const c of codes) or.push({ buyerId: c.buyerId, agentId: c.agentId });
  }
  if (digits.length >= 6) or.push({ buyer: { phone: { contains: digits } } });
  return db.order.findMany({
    where: { OR: or, status: { not: "PENDING" } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      itemsTotal: true,
      paidAt: true,
      buyer: { select: { name: true, phone: true } },
      agent: agentLabel,
      factory: factoryLabel,
      basket: { select: { id: true, status: true } },
      lines: {
        select: {
          id: true,
          qty: true,
          missingQty: true,
          returnedQty: true,
          collectedAt: true,
          variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
        },
      },
    },
  });
}

/** An application photo for the Agents and orders admin: "nic", "photo" or "s<index>". */
export async function agentPhotoFor(userId: string, agentId: string, which: string) {
  try {
    await requireAgentsAdmin(userId);
  } catch {
    return null;
  }
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { nicKey: true, photoKey: true, storagePhotoKeys: true },
  });
  if (!agent) return null;
  const m = which.match(/^s(\d{1,2})$/);
  const key =
    which === "nic"
      ? agent.nicKey
      : which === "photo"
        ? agent.photoKey
        : m
          ? agent.storagePhotoKeys[Number(m[1])]
          : null;
  return key ?? null;
}
