import "server-only";
import { D, toD } from "@/lib/decimal";
import {
  checkEndsAt,
  dealRebate,
  DealRuleError,
  nextTier,
  parseMaxQty,
  parseTiers,
  tierAt,
  unitsLeft,
  type TierInput,
} from "@/lib/deal-rules";
import { tierBuyerPrice } from "@/lib/price-rules";
import { formatLKR } from "@/lib/format";
import { CartError } from "@/server/errors";
import { db, type Tx } from "./db";
import { getSettings } from "./settings";
import { post } from "./tokens";
import { notify } from "./notify";
import { lockLedgerUsers, withOrderTransaction } from "./orders/locks";

/**
 * Group deals (DEAL-001..003, DEC-029). A factory runs a deal on one product with quantity tiers.
 * Buyers pay tier 1's price. Units are held at checkout (unitsHeld, like Variant.reserved) and count
 * toward the tier only once the payment is verified (unitsSold, like Variant.sold); an order that
 * expires gives its held units back. After endsAt the sweep closes the deal and, once no order is
 * still waiting for payment, settles it once at the highest tier reached: each kept unit gets
 * (paid − final) back as DEAL_REBATE tokens and the factory is paid the final factory price.
 *
 * Lock order: GroupDeal rows (sorted by id, FOR UPDATE) come after Variant rows and basket
 * advisories and before ledger User rows. Settlement takes the buyers' advisories and Order rows
 * first, then the deal row.
 */

export class DealError extends CartError {}

export type DealPrice = { dealId: string; unitPrice: D; factoryPrice: D };

/** Tier 1 prices of products with a running deal (LIVE, started, not ended). No locks. */
export async function liveDealPrices(
  tx: Tx,
  productIds: string[],
  now = new Date(),
): Promise<Map<string, DealPrice>> {
  const ids = [...new Set(productIds)];
  if (!ids.length) return new Map();
  const deals = await tx.groupDeal.findMany({
    where: { productId: { in: ids }, status: "LIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    select: {
      id: true,
      productId: true,
      tiers: { where: { minQty: 1 }, select: { buyerPrice: true, factoryPrice: true } },
    },
  });
  const out = new Map<string, DealPrice>();
  for (const d of deals) {
    const t = d.tiers[0];
    if (t)
      out.set(d.productId, {
        dealId: d.id,
        unitPrice: toD(t.buyerPrice),
        factoryPrice: toD(t.factoryPrice),
      });
  }
  return out;
}

function perDeal(lines: { dealId: string | null; qty: number }[]) {
  const m = new Map<string, number>();
  for (const l of lines) if (l.dealId) m.set(l.dealId, (m.get(l.dealId) ?? 0) + l.qty);
  return [...m].sort(([a], [b]) => a.localeCompare(b));
}

async function lockDeal(tx: Tx, dealId: string) {
  await tx.$queryRaw`SELECT 1 FROM "GroupDeal" WHERE id = ${dealId} FOR UPDATE`;
  return tx.groupDeal.findUniqueOrThrow({
    where: { id: dealId },
    select: {
      id: true,
      status: true,
      endsAt: true,
      startsAt: true,
      maxQty: true,
      unitsSold: true,
      unitsHeld: true,
    },
  });
}

/** Checkout, after the Variant rows: holds the deal units of new orders. Refuses a deal that
 * ended meanwhile and units beyond the factory's capacity. */
export async function holdDealUnits(
  tx: Tx,
  lines: { dealId: string | null; qty: number }[],
  now: Date,
): Promise<void> {
  for (const [dealId, qty] of perDeal(lines)) {
    const deal = await lockDeal(tx, dealId);
    if (deal.status !== "LIVE" || deal.endsAt <= now || deal.startsAt > now)
      throw new DealError("This deal has just ended. Check your cart again");
    const left = unitsLeft(deal);
    if (left !== null && qty > left)
      throw new DealError(left ? `Only ${left} left in this deal` : "This deal is sold out");
    await tx.groupDeal.update({ where: { id: dealId }, data: { unitsHeld: { increment: qty } } });
  }
}

async function dealLinesOf(tx: Tx, orderIds: string[]) {
  return tx.orderLine.findMany({
    where: { orderId: { in: orderIds }, dealId: { not: null } },
    select: { dealId: true, qty: true },
  });
}

/** markOrdersPaid, after the Variant rows: the verified payment moves held units to sold. */
export async function confirmDealUnits(tx: Tx, orderIds: string[]): Promise<void> {
  for (const [dealId, qty] of perDeal(await dealLinesOf(tx, orderIds))) {
    await lockDeal(tx, dealId);
    const moved = await tx.groupDeal.updateMany({
      where: { id: dealId, unitsHeld: { gte: qty }, status: { in: ["LIVE", "CLOSED"] } },
      data: { unitsHeld: { decrement: qty }, unitsSold: { increment: qty } },
    });
    if (moved.count !== 1) throw new DealError("Deal units are missing");
  }
}

/** releasePendingOrders, after the Variant rows: an unpaid order gives its held units back. */
export async function releaseDealUnits(tx: Tx, orderIds: string[]): Promise<void> {
  for (const [dealId, qty] of perDeal(await dealLinesOf(tx, orderIds))) {
    await lockDeal(tx, dealId);
    const moved = await tx.groupDeal.updateMany({
      where: { id: dealId, unitsHeld: { gte: qty } },
      data: { unitsHeld: { decrement: qty } },
    });
    if (moved.count !== 1) throw new DealError("Deal units are missing");
  }
}

/**
 * Caller holds the line's Order row. Paid units leave a deal (missing, returned, cancelled): before
 * settlement they come off unitsSold (DEAL-003); after it the tier stays. Returns the line's prices
 * as they stand under the deal lock: the final prices once settled, else null.
 */
export async function dealUnitsLeaving(
  tx: Tx,
  lines: { id: string; dealId: string | null; qty: number }[],
): Promise<Map<string, { unitPrice: D; factoryPrice: D }>> {
  const settled = new Map<string, { unitPrice: D; factoryPrice: D }>();
  for (const [dealId, qty] of perDeal(lines)) {
    const deal = await lockDeal(tx, dealId);
    if (deal.status === "SETTLED") {
      const rows = await tx.orderLine.findMany({
        where: { id: { in: lines.filter((l) => l.dealId === dealId).map((l) => l.id) } },
        select: { id: true, finalUnitPrice: true, finalFactoryPrice: true },
      });
      for (const r of rows)
        if (r.finalUnitPrice !== null && r.finalFactoryPrice !== null)
          settled.set(r.id, {
            unitPrice: toD(r.finalUnitPrice),
            factoryPrice: toD(r.finalFactoryPrice),
          });
      continue;
    }
    const moved = await tx.groupDeal.updateMany({
      where: { id: dealId, unitsSold: { gte: qty } },
      data: { unitsSold: { decrement: qty } },
    });
    if (moved.count !== 1) throw new DealError("Deal units are missing");
  }
  return settled;
}

/** Rebate tokens already given on an order's lines. */
export async function rebatesGiven(tx: Tx, orderId: string): Promise<D> {
  const sum = await tx.tokenEntry.aggregate({
    where: { orderId, kind: "DEAL_REBATE" },
    _sum: { amount: true },
  });
  return sum._sum.amount === null ? new D(0) : toD(sum._sum.amount);
}

// ─── Settlement (sweep only) ──────────────────────────────────────────────

type Settled = {
  dealId: string;
  title: string;
  factoryId: string;
  unitsSold: number;
  finalPrice: D;
  rebates: Map<string, D>;
  buyers: string[];
};

async function settleOne(dealId: string, now: Date): Promise<Settled | null> {
  const lines = await db.orderLine.findMany({
    where: { dealId },
    select: { orderId: true, order: { select: { buyerId: true } } },
  });
  const orderIds = [...new Set(lines.map((l) => l.orderId))];
  const buyerIds = [...new Set(lines.map((l) => l.order.buyerId))];
  return withOrderTransaction(buyerIds, orderIds, async (tx) => {
    const deal = await lockDeal(tx, dealId);
    if (deal.status !== "CLOSED" || deal.unitsHeld > 0) return null;
    const rows = await tx.orderLine.findMany({
      where: { dealId },
      select: {
        id: true,
        orderId: true,
        qty: true,
        missingQty: true,
        returnedQty: true,
        unitPrice: true,
        paidUnitPrice: true,
        order: { select: { status: true, buyerId: true } },
      },
      orderBy: { id: "asc" },
    });
    // An order placed after the list was read is not locked: retry next sweep.
    if (rows.some((r) => !orderIds.includes(r.orderId))) return null;
    if (rows.some((r) => r.order.status === "PENDING")) return null;
    const full = await tx.groupDeal.findUniqueOrThrow({
      where: { id: dealId },
      select: {
        factoryId: true,
        product: { select: { title: true } },
        tiers: { orderBy: { minQty: "asc" } },
      },
    });
    const tier = tierAt(full.tiers, deal.unitsSold);
    const finalPrice = toD(tier.buyerPrice);
    const kept = rows.filter((r) => r.order.status === "PAID" || r.order.status === "RECEIVED");
    const rebates = new Map<string, D>();
    const owed: { line: (typeof kept)[number]; amount: D }[] = [];
    for (const r of kept) {
      const amount = dealRebate(
        toD(r.paidUnitPrice ?? r.unitPrice),
        finalPrice,
        r.qty,
        r.missingQty,
        r.returnedQty,
      );
      if (amount.gt(0)) owed.push({ line: r, amount });
    }
    if (kept.length)
      await tx.orderLine.updateMany({
        where: { id: { in: kept.map((r) => r.id) } },
        data: {
          finalUnitPrice: finalPrice.toFixed(2),
          finalFactoryPrice: toD(tier.factoryPrice).toFixed(2),
        },
      });
    await tx.groupDeal.update({
      where: { id: dealId },
      data: { status: "SETTLED", finalTierId: tier.id, settledAt: now },
    });
    // Ledger rows last, in sorted order.
    await lockLedgerUsers(
      tx,
      owed.map((o) => o.line.order.buyerId),
    );
    for (const { line, amount } of owed) {
      await post(tx, {
        userId: line.order.buyerId,
        amount,
        kind: "DEAL_REBATE",
        eventKey: `deal-rebate:${dealId}:${line.id}`,
        note: `${full.product.title}: group deal closed at ${formatLKR(finalPrice)} each`,
        orderId: line.orderId,
        orderLineId: line.id,
      });
      const buyer = line.order.buyerId;
      rebates.set(buyer, (rebates.get(buyer) ?? new D(0)).plus(amount));
    }
    return {
      dealId,
      title: full.product.title,
      factoryId: full.factoryId,
      unitsSold: deal.unitsSold,
      finalPrice,
      rebates,
      buyers: [...new Set(kept.map((r) => r.order.buyerId))],
    };
  });
}

/** Sweep: closes deals past endsAt, then settles each closed deal with no unpaid order left.
 * Each deal settles in its own transaction; a failure retries next run. Notices follow commit. */
export async function sweepDeals(
  now: Date,
): Promise<{ dealsClosed: number; dealsSettled: number }> {
  const closed = await db.groupDeal.updateMany({
    where: { status: "LIVE", endsAt: { lte: now } },
    data: { status: "CLOSED" },
  });
  const due = await db.groupDeal.findMany({
    where: { status: "CLOSED", unitsHeld: 0 },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  let settled = 0;
  for (const { id } of due) {
    try {
      const done = await settleOne(id, now);
      if (!done) continue;
      settled++;
      await announceSettled(done);
    } catch (error) {
      console.error("Deal settlement will retry", id, error);
    }
  }
  return { dealsClosed: closed.count, dealsSettled: settled };
}

async function announceSettled(s: Settled) {
  const price = formatLKR(s.finalPrice);
  for (const buyer of s.buyers) {
    const back = s.rebates.get(buyer);
    await notify(
      [buyer],
      back
        ? {
            title: "Deal closed: tokens back",
            body: `${s.title} · ${price} each · ${back.toFixed(2)} tokens`,
            href: "/tokens",
          }
        : { title: "Deal closed", body: `${s.title} · ${price} each`, href: "/orders" },
      `deal:${s.dealId}:settled`,
    );
  }
  await notify(
    [s.factoryId],
    { title: "Deal closed", body: `${s.title} · ${s.unitsSold} sold · ${price} each` },
    `deal:${s.dealId}:factory`,
  );
}

// ─── Factory: drafts and going live ───────────────────────────────────────

export type DealDraftInput = {
  endsAt: string;
  maxQty: string;
  tiers: TierInput[];
};

function asDealError<T>(work: () => T): T {
  try {
    return work();
  } catch (e) {
    if (e instanceof DealRuleError) throw new DealError(e.message);
    throw e;
  }
}

/** Colombo wall time "2026-12-01T18:00" (from a datetime-local input) as a Date. */
export function colomboInput(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    ? new Date(`${value}:00+05:30`)
    : new Date(NaN);
}

async function ownProduct(tx: Tx, factoryId: string, productId: string) {
  const p = await tx.product.findFirst({
    where: { id: productId, sellerId: factoryId, seller: { isBrand: false } },
    select: { id: true, status: true, commission: true },
  });
  if (!p) throw new DealError("Product not found");
  return p;
}

/** Creates or edits a DRAFT deal on the factory's own product. Tier buyer prices are previewed now
 * and copied again when the deal goes live. */
export async function saveDealDraft(
  factoryId: string,
  productId: string,
  dealId: string | null,
  input: DealDraftInput,
  now = new Date(),
): Promise<string> {
  const tiers = asDealError(() => parseTiers(input.tiers ?? []));
  const maxQty = asDealError(() => parseMaxQty(String(input.maxQty ?? ""), tiers));
  const endsAt = asDealError(() => checkEndsAt(colomboInput(String(input.endsAt ?? "")), now));
  return withOrderTransaction([factoryId], [], async (tx) => {
    const product = await ownProduct(tx, factoryId, productId);
    const settings = await getSettings(tx);
    const rows = asDealError(() =>
      tiers.map((t) => ({
        minQty: t.minQty,
        factoryPrice: t.factoryPrice.toFixed(2),
        buyerPrice: tierBuyerPrice(t.factoryPrice, product, settings).toFixed(2),
      })),
    );
    if (dealId) {
      const deal = await tx.groupDeal.findFirst({
        where: { id: dealId, factoryId, productId },
        select: { id: true },
      });
      if (!deal) throw new DealError("Deal not found");
      const d = await lockDeal(tx, deal.id);
      if (d.status !== "DRAFT") throw new DealError("A live deal cannot change");
      await tx.priceTier.deleteMany({ where: { dealId: d.id } });
      await tx.groupDeal.update({
        where: { id: d.id },
        data: { endsAt, maxQty, tiers: { create: rows } },
      });
      return d.id;
    }
    if (await tx.groupDeal.count({ where: { productId, status: "DRAFT" } }))
      throw new DealError("This product already has a draft deal");
    const created = await tx.groupDeal.create({
      data: { productId, factoryId, endsAt, maxQty, tiers: { create: rows } },
      select: { id: true },
    });
    return created.id;
  });
}

/** DRAFT -> LIVE: starts now, buyer prices copied from the current commission. One LIVE deal per
 * product (unique index). */
export async function startDeal(factoryId: string, dealId: string, now = new Date()) {
  try {
    await withOrderTransaction([factoryId], [], async (tx) => {
      const found = await tx.groupDeal.findFirst({
        where: { id: dealId, factoryId },
        select: { id: true, productId: true },
      });
      if (!found) throw new DealError("Deal not found");
      // The product row before the deal row, as saveProduct takes it.
      await tx.$queryRaw`SELECT 1 FROM "Product" WHERE id = ${found.productId} FOR SHARE`;
      const product = await ownProduct(tx, factoryId, found.productId);
      if (product.status !== "LIVE") throw new DealError("Publish the product first");
      const deal = await lockDeal(tx, dealId);
      if (deal.status !== "DRAFT") throw new DealError("This deal is not a draft");
      asDealError(() => checkEndsAt(deal.endsAt, now));
      const settings = await getSettings(tx);
      const tiers = await tx.priceTier.findMany({ where: { dealId }, orderBy: { minQty: "asc" } });
      if (!tiers.length || tiers[0]!.minQty !== 1)
        throw new DealError("The first tier starts at 1");
      for (const t of tiers)
        await tx.priceTier.update({
          where: { id: t.id },
          data: {
            buyerPrice: asDealError(() =>
              tierBuyerPrice(t.factoryPrice.toString(), product, settings).toFixed(2),
            ),
          },
        });
      if (
        await tx.groupDeal.count({
          where: { productId: found.productId, status: { in: ["LIVE", "CLOSED"] } },
        })
      )
        throw new DealError("This product already has a deal running");
      await tx.groupDeal.update({ where: { id: dealId }, data: { status: "LIVE", startsAt: now } });
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002")
      throw new DealError("This product already has a deal running");
    throw e;
  }
}

/** Discards a DRAFT deal. */
export async function discardDeal(factoryId: string, dealId: string) {
  const done = await db.groupDeal.updateMany({
    where: { id: dealId, factoryId, status: "DRAFT" },
    data: { status: "CANCELLED" },
  });
  if (done.count !== 1) throw new DealError("This deal is not a draft");
}

// ─── Views ────────────────────────────────────────────────────────────────

/** The running deal on a product for its page: units sold, the next tier, prices. */
export async function dealView(productId: string, now = new Date()) {
  const deal = await db.groupDeal.findFirst({
    where: { productId, status: "LIVE", startsAt: { lte: now }, endsAt: { gt: now } },
    select: {
      id: true,
      endsAt: true,
      maxQty: true,
      unitsSold: true,
      unitsHeld: true,
      tiers: { orderBy: { minQty: "asc" }, select: { minQty: true, buyerPrice: true } },
    },
  });
  if (!deal || !deal.tiers.length) return null;
  const tiers = deal.tiers.map((t) => ({ minQty: t.minQty, price: toD(t.buyerPrice) }));
  const next = nextTier(tiers, deal.unitsSold);
  return {
    endsAt: deal.endsAt,
    sold: deal.unitsSold,
    left: unitsLeft(deal),
    paid: tiers[0]!.price,
    now: tierAt(tiers, deal.unitsSold).price,
    next: next ? { more: next.more, price: next.tier.price } : null,
    tiers,
  };
}

/** The factory's deals on one product, newest first, and a week from now for a new deal's end. */
export async function factoryDeals(factoryId: string, productId: string, now = new Date()) {
  const deals = await db.groupDeal.findMany({
    where: { factoryId, productId, status: { not: "CANCELLED" } },
    select: {
      id: true,
      status: true,
      startsAt: true,
      endsAt: true,
      maxQty: true,
      unitsSold: true,
      unitsHeld: true,
      finalTier: { select: { buyerPrice: true, factoryPrice: true } },
      tiers: {
        orderBy: { minQty: "asc" },
        select: { minQty: true, factoryPrice: true, buyerPrice: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return { deals, defaultEndsAt: new Date(now.getTime() + 7 * 86_400_000) };
}
