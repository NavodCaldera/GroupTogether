import "server-only";
import type { BasketStatus, Prisma } from "@/generated/prisma/client";
import { lineEarning } from "@/lib/agent-money";
import {
  citiesShown,
  compareSizes,
  median,
  priceBand,
  ratingDisplay,
  restockAdvice,
  stockAlert,
} from "@/lib/factory-insights";
import type { FactorySection } from "@/lib/factory-roles";
import { D, roundMoney, toD } from "@/lib/decimal";
import { findKind } from "@/lib/taxonomy";
import { assertFactorySection } from "./auth/service";
import { db } from "./db";
import { PAYOUT_HOLD_RETURNS, payableLines, weekOf } from "./payouts";
import { getSettings } from "./settings";

/**
 * A factory's own work and figures (area-agent model, 2026-11-07). Every query is limited to the
 * signed-in login's factory and gated by its job's section; buyer names and phones are never
 * selected. Baskets replace the old shared-cart widgets.
 */
/** At-agent baskets shown on the orders board. */
const SHOWN_DONE = 20;

/** The factory a login works for, if its job includes any of `sections`. */
async function factoryFor(userId: string, sections: FactorySection[]) {
  let denied: unknown;
  for (const section of sections) {
    try {
      return await assertFactorySection(userId, section);
    } catch (error) {
      denied = error;
    }
  }
  throw denied;
}

/** Basket stages a factory sees, in order. */
export const BASKET_STAGES: [BasketStatus, string][] = [
  ["OPEN", "Filling"],
  ["LOCKED", "Locked"],
  ["PACKED", "Packed"],
  ["WITH_COURIER", "With courier"],
  ["AT_AGENT", "At agent"],
];
export const STAGE_LABEL = Object.fromEntries(BASKET_STAGES) as Record<BasketStatus, string>;

const basketSelect = {
  id: true,
  status: true,
  total: true,
  firstOrderAt: true,
  lockedAt: true,
  agent: { select: { address: true, city: true, user: { select: { name: true } } } },
  courier: {
    select: { driverName: true, driverPhone: true, vehicleNo: true, givenToDriverAt: true },
  },
} satisfies Prisma.BasketSelect;
type BasketRow = Prisma.BasketGetPayload<{ select: typeof basketSelect }>;

export type BasketLine = {
  id: string;
  size: string;
  colour: string;
  qty: number;
  reportedQty: number;
  note: string | null;
  /** A paid order's line: Report missing applies while the basket is at the factory. */
  reportable: boolean;
};
export type BasketCard = Omit<BasketRow, "total"> & {
  total: D;
  pieces: number;
  products: { title: string; lines: BasketLine[] }[];
};

/** Each basket with its lines grouped by product, then size and colour. */
async function withLines(baskets: BasketRow[]): Promise<BasketCard[]> {
  if (!baskets.length) return [];
  const lines = await db.orderLine.findMany({
    where: {
      status: "ACTIVE",
      order: { basketId: { in: baskets.map((b) => b.id) }, status: { in: ["PAID", "RECEIVED"] } },
    },
    select: {
      id: true,
      qty: true,
      missingQty: true,
      missingReportedQty: true,
      missingNote: true,
      order: { select: { basketId: true, status: true } },
      variant: { select: { size: true, colour: true, product: { select: { title: true } } } },
    },
    orderBy: { id: "asc" },
  });
  return baskets.map((b) => {
    const mine = lines
      .filter((l) => l.order.basketId === b.id)
      .sort(
        (x, y) =>
          x.variant.product.title.localeCompare(y.variant.product.title) ||
          compareSizes(x.variant.size, y.variant.size) ||
          x.variant.colour.localeCompare(y.variant.colour),
      );
    const products: BasketCard["products"] = [];
    let pieces = 0;
    for (const l of mine) {
      const qty = l.qty - l.missingQty;
      if (qty <= 0) continue;
      pieces += qty;
      const title = l.variant.product.title;
      let group = products.at(-1);
      if (group?.title !== title) products.push((group = { title, lines: [] }));
      group.lines.push({
        id: l.id,
        size: l.variant.size,
        colour: l.variant.colour,
        qty,
        reportedQty: l.missingReportedQty,
        note: l.missingNote,
        reportable: l.order.status === "PAID",
      });
    }
    return { ...b, total: toD(b.total), pieces, products };
  });
}

/** Packing (and Owner): locked baskets to pack, and packed baskets whose courier is booked. */
export async function packingWork(userId: string) {
  const { factoryId } = await factoryFor(userId, ["orders"]);
  const [locked, packed] = await Promise.all([
    db.basket.findMany({
      where: { factoryId, status: "LOCKED" },
      select: basketSelect,
      orderBy: [{ lockedAt: "asc" }, { id: "asc" }],
    }),
    db.basket.findMany({
      where: { factoryId, status: "PACKED" },
      select: basketSelect,
      orderBy: [{ lockedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const [toPack, courierBooked] = await Promise.all([
    withLines(locked),
    withLines(packed.filter((b) => b.courier)),
  ]);
  return { toPack, courierBooked, waitingCourier: packed.filter((b) => !b.courier).length };
}

/** Orders: basket counts per stage, then every basket past Filling (latest at-agent ones only). */
export async function factoryBasketBoard(userId: string) {
  const { factoryId } = await factoryFor(userId, ["orders"]);
  const [grouped, active, done] = await Promise.all([
    db.basket.groupBy({
      by: ["status"],
      where: { factoryId, NOT: { status: "OPEN", orders: { none: { status: "PAID" } } } },
      _count: true,
    }),
    db.basket.findMany({
      where: { factoryId, status: { in: ["LOCKED", "PACKED", "WITH_COURIER"] } },
      select: basketSelect,
      orderBy: [{ lockedAt: "asc" }, { id: "asc" }],
    }),
    db.basket.findMany({
      where: { factoryId, status: "AT_AGENT" },
      select: basketSelect,
      orderBy: [{ lockedAt: "desc" }, { id: "desc" }],
      take: SHOWN_DONE,
    }),
  ]);
  const counts = Object.fromEntries(BASKET_STAGES.map(([s]) => [s, 0])) as Record<
    BasketStatus,
    number
  >;
  for (const g of grouped) counts[g.status] = g._count;
  const order = BASKET_STAGES.map(([s]) => s);
  const rows = [...active].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  return { counts, baskets: await withLines([...rows, ...done]) };
}

/** Sales (and Owner): open baskets filling at each agent, with their totals and lock amount. */
export async function fillingBaskets(userId: string) {
  const { factoryId } = await factoryFor(userId, ["baskets", "earnings"]);
  const [baskets, settings] = await Promise.all([
    db.basket.findMany({
      where: { factoryId, status: "OPEN", orders: { some: { status: "PAID" } } },
      select: basketSelect,
      orderBy: [{ total: "desc" }, { id: "asc" }],
    }),
    getSettings(),
  ]);
  return { baskets: await withLines(baskets), lockAmount: toD(settings.basketLockAmount) };
}

/** Sales (and Owner): returns waiting for the factory's decision. */
export async function returnsWaiting(userId: string) {
  const { factoryId } = await factoryFor(userId, ["returns"]);
  return db.returnRequest.count({
    where: { factoryId, status: "WAITING_FACTORY" },
  });
}

/** Sales (and Owner): sold-out and low-stock sizes of live listings. */
export async function stockAlerts(userId: string) {
  const { factoryId } = await factoryFor(userId, ["products"]);
  const variants = await db.variant.findMany({
    where: { product: { sellerId: factoryId, status: { not: "ARCHIVED" } } },
    select: {
      size: true,
      colour: true,
      available: true,
      product: { select: { id: true, title: true } },
    },
    orderBy: [{ available: "asc" }, { product: { title: "asc" } }, { size: "asc" }],
  });
  return variants.flatMap((v) => {
    const a = stockAlert(v.available);
    if (!a) return [];
    const size = v.colour ? `${v.size} ${v.colour}` : v.size;
    return [
      {
        productId: v.product.id,
        tone: a === "sold-out" ? ("bad" as const) : ("warn" as const),
        text:
          a === "sold-out"
            ? `Sold out: ${v.product.title}, ${size}`
            : `Low stock: ${v.product.title}, ${size} (${v.available} left)`,
      },
    ];
  });
}

/** Owner: this week's earned amount, what is held, waiting deductions and past payouts. */
export async function factoryEarnings(userId: string, now = new Date()) {
  const { factoryId } = await factoryFor(userId, ["earnings"]);
  // The coming Saturday 23:59 Colombo: its payout takes exactly the lines payableLines picks.
  const end = weekOf(now);
  const { collectHours } = await getSettings();
  const [payable, lines, waiting, payouts] = await Promise.all([
    db.orderLine.findMany({
      where: payableLines(end, collectHours, factoryId),
      select: { id: true },
    }),
    db.orderLine.findMany({
      where: {
        payoutItems: { none: {} },
        order: { factoryId, status: { in: ["PAID", "RECEIVED"] }, receivedAt: { not: null } },
      },
      select: {
        id: true,
        qty: true,
        returnedQty: true,
        missingQty: true,
        missingReportedQty: true,
        factoryPrice: true,
        returns: { where: { status: { in: PAYOUT_HOLD_RETURNS } }, select: { id: true } },
      },
    }),
    db.payoutDeduction.findMany({
      where: { factoryId, payoutId: null },
      select: { amount: true },
    }),
    db.factoryPayout.findMany({
      where: { factoryId },
      select: {
        id: true,
        weekEnding: true,
        gross: true,
        deductions: true,
        net: true,
        paidAt: true,
        bankRef: true,
        deductionRows: { select: { id: true, kind: true, amount: true }, orderBy: { id: "asc" } },
      },
      orderBy: { weekEnding: "desc" },
      take: 26,
    }),
  ]);
  const thisWeek = new Set(payable.map((l) => l.id));
  let earned = new D(0);
  let held = new D(0);
  let nextWeek = new D(0);
  for (const l of lines) {
    const amount = lineEarning(l.qty, l.returnedQty, l.missingQty, toD(l.factoryPrice));
    if (thisWeek.has(l.id)) earned = earned.plus(amount);
    // A pending missing report or an open return holds the line from the payout.
    else if (l.missingReportedQty > 0 || l.returns.length) held = held.plus(amount);
    // Received too close to Saturday 23:59: it goes into the following week's payout.
    else nextWeek = nextWeek.plus(amount);
  }
  return {
    earned: roundMoney(earned),
    nextWeek: roundMoney(nextWeek),
    held: roundMoney(held),
    deductions: roundMoney(waiting.reduce((s, d) => s.plus(toD(d.amount)), new D(0))),
    // Payouts are built after Saturday 23:59 Colombo and paid in cash on the Sunday.
    nextSunday: new Date(end.getTime() + 1),
    payouts: payouts.map((p) => ({
      ...p,
      gross: toD(p.gross),
      deductions: toD(p.deductions),
      net: toD(p.net),
      sunday: new Date(p.weekEnding.getTime() + 1),
      deductionRows: p.deductionRows.map((d) => ({ ...d, amount: toD(d.amount) })),
    })),
  };
}

/** Lines of the factory's paid orders, for the products page's sales figures. */
async function paidLines(factoryId: string) {
  return db.orderLine.findMany({
    where: { order: { factoryId, status: { in: ["PAID", "RECEIVED"] } } },
    select: {
      qty: true,
      missingQty: true,
      returnedQty: true,
      factoryPrice: true,
      variant: { select: { size: true, productId: true } },
    },
  });
}

/** Products: each listing with paid sales, and per size the stock left and the unpaid-order hold. */
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
            _count: { select: { orderLines: true } },
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
    let pieces = 0;
    let value = new D(0);
    const bySize = new Map<string, number>();
    for (const l of mine) {
      const sold = Math.max(l.qty - l.missingQty - l.returnedQty, 0);
      pieces += sold;
      value = value.plus(lineEarning(l.qty, l.returnedQty, l.missingQty, toD(l.factoryPrice)));
      bySize.set(l.variant.size, (bySize.get(l.variant.size) ?? 0) + sold);
    }
    const best = [...bySize].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      ...p,
      pieces,
      value: roundMoney(value),
      bestSize: best,
      variants: p.variants.map(({ _count, ...v }) => ({
        ...v,
        soldPaid: bySize.get(v.size) ?? 0,
        // A size never ordered can be removed; others keep their order history.
        removable: _count.orderLines === 0,
      })),
    };
  });
}

/** Ratings and insights: restock advice, pack time, buyer-cart demand, price bands, cities. */
export async function factoryInsights(factoryId: string) {
  const paid = { factoryId, status: { in: ["PAID" as const, "RECEIVED" as const] } };
  const [ratings, variants, packed, wanted, lines, cities] = await Promise.all([
    db.productRating.findMany({
      where: { product: { sellerId: factoryId } },
      select: { id: true, stars: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    db.variant.findMany({
      where: { product: { sellerId: factoryId } },
      select: { size: true, available: true, reserved: true, product: { select: { title: true } } },
      orderBy: [{ product: { title: "asc" } }, { size: "asc" }],
    }),
    db.basket.findMany({
      where: { factoryId, lockedAt: { not: null }, courier: { givenToDriverAt: { not: null } } },
      select: { lockedAt: true, courier: { select: { givenToDriverAt: true } } },
    }),
    db.cartItem.findMany({
      where: { variant: { product: { sellerId: factoryId } } },
      select: {
        buyerId: true,
        qty: true,
        variant: { select: { product: { select: { title: true } } } },
      },
    }),
    db.orderLine.findMany({
      where: { status: "ACTIVE", order: paid },
      select: {
        qty: true,
        unitPrice: true,
        variant: { select: { product: { select: { kind: true, category: true } } } },
      },
    }),
    db.order.findMany({ where: paid, select: { agent: { select: { city: true } } } }),
  ]);

  const hours = packed.map(
    (b) => (b.courier!.givenToDriverAt!.getTime() - b.lockedAt!.getTime()) / 3_600_000,
  );

  const demand = new Map<string, { buyers: Set<string>; pieces: number }>();
  for (const c of wanted) {
    const title = c.variant.product.title;
    const d = demand.get(title) ?? { buyers: new Set<string>(), pieces: 0 };
    d.buyers.add(c.buyerId);
    d.pieces += c.qty;
    demand.set(title, d);
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

  const byCity = new Map<string, number>();
  for (const o of cities)
    if (o.agent.city) byCity.set(o.agent.city, (byCity.get(o.agent.city) ?? 0) + 1);

  return {
    rating: { ...ratingDisplay(ratings.map((r) => r.stars)), latest: ratings.slice(0, 10) },
    restock: variants.flatMap((v) => {
      const advice = restockAdvice(v);
      return advice ? [{ product: v.product.title, advice }] : [];
    }),
    packTime: { medianHours: median(hours), sample: hours.length },
    demand: [...demand]
      .map(([product, d]) => ({ product, buyers: d.buyers.size, pieces: d.pieces }))
      .sort((a, b) => b.buyers - a.buyers || a.product.localeCompare(b.product)),
    priceBands: [...bands].map(([category, row]) => ({
      category,
      pieces: Object.fromEntries(row) as Record<string, number>,
    })),
    cities: citiesShown(
      [...byCity].map(([city, orders]) => ({ city, orders })).sort((a, b) => b.orders - a.orders),
    ),
  };
}
