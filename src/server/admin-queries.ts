import "server-only";
import type { CartStatus } from "@/generated/prisma/client";
import { HOLDS_STOCK, addHours } from "@/lib/cart-rules";
import { toD } from "@/lib/decimal";
import { colomboDayStart } from "@/lib/format";
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
    productsToReview,
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
    db.product.count({ where: { status: "IN_REVIEW" } }),
    db.variant.count({ where: { available: { lte: LOW_STOCK }, product: { status: "LIVE" } } }),
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
      where: { available: { lte: LOW_STOCK }, product: { status: "LIVE" } },
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
    productsToReview,
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

/** Counts for the admin nav badges. */
export async function adminBadges() {
  const [slips, toBook, inReview, offers] = await Promise.all([
    db.paymentSlip.count({ where: { status: "PENDING" } }),
    db.groupCart.count({ where: { status: "CONFIRMED", delivery: { is: null } } }),
    db.product.count({ where: { status: "IN_REVIEW" } }),
    db.stockOffer.count({ where: { status: "IN_REVIEW" } }),
  ]);
  return { slips, toBook, inReview, offers };
}
