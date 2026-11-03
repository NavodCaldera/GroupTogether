import "server-only";
import { HOLDS_STOCK } from "@/lib/cart-rules";
import {
  PAID,
  citiesShown,
  median,
  paidTotals,
  priceBand,
  ratingDisplay,
  restockAdvice,
  sizeGrid,
  stockAlert,
  towardMinimum,
} from "@/lib/factory-insights";
import { D } from "@/lib/decimal";
import { colomboIsoDay } from "@/lib/format";
import { findKind } from "@/lib/taxonomy";
import { db } from "./db";

/**
 * A factory's own figures (product owner, 2026-11-03). Every query is limited to its own products
 * and orders; buyer names and phones are never selected. Sales are paid carts only; stock held in
 * unpaid carts is reported separately as "wanted in active carts".
 */
const own = (factoryId: string) => ({ variant: { product: { sellerId: factoryId } } });
const ownCarts = (factoryId: string) => ({ lines: { some: own(factoryId) } });
const month = (d: Date) => colomboIsoDay(d).slice(0, 7);

/** The order stage a factory sees. */
export function factoryStage(c: {
  status: string;
  factoryPackedAt: Date | null;
  delivery: { status: string } | null;
}) {
  if (c.status === "DELIVERED") return "delivered" as const;
  const d = c.delivery?.status;
  if (d === "FAILED" || d === "CANCELLED") return "failed" as const;
  if (d === "PICKED_UP") return "onTheWay" as const;
  if (d === "BOOKED" || c.factoryPackedAt) return "awaitingPickup" as const;
  return "toPack" as const;
}
export type FactoryStage = ReturnType<typeof factoryStage>;

export const STAGES: [FactoryStage, string][] = [
  ["toPack", "To pack"],
  ["awaitingPickup", "Awaiting pickup"],
  ["onTheWay", "On the way"],
  ["delivered", "Delivered"],
  ["failed", "Failed"],
];

/** Lines of the factory's paid carts, with what the figures need. */
async function paidLines(factoryId: string) {
  const rows = await db.cartLine.findMany({
    where: { ...own(factoryId), cart: { status: { in: [...PAID] } } },
    select: {
      qty: true,
      unitPrice: true,
      variant: { select: { size: true, productId: true } },
      cart: { select: { status: true, confirmedAt: true } },
    },
  });
  return rows.map((l) => ({ ...l, status: l.cart.status }));
}

/** Home: alerts, orders to pack, this month's paid figures and the last six months. */
export async function factoryHome(factoryId: string, now = new Date()) {
  const [lines, variants, failed, toPack, lastPacked, delivered] = await Promise.all([
    paidLines(factoryId),
    db.variant.findMany({
      where: { product: { sellerId: factoryId, status: { not: "ARCHIVED" } } },
      select: {
        size: true,
        colour: true,
        available: true,
        product: { select: { id: true, title: true } },
      },
    }),
    db.groupCart.findMany({
      where: {
        status: "DISPATCHED",
        delivery: { is: { status: { in: ["FAILED", "CANCELLED"] } } },
        ...ownCarts(factoryId),
      },
      select: { code: true, deliveryCity: true },
    }),
    db.cartLine.findMany({
      where: { ...own(factoryId), cart: { status: "CONFIRMED", factoryPackedAt: null } },
      select: {
        qty: true,
        cartId: true,
        variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
      },
    }),
    db.groupCart.findFirst({
      where: { factoryPackedById: factoryId },
      orderBy: { factoryPackedAt: "desc" },
      select: { factoryPackedAt: true },
    }),
    db.groupCart.findMany({
      where: { status: "DELIVERED", ...ownCarts(factoryId) },
      select: { delivery: { select: { updatedAt: true } } },
    }),
  ]);
  const thisMonth = month(now);
  const months = new Map<string, { pieces: number; value: D }>();
  for (let i = 5; i >= 0; i--)
    months.set(month(new Date(now.getFullYear(), now.getMonth() - i, 15)), {
      pieces: 0,
      value: new D(0),
    });
  for (const l of lines) {
    const m = l.cart.confirmedAt && months.get(month(l.cart.confirmedAt));
    if (!m) continue;
    const t = paidTotals([l]);
    m.pieces += t.pieces;
    m.value = m.value.plus(t.value);
  }
  const alerts = [
    ...failed.map((c) => ({
      tone: "bad" as const,
      text: `Delivery failed: ${c.code}${c.deliveryCity ? `, ${c.deliveryCity}` : ""}`,
      href: "/seller/orders",
    })),
    ...variants.flatMap((v) => {
      const a = stockAlert(v.available);
      if (!a) return [];
      const size = v.colour ? `${v.size} ${v.colour}` : v.size;
      return [
        {
          tone: a === "sold-out" ? ("bad" as const) : ("warn" as const),
          text:
            a === "sold-out"
              ? `Sold out: ${v.product.title}, ${size}`
              : `Low stock: ${v.product.title}, ${size} (${v.available} left)`,
          href: `/seller/products#p-${v.product.id}`,
        },
      ];
    }),
  ];
  return {
    alerts,
    toPack: new Set(toPack.map((l) => l.cartId)).size,
    // Everything waiting to be packed, as one cutting-ticket grid.
    toPackGrid: sizeGrid(
      toPack.map((l) => ({
        qty: l.qty,
        size: l.variant.size,
        colour: l.variant.colour,
        product: l.variant.product.title,
      })),
    ),
    lastPackedAt: lastPacked?.factoryPackedAt ?? null,
    month: {
      ...(months.get(thisMonth) ?? { pieces: 0, value: new D(0) }),
      delivered: delivered.filter((c) => c.delivery && month(c.delivery.updatedAt) === thisMonth)
        .length,
    },
    months: [...months].map(([m, v]) => ({ month: m, ...v })),
  };
}

/** Orders: counts per stage and the order cards (no buyer names or phones). */
export async function factoryOrderBoard(factoryId: string) {
  const carts = await db.groupCart.findMany({
    where: { status: { in: [...PAID] }, ...ownCarts(factoryId) },
    select: {
      id: true,
      code: true,
      status: true,
      confirmedAt: true,
      factoryPackedAt: true,
      deliveryCity: true,
      updatedAt: true,
      lines: {
        select: {
          qty: true,
          variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
        },
        orderBy: { variantId: "asc" },
      },
      delivery: { select: { status: true, driverName: true, trackingUrl: true } },
    },
    orderBy: { confirmedAt: "asc" },
  });
  const rows = carts.map((c) => ({ ...c, stage: factoryStage(c) }));
  const counts = Object.fromEntries(STAGES.map(([s]) => [s, 0])) as Record<FactoryStage, number>;
  for (const r of rows) counts[r.stage]++;
  // Work first; delivered orders last, newest first and only the latest 20.
  const open = rows.filter((r) => r.stage !== "delivered");
  const done = rows
    .filter((r) => r.stage === "delivered")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 20);
  return { counts, orders: [...open, ...done] };
}

/** Products: each listing with paid sales, and per size the stock left and the active-cart hold. */
export async function factoryProducts(factoryId: string) {
  const [products, lines] = await Promise.all([
    db.product.findMany({
      where: { sellerId: factoryId },
      select: {
        id: true,
        title: true,
        brand: true,
        category: true,
        status: true,
        price: true,
        photoKey: true,
        variants: {
          select: {
            id: true,
            size: true,
            colour: true,
            available: true,
            reserved: true,
            _count: { select: { lines: true } },
          },
          orderBy: [{ size: "asc" }, { colour: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    paidLines(factoryId),
  ]);
  return products.map((p) => {
    const mine = lines.filter((l) => l.variant.productId === p.id);
    const { pieces, value } = paidTotals(mine);
    const bySize = new Map<string, number>();
    for (const l of mine) bySize.set(l.variant.size, (bySize.get(l.variant.size) ?? 0) + l.qty);
    const best = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      ...p,
      pieces,
      value,
      bestSize: best,
      variants: p.variants.map(({ _count, ...v }) => ({
        ...v,
        soldPaid: bySize.get(v.size) ?? 0,
        // A size never put in a cart can be removed; others keep their order history.
        removable: _count.lines === 0,
      })),
    };
  });
}

/** Ratings and insights: restock advice, pack time, active-cart demand, price bands, cities. */
export async function factoryInsights(factoryId: string) {
  const [ratings, variants, packed, active, lines, cities] = await Promise.all([
    db.factoryRating.findMany({
      where: { factoryId },
      select: { id: true, stars: true },
      orderBy: { createdAt: "desc" },
    }),
    db.variant.findMany({
      where: { product: { sellerId: factoryId } },
      select: { size: true, available: true, reserved: true, product: { select: { title: true } } },
      orderBy: [{ product: { title: "asc" } }, { size: "asc" }],
    }),
    db.groupCart.findMany({
      where: {
        factoryPackedById: factoryId,
        confirmedAt: { not: null },
        factoryPackedAt: { not: null },
      },
      select: { confirmedAt: true, factoryPackedAt: true },
    }),
    db.groupCart.findMany({
      where: { status: { in: [...HOLDS_STOCK] }, ...ownCarts(factoryId) },
      select: {
        total: true,
        minOrderValue: true,
        lines: {
          where: own(factoryId),
          select: { variant: { select: { product: { select: { title: true } } } } },
        },
      },
    }),
    db.cartLine.findMany({
      where: { ...own(factoryId), cart: { status: { in: [...PAID] } } },
      select: {
        qty: true,
        unitPrice: true,
        variant: { select: { product: { select: { kind: true, category: true } } } },
      },
    }),
    db.groupCart.groupBy({
      by: ["deliveryCity"],
      where: { status: { in: [...PAID] }, ...ownCarts(factoryId) },
      _count: true,
    }),
  ]);

  const hours = packed.map(
    (c) => (c.factoryPackedAt!.getTime() - c.confirmedAt!.getTime()) / 3_600_000,
  );

  const demand = new Map<string, { carts: number; pct: number }>();
  for (const c of active) {
    const pct = towardMinimum(c.total, c.minOrderValue);
    for (const title of new Set(c.lines.map((l) => l.variant.product.title))) {
      const d = demand.get(title) ?? { carts: 0, pct: 0 };
      d.carts++;
      d.pct += pct;
      demand.set(title, d);
    }
  }

  const bands = new Map<string, Map<string, number>>();
  for (const l of lines) {
    const p = l.variant.product;
    const cat = findKind(p.kind)?.label ?? p.category;
    const row = bands.get(cat) ?? new Map<string, number>();
    const band = priceBand(l.unitPrice);
    row.set(band, (row.get(band) ?? 0) + l.qty);
    bands.set(cat, row);
  }

  return {
    rating: { ...ratingDisplay(ratings.map((r) => r.stars)), latest: ratings.slice(0, 10) },
    restock: variants.flatMap((v) => {
      const advice = restockAdvice(v);
      return advice ? [{ product: v.product.title, advice }] : [];
    }),
    packTime: { medianHours: median(hours), sample: hours.length },
    demand: [...demand].map(([product, d]) => ({
      product,
      carts: d.carts,
      averagePct: Math.round(d.pct / d.carts),
    })),
    priceBands: [...bands].map(([category, row]) => ({
      category,
      pieces: Object.fromEntries(row) as Record<string, number>,
    })),
    cities: citiesShown(
      cities
        .filter((c) => c.deliveryCity)
        .map((c) => ({ city: c.deliveryCity!, orders: c._count }))
        .sort((a, b) => b.orders - a.orders),
    ),
  };
}
