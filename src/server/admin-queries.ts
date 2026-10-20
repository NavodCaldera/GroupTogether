import "server-only";
import type { CartStatus, Prisma } from "@/generated/prisma/client";
import { HOLDS_STOCK, STATUS_LABEL } from "@/lib/cart-rules";
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

/** The admin Sales page (product owner, 2026-10-21): sales, money in carts, buyers, best sellers. */
export async function salesStats(now = new Date()) {
  const [today, week, month, locked, customers, newCustomers, bestSellerRows] = await Promise.all([
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
    db.variant.groupBy({
      by: ["productId"],
      _sum: { sold: true },
      where: { sold: { gt: 0 } },
      orderBy: { _sum: { sold: "desc" } },
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

  return {
    sales: { today, week, month },
    locked: { carts: locked._count._all, total: toD(locked._sum.total ?? 0) },
    customers,
    newCustomers,
    bestSellers,
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
  const [slips, orders, offers, lowStock] = await Promise.all([
    db.paymentSlip.count({ where: { status: "PENDING" } }),
    // Orders that need the admin: PickMe to book, or a failed drop to book again.
    db.groupCart.count({
      where: {
        OR: [
          { status: "CONFIRMED", delivery: { is: null } },
          { status: "DISPATCHED", delivery: { is: { status: { in: ["FAILED", "CANCELLED"] } } } },
        ],
      },
    }),
    db.stockOffer.count({ where: { status: "IN_REVIEW" } }),
    db.variant.count({ where: { available: { lte: LOW_STOCK }, product: IN_SHOP } }),
  ]);
  return { slips, orders, offers, lowStock };
}
