import "server-only";
import {
  byPrice,
  chartDays,
  daysOnSale,
  demandLabel,
  demandOf,
  type DemandLine,
  priceSpans,
  sellRate,
  similarRate,
  splitTestBulk,
} from "@/lib/design-rules";
import { toD } from "@/lib/decimal";
import { percentOf } from "@/lib/stock-rules";
import { AUDIENCES, findKind, sizesFor } from "@/lib/taxonomy";
import { PAID } from "./admin-queries";
import { CatalogueError } from "./catalogue";
import { db } from "./db";
import { notify } from "./notify";

/**
 * A factory's designs in our shop and how they sell (product owner, 2026-10-24). A design is a
 * shop product linked to the factory: its test pieces and later its bulk go onto the same
 * product. Sellers see counts (pieces wanted and bought, how many people bought) and the shop
 * price against pieces sold; never buyer names, individual carts, our cost or margin.
 * Rules: `src/lib/design-rules.ts`.
 */

/**
 * Puts an accepted offer's pieces on a shop product, which becomes one of the seller's designs.
 * A product another factory's designs already use is refused.
 */
export async function linkOfferProduct(offerId: string, productId: string) {
  const [offer, product] = await Promise.all([
    db.stockOffer.findUnique({ where: { id: offerId }, select: { sellerId: true, status: true } }),
    db.product.findUnique({ where: { id: productId }, select: { sellerId: true, title: true } }),
  ]);
  if (!offer) throw new CatalogueError("This offer no longer exists");
  if (offer.status !== "ACCEPTED") throw new CatalogueError("Accept the offer first");
  if (!product) throw new CatalogueError("Choose a product from the list");
  if (product.sellerId && product.sellerId !== offer.sellerId)
    throw new CatalogueError("That product belongs to another factory");
  await db.$transaction([
    db.stockOffer.update({ where: { id: offerId }, data: { productId } }),
    db.product.update({ where: { id: productId }, data: { sellerId: offer.sellerId } }),
  ]);
  await notify([offer.sellerId], {
    title: "Your design is in our shop",
    body: product.title,
    href: `/seller/designs/${productId}`,
  });
}

/** Products an admin can put an offer's pieces on: this factory's, then ones with no factory. */
export function linkChoices(sellerId: string) {
  return db.product.findMany({
    where: { OR: [{ sellerId }, { sellerId: null }] },
    select: { id: true, title: true, brand: true, sellerId: true },
    orderBy: [{ sellerId: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 200,
  });
}

/** The seller's designs, for the "Same design as" choice on a bulk offer. */
export function designChoices(sellerId: string) {
  return db.product.findMany({
    where: { sellerId },
    select: { id: true, title: true },
    orderBy: { createdAt: "desc" },
  });
}

export function kindLabel(audience: string | null, kind: string | null) {
  const a = AUDIENCES.find((x) => x.id === audience)?.label;
  const k = findKind(kind)?.label;
  return [a, k].filter(Boolean).join(" · ");
}

type LineRow = {
  productId: string;
  size: string;
  colour: string;
  qty: number;
  unitPrice: { toString(): string };
  at: Date;
  userId: string;
  status: string;
};

/** Every cart line of these products, oldest first, with whether its cart was paid for. */
async function linesOf(productIds: string[]) {
  if (productIds.length === 0) return [];
  const rows = await db.$queryRaw<LineRow[]>`
    SELECT v."productId", v."size", v."colour", l."qty", l."unitPrice", l."createdAt" AS "at",
           l."userId", c."status"::text AS "status"
    FROM "CartLine" l
    JOIN "Variant" v ON v."id" = l."variantId"
    JOIN "GroupCart" c ON c."id" = l."cartId"
    WHERE v."productId" = ANY(${productIds})
    ORDER BY l."createdAt" ASC`;
  const paid = new Set<string>(PAID);
  return rows.map((r) => ({ ...r, bought: paid.has(r.status) }));
}

type Line = Awaited<ReturnType<typeof linesOf>>[number];

const START = { prices: { select: { at: true }, orderBy: { at: "asc" as const }, take: 1 } };

/** Pieces bought per day on sale for one product. */
function rateOf(
  p: { createdAt: Date; prices: { at: Date }[]; variants: { available: number }[] },
  lines: Line[],
  now: Date,
) {
  const start = p.prices[0]?.at ?? p.createdAt;
  const free = p.variants.reduce((n, v) => n + v.available, 0);
  const sold = lines.filter((l) => l.bought);
  const bought = sold.reduce((n, l) => n + l.qty, 0);
  const days = daysOnSale(start, now, free, sold.at(-1)?.at ?? null);
  return { start, days, rate: sellRate(bought, days) };
}

/** Rates of other designs with the same audience and category, per kind. */
async function similarRates(kinds: string[], exclude: string[], now: Date) {
  const out = new Map<string, number[]>();
  if (kinds.length === 0) return out;
  const products = await db.product.findMany({
    where: { kind: { in: kinds }, id: { notIn: exclude }, variants: { some: {} } },
    select: {
      id: true,
      kind: true,
      createdAt: true,
      variants: { select: { available: true } },
      ...START,
    },
  });
  const lines = await linesOf(products.map((p) => p.id));
  for (const p of products) {
    const r = rateOf(
      p,
      lines.filter((l) => l.productId === p.id),
      now,
    );
    const list = out.get(p.kind!) ?? [];
    list.push(r.rate);
    out.set(p.kind!, list);
  }
  return out;
}

const DESIGN = {
  id: true,
  title: true,
  brand: true,
  category: true,
  audience: true,
  kind: true,
  price: true,
  photoKey: true,
  createdAt: true,
  variants: {
    select: { size: true, colour: true, available: true, reserved: true, sold: true },
    orderBy: [{ size: "asc" as const }, { colour: "asc" as const }],
  },
  offers: {
    select: { id: true, kind: true, status: true, name: true, receivedAt: true, decidedAt: true },
    orderBy: { createdAt: "asc" as const },
  },
  ...START,
};

const toDemand = (l: Line): DemandLine => ({
  qty: l.qty,
  unitPrice: l.unitPrice,
  at: l.at,
  userId: l.userId,
  bought: l.bought,
});

type OfferRow = { kind: string; status: string; receivedAt: Date | null; decidedAt: Date | null };

/** When a tested design's accepted bulk reached our store (else when it was accepted); else null. */
function bulkFrom(offers: OfferRow[]) {
  if (!offers.some((o) => o.kind === "TEST")) return null;
  const bulk = offers.find((o) => o.kind === "BULK" && o.status === "ACCEPTED");
  return bulk ? (bulk.receivedAt ?? bulk.decidedAt) : null;
}

/** The seller's home: each design with its demand, newest first. */
export async function sellerDesigns(sellerId: string, now = new Date()) {
  const products = await db.product.findMany({
    where: { sellerId },
    select: DESIGN,
    orderBy: { createdAt: "desc" },
  });
  const ids = products.map((p) => p.id);
  const [lines, similar] = await Promise.all([
    linesOf(ids),
    similarRates([...new Set(products.flatMap((p) => (p.kind ? [p.kind] : [])))], ids, now),
  ]);
  return products.map((p) => {
    const mine = lines.filter((l) => l.productId === p.id);
    const sum = (k: "available" | "reserved" | "sold") => p.variants.reduce((n, v) => n + v[k], 0);
    const { rate } = rateOf(p, mine, now);
    const stage = bulkFrom(p.offers)
      ? "bulk"
      : p.offers.some((o) => o.kind === "TEST")
        ? "test"
        : null;
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      photoKey: p.photoKey,
      kindLabel: kindLabel(p.audience, p.kind),
      price: toD(p.price),
      stage,
      ...demandOf(mine.map(toDemand)),
      free: sum("available"),
      stocked: sum("available") + sum("reserved") + sum("sold"),
      sold: sum("sold"),
      rate,
      label: demandLabel(rate, (p.kind && similar.get(p.kind)) || []),
    };
  });
}

export type SellerDesign = Awaited<ReturnType<typeof sellerDesigns>>[number];

/** One design for its factory: demand, price and quantity by day and by price, sizes, test vs bulk. */
export async function designInsight(sellerId: string, productId: string, now = new Date()) {
  const p = await db.product.findFirst({
    where: { id: productId, sellerId },
    select: {
      ...DESIGN,
      prices: { select: { price: true, at: true }, orderBy: { at: "asc" } },
    },
  });
  if (!p) return null;
  const [lines, similar] = await Promise.all([
    linesOf([p.id]),
    p.kind ? similarRates([p.kind], [p.id], now) : Promise.resolve(new Map<string, number[]>()),
  ]);
  const demand = lines.map(toDemand);
  const spans = priceSpans(p.prices.length ? p.prices : [{ price: p.price, at: p.createdAt }], now);
  const { days, rate } = rateOf(p, lines, now);
  const others = (p.kind && similar.get(p.kind)) || [];

  const from = bulkFrom(p.offers);
  const split = splitTestBulk(demand, from);
  const hasTest = p.offers.some((o) => o.kind === "TEST");

  // The category's size order (S, M, L, XL), other sizes after.
  const order = sizesFor(p.kind ?? undefined);
  const rank = (s: string) => (order.includes(s) ? order.indexOf(s) : order.length);
  const variants = [...p.variants].sort((a, b) => rank(a.size) - rank(b.size));
  const sizes = variants.map((v) => {
    const own = lines.filter((l) => l.size === v.size && l.colour === v.colour);
    return {
      label: v.colour ? `${v.size} ${v.colour}` : v.size,
      wanted: own.reduce((n, l) => n + l.qty, 0),
      bought: v.sold,
      inCarts: v.reserved,
      left: v.available,
    };
  });

  return {
    id: p.id,
    title: p.title,
    brand: p.brand,
    category: p.category,
    photoKey: p.photoKey,
    kindLabel: kindLabel(p.audience, p.kind),
    price: toD(p.price),
    offers: p.offers,
    demand: demandOf(demand),
    daysOnSale: Math.round(days),
    rate,
    similar: similarRate(others),
    label: demandLabel(rate, others),
    chart: chartDays(spans, demand, now),
    byPrice: byPrice(spans, demand),
    sizes,
    soldPct: percentOf(
      sizes.reduce((n, s) => n + s.bought, 0),
      sizes.reduce((n, s) => n + s.bought + s.inCarts + s.left, 0),
    ),
    test: hasTest ? demandOf(split.test) : null,
    /** A bulk was offered (waiting or accepted), so there is nothing more to offer. */
    bulkOffered: p.offers.some((o) => o.kind === "BULK" && o.status !== "DECLINED"),
    bulk: hasTest && from ? { ...demandOf(split.bulk), from } : null,
  };
}

export type DesignInsight = NonNullable<Awaited<ReturnType<typeof designInsight>>>;
