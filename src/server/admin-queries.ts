import "server-only";
import type { CartStatus, Prisma } from "@/generated/prisma/client";
import { HOLDS_STOCK, STATUS_LABEL, addHours } from "@/lib/cart-rules";
import { toD } from "@/lib/decimal";
import { colomboDayStart, formatLKR } from "@/lib/format";
import { IN_SHOP } from "./catalogue";
import { db } from "./db";

/** Carts whose slip was approved. Sales figures count these, by when they were confirmed. */
export const PAID: CartStatus[] = ["CONFIRMED", "DISPATCHED", "DELIVERED"];

/** Free stock at or below this shows as low. */
export const LOW_STOCK = 2;

async function salesSince(from: Date) {
  const r = await db.groupCart.aggregate({
    where: { status: { in: PAID }, confirmedAt: { gte: from } },
    _sum: { total: true },
    _count: { _all: true },
  });
  return { orders: r._count._all, total: toD(r._sum.total ?? 0) };
}

/** Confirmed sales per Colombo day for the last `days` days, oldest first (empty days are 0). */
export async function dailySales(now = new Date(), days = 14) {
  const from = colomboDayStart(now, days - 1);
  const carts = await db.groupCart.findMany({
    where: { status: { in: PAID }, confirmedAt: { gte: from } },
    select: { confirmedAt: true, total: true },
  });
  const out = Array.from({ length: days }, (_, i) => ({
    day: colomboDayStart(now, days - 1 - i),
    total: toD(0),
    orders: 0,
  }));
  for (const c of carts) {
    const i = Math.floor((colomboDayStart(c.confirmedAt!).getTime() - from.getTime()) / 86_400_000);
    if (out[i]) {
      out[i].total = out[i].total.plus(toD(c.total));
      out[i].orders++;
    }
  }
  return out;
}

/** Everything on the admin overview, in one round of parallel queries. */
export async function overviewStats(now = new Date()) {
  const [
    byStatus,
    pendingSlips,
    toBook,
    lowStockCount,
    today,
    week,
    month,
    locked,
    customers,
    newCustomers,
    slipsDue,
    expiringSoon,
    lowStock,
    bestSellerRows,
    recentOrders,
  ] = await Promise.all([
    db.groupCart.groupBy({ by: ["status"], _count: true }),
    db.paymentSlip.count({ where: { status: "PENDING" } }),
    db.groupCart.count({ where: { status: "CONFIRMED", delivery: { is: null } } }),
    db.variant.count({ where: { available: { lte: LOW_STOCK }, product: IN_SHOP } }),
    salesSince(colomboDayStart(now)),
    salesSince(colomboDayStart(now, 6)),
    salesSince(colomboDayStart(now, 29)),
    db.groupCart.aggregate({
      where: { status: { in: [...HOLDS_STOCK] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.user.count({ where: { role: "CUSTOMER", createdAt: { gte: colomboDayStart(now, 6) } } }),
    db.groupCart.findMany({
      where: { status: "AWAITING_SLIP" },
      select: { code: true, total: true, slipDueAt: true, owner: { select: { name: true } } },
      orderBy: { slipDueAt: "asc" },
      take: 5,
    }),
    db.groupCart.findMany({
      where: { status: { in: ["OPEN", "READY"] }, expiresAt: { lte: addHours(now, 6) } },
      select: {
        code: true,
        name: true,
        status: true,
        total: true,
        minOrderValue: true,
        expiresAt: true,
      },
      orderBy: { expiresAt: "asc" },
      take: 5,
    }),
    db.variant.findMany({
      where: { available: { lte: LOW_STOCK }, product: IN_SHOP },
      select: {
        size: true,
        colour: true,
        available: true,
        reserved: true,
        product: { select: { id: true, brand: true, title: true } },
      },
      orderBy: [{ available: "asc" }, { reserved: "desc" }],
      take: 8,
    }),
    db.variant.groupBy({
      by: ["productId"],
      _sum: { sold: true },
      where: { sold: { gt: 0 } },
      orderBy: { _sum: { sold: "desc" } },
      take: 5,
    }),
    db.groupCart.findMany({
      where: { status: { in: PAID } },
      select: {
        code: true,
        status: true,
        total: true,
        confirmedAt: true,
        owner: { select: { name: true } },
      },
      orderBy: { confirmedAt: "desc" },
      take: 5,
    }),
  ]);

  const products = await db.product.findMany({
    where: { id: { in: bestSellerRows.map((b) => b.productId) } },
    select: { id: true, brand: true, title: true },
  });
  const bestSellers = bestSellerRows.map((b) => ({
    product: products.find((p) => p.id === b.productId),
    sold: b._sum.sold ?? 0,
  }));

  const count = (s: CartStatus) => byStatus.find((b) => b.status === s)?._count ?? 0;
  return {
    count,
    pendingSlips,
    toBook,
    lowStockCount,
    sales: { today, week, month },
    locked: { carts: locked._count._all, total: toD(locked._sum.total ?? 0) },
    customers,
    newCustomers,
    slipsDue,
    expiringSoon,
    lowStock,
    bestSellers,
    recentOrders,
  };
}

/** The admin carts search: part of the code, cart name, owner name, email or mobile. */
export function cartSearch(q: string): Prisma.GroupCartWhereInput {
  return {
    OR: [
      { code: { contains: q, mode: "insensitive" } },
      { name: { contains: q, mode: "insensitive" } },
      { owner: { name: { contains: q, mode: "insensitive" } } },
      { owner: { email: { contains: q, mode: "insensitive" } } },
      { owner: { phone: { contains: q.replace(/[\s-]/g, "").replace(/^\+94/, "0") } } },
    ],
  };
}

/** Up to 6 carts for the search dropdown while typing: codes starting with it first, then newest. */
export async function suggestCarts(q: string) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await db.groupCart.findMany({
    where: cartSearch(term),
    select: { code: true, status: true, total: true, owner: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const starts = (c: string) => (c.startsWith(term.toUpperCase()) ? 0 : 1);
  return rows
    .sort((a, b) => starts(a.code) - starts(b.code))
    .slice(0, 6)
    .map((c) => ({
      href: `/admin/carts/${c.code}`,
      main: c.code,
      sub: `${c.owner.name} · ${STATUS_LABEL[c.status]}`,
      side: formatLKR(c.total),
    }));
}

/** Counts for the admin nav badges. */
export async function adminBadges() {
  const [slips, toBook, offers] = await Promise.all([
    db.paymentSlip.count({ where: { status: "PENDING" } }),
    db.groupCart.count({ where: { status: "CONFIRMED", delivery: { is: null } } }),
    db.stockOffer.count({ where: { status: "IN_REVIEW" } }),
  ]);
  return { slips, toBook, offers };
}
