import "server-only";
import { toD } from "@/lib/decimal";
import { colomboDayStart } from "@/lib/format";
import { orderStage } from "@/lib/packing-rules";
import {
  AGE_BANDS,
  ageBand,
  ageDays,
  averageAgeDays,
  costPerPiece,
  daysToClear,
  lotMarginPct,
  lotPrice,
  lotTotalCost,
  oddSizesLeft,
  percentOf,
} from "@/lib/stock-rules";
import { PAID } from "./admin-queries";
import { db } from "./db";
import { getSettings } from "./settings";

/**
 * What is in our store and how fast it leaves (product owner, 2026-10-21: the goal is to empty
 * the store fast and buy the next bulk, not to know the best sellers). A piece is in the store
 * from the day its lot arrived (else the day its product was created) until it is handed to the
 * PickMe driver: free, locked in a cart, paid but not handed over, or not listed yet (a lot's
 * pieces beyond the stock added to its products).
 */

const DAY_MS = 86_400_000;
const WEEKS = 8;

/** Paid orders still in our store: not handed to the driver yet (or back after a failed drop). */
const IN_STORE_STAGES = new Set(["to-book", "in-store", "failed"]);

type Money = { toString(): string };

export async function storeSnapshot(now = new Date()) {
  const [settings, lots, products, paidOpen, revenueRows] = await Promise.all([
    getSettings(),
    db.lot.findMany({ orderBy: { receivedAt: "asc" } }),
    db.product.findMany({
      where: { variants: { some: {} } },
      select: {
        id: true,
        title: true,
        brand: true,
        price: true,
        lotId: true,
        createdAt: true,
        variants: {
          select: { size: true, colour: true, available: true, reserved: true, sold: true },
          orderBy: [{ size: "asc" }, { colour: "asc" }],
        },
      },
    }),
    db.groupCart.findMany({
      where: { status: { in: ["CONFIRMED", "DISPATCHED"] } },
      select: {
        delivery: { select: { status: true } },
        packing: { select: { handedOverAt: true } },
        lines: {
          where: { status: "ACTIVE" },
          select: { qty: true, variant: { select: { productId: true } } },
        },
      },
    }),
    db.$queryRaw<{ lotId: string; revenue: Money | null }[]>`
      SELECT p."lotId" AS "lotId", SUM(l."qty" * l."unitPrice") AS "revenue"
      FROM "CartLine" l
      JOIN "GroupCart" c ON c."id" = l."cartId"
      JOIN "Variant" v ON v."id" = l."variantId"
      JOIN "Product" p ON p."id" = v."productId"
      WHERE p."lotId" IS NOT NULL AND c."status" IN ('CONFIRMED', 'DISPATCHED', 'DELIVERED')
      GROUP BY p."lotId"`,
  ]);

  const paidWaiting = new Map<string, number>();
  for (const c of paidOpen) {
    if (!IN_STORE_STAGES.has(orderStage(c.delivery, c.packing))) continue;
    for (const l of c.lines) {
      const id = l.variant.productId;
      paidWaiting.set(id, (paidWaiting.get(id) ?? 0) + l.qty);
    }
  }
  const lotById = new Map(lots.map((l) => [l.id, l]));

  const productRows = products.map((p) => {
    const lot = p.lotId ? lotById.get(p.lotId) : undefined;
    const sum = (k: "available" | "reserved" | "sold") => p.variants.reduce((n, v) => n + v[k], 0);
    const free = sum("available");
    const inCarts = sum("reserved");
    const sold = sum("sold");
    const paid = paidWaiting.get(p.id) ?? 0;
    const since = lot?.receivedAt ?? p.createdAt;
    return {
      id: p.id,
      title: p.title,
      brand: p.brand,
      price: toD(p.price),
      lot: lot ? { id: lot.id, name: lot.name } : null,
      marginPct: lot ? lotMarginPct(lot, now) : null,
      since,
      days: ageDays(since, now),
      free,
      inCarts,
      paidWaiting: paid,
      inStore: free + inCarts + paid,
      sold,
      stocked: free + inCarts + sold,
      soldPct: percentOf(sold, free + inCarts + sold),
      oddSizes: free > 0 ? oddSizesLeft(p.variants) : null,
    };
  });

  const revenueByLot = new Map(revenueRows.map((r) => [r.lotId, toD(r.revenue ?? 0)]));
  const lotRows = lots
    .map((lot) => {
      const mine = productRows.filter((p) => p.lot?.id === lot.id);
      const listed = mine.reduce((n, p) => n + p.stocked, 0);
      const sold = mine.reduce((n, p) => n + p.sold, 0);
      const unlisted = Math.max(0, lot.pieces - listed);
      const totalCost = lotTotalCost(lot);
      const revenue = revenueByLot.get(lot.id) ?? toD(0);
      return {
        id: lot.id,
        name: lot.name,
        pieces: lot.pieces,
        receivedAt: lot.receivedAt,
        reduceAt: lot.reduceAt,
        days: ageDays(lot.receivedAt, now),
        fullMarginPct: lot.fullMarginPct,
        reducedMarginPct: lot.reducedMarginPct,
        marginPct: lotMarginPct(lot, now),
        totalCost,
        costPerPiece: costPerPiece(lot),
        priceNow: lotPrice(lot, now),
        products: mine.length,
        listed,
        unlisted,
        sold,
        inStore: mine.reduce((n, p) => n + p.inStore, 0) + unlisted,
        revenue,
        soldPct: percentOf(sold, lot.pieces),
        costBackPct: percentOf(revenue, totalCost),
      };
    })
    .reverse();

  const piles = [
    ...productRows.map((p) => ({ pieces: p.inStore, days: p.days })),
    ...lotRows.map((l) => ({ pieces: l.unlisted, days: l.days })),
  ];
  const bands = AGE_BANDS.map(() => 0);
  for (const p of piles) if (p.pieces > 0) bands[ageBand(p.days)] += p.pieces;

  const total = (k: "free" | "inCarts" | "paidWaiting") =>
    productRows.reduce((n, p) => n + p[k], 0);
  const unlisted = lotRows.reduce((n, l) => n + l.unlisted, 0);
  const inStore = total("free") + total("inCarts") + total("paidWaiting") + unlisted;

  return {
    settings,
    products: productRows,
    lots: lotRows,
    store: {
      capacity: settings.storeCapacity,
      inStore,
      free: total("free"),
      inCarts: total("inCarts"),
      paidWaiting: total("paidWaiting"),
      unlisted,
      room: Math.max(0, settings.storeCapacity - inStore),
      fullPct: percentOf(inStore, settings.storeCapacity),
      averageAge: averageAgeDays(piles),
      bands: AGE_BANDS.map((b, i) => ({ label: b.label, pieces: bands[i] })),
    },
  };
}

export type StoreSnapshot = Awaited<ReturnType<typeof storeSnapshot>>;
export type LotRow = StoreSnapshot["lots"][number];

/** Pieces in (lots arriving) and out (handed to PickMe) per week, oldest first, last 8 weeks. */
async function weeklyFlow(lots: { receivedAt: Date; pieces: number }[], now: Date) {
  const from = colomboDayStart(now, WEEKS * 7 - 1);
  const weeks = Array.from({ length: WEEKS }, (_, i) => ({
    start: new Date(from.getTime() + i * 7 * DAY_MS),
    in: 0,
    out: 0,
  }));
  const week = (t: Date) => Math.floor((t.getTime() - from.getTime()) / (7 * DAY_MS));

  for (const l of lots) {
    const w = weeks[week(l.receivedAt)];
    if (w && l.receivedAt >= from) w.in += l.pieces;
  }

  const left = await db.groupCart.findMany({
    where: {
      status: { in: ["DISPATCHED", "DELIVERED"] },
      OR: [
        { packing: { is: { handedOverAt: { gte: from } } } },
        { delivery: { is: { updatedAt: { gte: from } } } },
      ],
    },
    select: {
      packing: { select: { handedOverAt: true } },
      delivery: { select: { status: true, updatedAt: true } },
      lines: { where: { status: "ACTIVE" }, select: { qty: true } },
    },
  });
  let last28 = 0;
  let last7 = 0;
  for (const c of left) {
    const stage = orderStage(c.delivery, c.packing);
    const at =
      c.packing?.handedOverAt ??
      (stage === "on-the-way" || stage === "delivered" ? c.delivery?.updatedAt : null);
    if (!at || at < from) continue;
    const qty = c.lines.reduce((n, l) => n + l.qty, 0);
    const w = weeks[week(at)];
    if (w) w.out += qty;
    if (at >= colomboDayStart(now, 27)) last28 += qty;
    if (at >= colomboDayStart(now, 6)) last7 += qty;
  }
  return { weeks, out7: last7, outPerDay: last28 / 28 };
}

/** Open carts short of the minimum that expire within 6 hours: their pieces are about to come back. */
function closingSoon(now: Date) {
  return db.groupCart.findMany({
    where: { status: "OPEN", expiresAt: { gt: now, lte: new Date(now.getTime() + 6 * 3_600_000) } },
    select: {
      code: true,
      total: true,
      minOrderValue: true,
      expiresAt: true,
      lines: { where: { status: "ACTIVE" }, select: { qty: true } },
    },
    orderBy: { expiresAt: "asc" },
    take: 10,
  });
}

/** Pieces carted in the last 30 days that were paid for, and those that came back to the shelf. */
async function cartOutcomes(now: Date) {
  const from = colomboDayStart(now, 29);
  const [paid, back, expired] = await Promise.all([
    db.cartLine.aggregate({
      _sum: { qty: true },
      where: { status: "ACTIVE", cart: { status: { in: PAID }, confirmedAt: { gte: from } } },
    }),
    db.cartLine.aggregate({
      _sum: { qty: true },
      where: { cart: { status: { in: ["EXPIRED", "CANCELLED"] }, updatedAt: { gte: from } } },
    }),
    db.groupCart.findMany({
      where: { status: "EXPIRED", updatedAt: { gte: from } },
      select: { total: true, minOrderValue: true },
    }),
  ]);
  const reached = expired
    .map((c) => percentOf(c.total, c.minOrderValue))
    .filter((p): p is number => p !== null);
  const paidPieces = paid._sum.qty ?? 0;
  const backPieces = back._sum.qty ?? 0;
  return {
    paid: paidPieces,
    back: backPieces,
    backPct: percentOf(backPieces, paidPieces + backPieces),
    expiredCarts: expired.length,
    expiredReachedPct: reached.length
      ? Math.round(reached.reduce((a, b) => a + b, 0) / reached.length)
      : null,
  };
}

/** Everything on the admin Stock page. */
export async function stockDashboard(now = new Date()) {
  const snapshot = await storeSnapshot(now);
  const [flow, soon, outcomes, offersWaiting, offersOnTheWay] = await Promise.all([
    weeklyFlow(snapshot.lots, now),
    closingSoon(now),
    cartOutcomes(now),
    db.stockOffer.count({ where: { status: "IN_REVIEW" } }),
    db.stockOffer.count({
      where: { status: "ACCEPTED", receivedAt: null, seller: { isBrand: false } },
    }),
  ]);

  // Big, old piles first: free pieces × days in the store.
  const oldest = snapshot.products
    .filter((p) => p.free > 0)
    .sort((a, b) => b.free * b.days - a.free * a.days || b.days - a.days)
    .slice(0, 10);
  const oddSizes = snapshot.products
    .filter((p) => p.oddSizes)
    .sort((a, b) => b.free - a.free)
    .slice(0, 8);

  return {
    ...snapshot,
    flow: flow.weeks,
    out7: flow.out7,
    clearInDays: daysToClear(snapshot.store.inStore, flow.outPerDay),
    oldest,
    oddSizes,
    closingSoon: soon.map((c) => ({
      code: c.code,
      total: toD(c.total),
      short: toD(c.minOrderValue).minus(toD(c.total)),
      reachedPct: percentOf(c.total, c.minOrderValue),
      expiresAt: c.expiresAt,
      pieces: c.lines.reduce((n, l) => n + l.qty, 0),
    })),
    outcomes,
    offersWaiting,
    offersOnTheWay,
  };
}
