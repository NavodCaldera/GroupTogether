import "server-only";
import { randomUUID } from "node:crypto";
import { D, toD } from "@/lib/decimal";
import { orderTotals, splitCheckout, type OrderTotals, type Rates } from "@/lib/agent-money";
import { validCommission } from "@/lib/price-rules";
import { isBuyerRole } from "@/lib/roles";
import { db, type Tx } from "../db";
import { CartError } from "../carts/errors";
import { getSettings } from "../settings";
import { assertTokenHolder, post, tokenBalance } from "../tokens";
import { getGateway } from "../payments/gateway";
import { appUrl } from "../notify";
import { markOrdersPaid } from "./baskets";
import { lockBasketSlot, withOrderTransaction } from "./locks";

export class CheckoutError extends CartError {}

export type CartLineView = {
  itemId: string;
  variantId: string;
  productId: string;
  title: string;
  size: string;
  colour: string;
  qty: number;
  unitPrice: D;
  factoryPrice: D | null;
  /** Free units right now */
  inStock: number;
  /** The product can still be bought */
  available: boolean;
};

export type CartGroup = {
  factoryId: string;
  name: string;
  lines: CartLineView[];
  totals: OrderTotals;
};

/** Buyers and agents shop; factory accounts, factory staff, admins and locked accounts do not. */
export async function assertBuyer(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, locked: true, factoryId: true, name: true, email: true },
  });
  if (!user || !isBuyerRole(user.role) || user.locked || user.factoryId)
    throw new CheckoutError("This account cannot buy");
  return user;
}

export function ratesOf(s: {
  courierPerItem: { toString(): string };
  agentFeePerItem: { toString(): string };
  gatewayFeeRate: { toString(): string };
}): Rates {
  return {
    courierPerItem: toD(s.courierPerItem),
    agentFeePerItem: toD(s.agentFeePerItem),
    gatewayFeeRate: toD(s.gatewayFeeRate),
  };
}

/** The buyer's cart grouped by factory (sorted by factory id, lines by variant id). */
export async function loadCart(tx: Tx, buyerId: string, rates: Rates): Promise<CartGroup[]> {
  const items = await tx.cartItem.findMany({
    where: { buyerId },
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              status: true,
              price: true,
              factoryPrice: true,
              sellerId: true,
              seller: { select: { name: true, company: true } },
            },
          },
        },
      },
    },
  });
  const groups = new Map<string, CartGroup>();
  for (const item of [...items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
    const p = item.variant.product;
    const key = p.sellerId ?? "";
    const group = groups.get(key) ?? {
      factoryId: key,
      name: p.seller?.company || p.seller?.name || "",
      lines: [],
      totals: orderTotals([], rates),
    };
    group.lines.push({
      itemId: item.id,
      variantId: item.variantId,
      productId: p.id,
      title: p.title,
      size: item.variant.size,
      colour: item.variant.colour,
      qty: item.qty,
      unitPrice: toD(p.price),
      factoryPrice: p.factoryPrice === null ? null : toD(p.factoryPrice),
      inStock: item.variant.available,
      available: p.status === "LIVE" && p.sellerId !== null && p.factoryPrice !== null,
    });
    groups.set(key, group);
  }
  const out = [...groups.values()].sort((a, b) => a.factoryId.localeCompare(b.factoryId));
  for (const g of out)
    g.totals = orderTotals(
      g.lines.filter((l) => l.available),
      rates,
    );
  return out;
}

function parseTokens(tokens: string): D {
  if (typeof tokens !== "string" || !validCommission(tokens.trim()))
    throw new CheckoutError("Enter tokens as an amount with at most two decimals");
  return new D(tokens.trim());
}

/** Holds the Agent row FOR SHARE (before any basket advisory) so a suspension or leave cannot
 * commit between this check and the order being placed. */
async function assertAgentLive(tx: Tx, agentId: string) {
  if (typeof agentId !== "string") throw new CheckoutError("This agent is not taking orders");
  await tx.$queryRaw`SELECT 1 FROM "Agent" WHERE id = ${agentId} FOR SHARE`;
  const agent = await tx.agent.findUnique({ where: { id: agentId }, select: { status: true } });
  if (!agent || agent.status !== "LIVE") throw new CheckoutError("This agent is not taking orders");
}

/** Everything checkout computes, with no writes. */
async function planCheckout(tx: Tx, buyerId: string, agentId: string, tokens: string) {
  const buyer = await assertBuyer(tx, buyerId);
  await assertAgentLive(tx, agentId);
  const wanted = parseTokens(tokens);
  const settings = await getSettings(tx);
  const rates = ratesOf(settings);
  const groups = await loadCart(tx, buyerId, rates);
  if (!groups.length) throw new CheckoutError("Your cart is empty");
  for (const g of groups)
    for (const l of g.lines)
      if (!l.available) throw new CheckoutError(`No longer available: ${l.title}`);
  if (wanted.gt(0)) {
    try {
      await assertTokenHolder(tx, buyerId);
    } catch {
      throw new CheckoutError("This account cannot use tokens");
    }
    if (wanted.gt(await tokenBalance(buyerId, tx)))
      throw new CheckoutError("You do not have that many tokens");
  }
  const totals = groups.map((g) => g.totals);
  const gross = totals.reduce((s, t) => s.plus(t.gross), new D(0));
  const split = splitCheckout(totals, D.min(wanted, gross), rates.gatewayFeeRate);
  return { buyer, settings, groups, totals, split };
}

export async function quoteCheckout(
  buyerId: string,
  agentId: string,
  tokens: string,
): Promise<ReturnType<typeof splitCheckout> & { orders: OrderTotals[] }> {
  const plan = await planCheckout(db, buyerId, agentId, tokens);
  return Object.assign(plan.split, { orders: plan.totals });
}

type Outcome = {
  attemptId: string | null;
  orderIds: string[];
  /** Set when the gateway still has to be visited */
  pay: { amount: string; buyer: { id: string; name: string; email: string | null } } | null;
};

/** Lock order: buyer advisory -> Agent row (FOR SHARE) -> basket advisories (sorted, only when
 * tokens pay everything) ->
 * Variant rows (variantId order) -> new Order rows -> ledger User row -> Basket rows under their
 * advisories. The gateway is called after commit.
 */
export async function startCheckout(
  buyerId: string,
  input: { agentId: string; tokens: string; requestKey: string },
): Promise<{ attemptId: string | null; redirectUrl: string | null; orderIds: string[] }> {
  if (typeof input.requestKey !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(input.requestKey))
    throw new CheckoutError("Invalid checkout request");
  const outcome = await withOrderTransaction<Outcome>([buyerId], [], async (tx) => {
    const previous = await tx.order.findMany({
      where: { buyerId, checkoutKey: input.requestKey },
      orderBy: { id: "asc" },
      select: {
        id: true,
        paymentAttemptId: true,
        paymentAttempt: { select: { status: true, amount: true } },
        buyer: { select: { id: true, name: true, email: true } },
      },
    });
    if (previous.length) {
      const attempt = previous[0].paymentAttempt;
      return {
        attemptId: previous[0].paymentAttemptId,
        orderIds: previous.map((o) => o.id),
        pay:
          attempt?.status === "PENDING"
            ? { amount: toD(attempt.amount).toFixed(2), buyer: previous[0].buyer }
            : null,
      };
    }

    const plan = await planCheckout(tx, buyerId, input.agentId, input.tokens);
    const now = new Date();
    const holdUntil = new Date(now.getTime() + plan.settings.paymentHoldMinutes * 60_000);

    const totalDue = plan.split.reduce((s, p) => s.plus(p.due), new D(0));
    // Paying in full now: basket advisories (sorted by factory id, one agent) come before any
    // Variant row lock, matching markOrdersPaid on the payment-notice path.
    if (totalDue.isZero())
      for (const g of plan.groups) await lockBasketSlot(tx, input.agentId, g.factoryId);

    const lines = plan.groups
      .flatMap((g) => g.lines)
      .sort((a, b) => a.variantId.localeCompare(b.variantId));
    for (const l of lines) {
      const reserved = await tx.variant.updateMany({
        where: { id: l.variantId, available: { gte: l.qty } },
        data: { available: { decrement: l.qty }, reserved: { increment: l.qty } },
      });
      if (reserved.count === 0) {
        const left = await tx.variant.findUnique({
          where: { id: l.variantId },
          select: { available: true },
        });
        throw new CheckoutError(`Only ${left?.available ?? 0} left of ${l.title}`);
      }
    }

    const attempt = totalDue.gt(0)
      ? await tx.paymentAttempt.create({
          data: {
            purpose: "ORDERS",
            buyerId,
            amount: totalDue.toFixed(2),
            currency: "LKR",
            gatewayRef: `ga_${randomUUID()}`,
            expiresAt: holdUntil,
          },
        })
      : null;

    const orders: { id: string; tokens: D }[] = [];
    for (const [i, g] of plan.groups.entries()) {
      const part = plan.split[i];
      const order = await tx.order.create({
        data: {
          buyerId,
          agentId: input.agentId,
          factoryId: g.factoryId,
          paymentAttemptId: attempt?.id ?? null,
          itemsTotal: g.totals.items.toFixed(2),
          courierTotal: g.totals.courier.toFixed(2),
          agentFeeTotal: g.totals.agentFee.toFixed(2),
          tokensApplied: part.tokens.toFixed(2),
          gatewayFee: part.fee.toFixed(2),
          amountDue: part.due.toFixed(2),
          holdUntil,
          checkoutKey: input.requestKey,
          lines: {
            create: g.lines.map((l) => ({
              variantId: l.variantId,
              qty: l.qty,
              unitPrice: l.unitPrice.toFixed(2),
              factoryPrice: l.factoryPrice!.toFixed(2),
              courierEach: toD(plan.settings.courierPerItem).toFixed(2),
              agentFeeEach: toD(plan.settings.agentFeePerItem).toFixed(2),
            })),
          },
        },
        select: { id: true },
      });
      orders.push({ id: order.id, tokens: part.tokens });
    }

    // Paying in full: the basket advisories taken above are held, so locking the ledger row here
    // before markOrdersPaid writes Basket rows is safe (every Basket writer takes the advisory first).
    for (const o of orders)
      if (o.tokens.gt(0))
        await post(tx, {
          userId: buyerId,
          amount: o.tokens.neg(),
          kind: "HOLD",
          eventKey: `hold:${o.id}`,
          note: "Tokens held for order",
          orderId: o.id,
        });

    if (!attempt)
      await markOrdersPaid(
        tx,
        orders.map((o) => o.id),
        now,
      );

    await tx.cartItem.deleteMany({ where: { buyerId } });
    return {
      attemptId: attempt?.id ?? null,
      orderIds: orders.map((o) => o.id).sort(),
      pay: attempt ? { amount: totalDue.toFixed(2), buyer: plan.buyer } : null,
    };
  });

  let redirectUrl: string | null = null;
  if (outcome.attemptId && outcome.pay) {
    const { redirectUrl: url } = await getGateway().createCheckout({
      attemptId: outcome.attemptId,
      amount: outcome.pay.amount,
      currency: "LKR",
      returnUrl: appUrl(`/checkout/return/${outcome.attemptId}`),
      notifyUrl: appUrl("/api/payments/notify"),
      buyer: outcome.pay.buyer,
    });
    redirectUrl = url;
  }
  return { attemptId: outcome.attemptId, redirectUrl, orderIds: outcome.orderIds };
}
