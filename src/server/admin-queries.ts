import { cancelledValue, visibleTotals } from "./carts/visible-totals";
import "server-only";
import type { CartStatus, Prisma } from "@/generated/prisma/client";
import type { OperationalAdminArea } from "@/lib/admin-access";
import { HOLDS_STOCK, STATUS_LABEL } from "@/lib/cart-rules";
import { toD } from "@/lib/decimal";
import { colomboDayStart, formatLKR } from "@/lib/format";
import { IN_SHOP } from "./catalogue";
import { db } from "./db";
import { brandInbox } from "./brand-communications";

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
  return {
    orders: r._count._all,
    total: toD(r._sum.total ?? 0).minus(
      await cancelledValue({ status: { in: PAID }, confirmedAt: { gte: from } }),
    ),
  };
}

/** The sales line on the admin Stock page: confirmed sales today, 7 days, 30 days, and money in carts. */
export async function salesStats(now = new Date()) {
  const [today, week, month, locked] = await Promise.all([
    salesSince(colomboDayStart(now)),
    salesSince(colomboDayStart(now, 6)),
    salesSince(colomboDayStart(now, 29)),
    db.groupCart.aggregate({
      where: { status: { in: [...HOLDS_STOCK] } },
      _sum: { total: true },
      _count: { _all: true },
    }),
  ]);
  return {
    sales: { today, week, month },
    locked: { carts: locked._count._all, total: toD(locked._sum.total ?? 0) },
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
    select: { id: true, code: true, status: true, total: true, owner: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const starts = (c: string) => (c.startsWith(term.toUpperCase()) ? 0 : 1);
  return (await visibleTotals(rows))
    .sort((a, b) => starts(a.code) - starts(b.code))
    .slice(0, 6)
    .map((c) => ({
      href: `/admin/carts/${c.code}`,
      main: c.code,
      sub: `${c.owner.name} · ${STATUS_LABEL[c.status]}`,
      side: formatLKR(c.total),
    }));
}

/** Counts for the admin nav badges; each area counts only its own work. */
export async function adminBadges(adminId: string, area: OperationalAdminArea) {
  const none = Promise.resolve(0);
  const [slips, orders, offers, lowStock, brandRewards] = await Promise.all([
    area === "WAREHOUSE" ? db.paymentSlip.count({ where: { status: "PENDING" } }) : none,
    // Orders that need the admin: PickMe to book, or a failed drop to book again.
    area === "WAREHOUSE"
      ? db.groupCart.count({
          where: {
            OR: [
              { status: "CONFIRMED", delivery: { is: null } },
              {
                status: "DISPATCHED",
                delivery: { is: { status: { in: ["FAILED", "CANCELLED"] } } },
              },
            ],
          },
        })
      : none,
    area === "FACTORY"
      ? db.stockOffer.count({ where: { status: "IN_REVIEW", seller: { isBrand: false } } })
      : none,
    area === "FACTORY"
      ? db.variant.count({ where: { available: { lte: LOW_STOCK }, product: IN_SHOP } })
      : none,
    area === "PREMIUM" ? brandRewardWork(adminId) : none,
  ]);
  return { slips, orders, offers, lowStock, brandRewards };
}

async function brandRewardWork(adminId: string) {
  const [reviews, issues, queries, inbox] = await Promise.all([
    db.brandOfferRevision.count({ where: { status: "IN_REVIEW", supersededAt: null } }),
    db.giftOrder.count({ where: { status: "ISSUE" } }),
    db.giftSettlement.count({ where: { queryOpen: true } }),
    brandInbox(adminId),
  ]);
  return reviews + issues + queries + inbox.filter((thread) => thread.unread > 0).length;
}
