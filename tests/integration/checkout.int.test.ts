import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { D, toD } from "@/lib/decimal";
import { tokenBalance } from "@/server/tokens";
import { cartView, setCartItem } from "@/server/orders/cart";
import { CheckoutError, quoteCheckout, startCheckout } from "@/server/orders/checkout";
import { markOrdersPaid } from "@/server/orders/baskets";
import { withOrderTransaction } from "@/server/orders/locks";
import { fundTokens, makeAgent, makeBuyer, makeFactory, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
});
afterAll(() => db.$disconnect());

const variant = (id: string) => db.variant.findUniqueOrThrow({ where: { id } });
const money = (v: { toFixed(n: number): string }) => v.toFixed(2);

describe("cart", () => {
  it("holds no stock, groups by factory and removes at qty 0", async () => {
    const buyer = await makeBuyer();
    const a = await makeFactory(),
      b = await makeFactory();
    await setCartItem(buyer.id, a.variant.id, 2);
    await setCartItem(buyer.id, b.variant.id, 1);
    expect((await variant(a.variant.id)).available).toBe(50);
    const view = await cartView(buyer.id);
    expect(view.factories).toHaveLength(2);
    const fa = view.factories.find((f) => f.factoryId === a.factory.id)!;
    expect(money(fa.totals.items)).toBe("2200.00");
    expect(money(fa.totals.gross)).toBe("2320.00");
    await setCartItem(buyer.id, a.variant.id, 0);
    expect((await cartView(buyer.id)).factories).toHaveLength(1);
  });
});

describe("checkout", () => {
  it("reserves stock: 2 of 50 leaves 48 available and 2 reserved", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 2);
    const r = await startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k1" });
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([48, 2, 0]);
    expect(r.orderIds).toHaveLength(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    expect(order.status).toBe("PENDING");
    expect(order.holdUntil.getTime() - order.createdAt.getTime()).toBeGreaterThan(14 * 60_000);
    expect(await db.cartItem.count({ where: { buyerId: buyer.id } })).toBe(0);
  });

  it("amounts: a 1100 item with no tokens is due 1,199.59", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 1);
    const quote = await quoteCheckout(buyer.id, agent.id, "0");
    expect(money(quote[0].due)).toBe("1199.59");
    const r = await startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k1" });
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderIds[0] },
      include: { lines: true },
    });
    expect(money(order.itemsTotal)).toBe("1100.00");
    expect(money(order.courierTotal)).toBe("40.00");
    expect(money(order.agentFeeTotal)).toBe("20.00");
    expect(money(order.gatewayFee)).toBe("39.59");
    expect(money(order.amountDue)).toBe("1199.59");
    expect(money(order.lines[0].unitPrice)).toBe("1100.00");
    expect(money(order.lines[0].factoryPrice)).toBe("1000.00");
    expect(money(order.lines[0].courierEach)).toBe("40.00");
    expect(money(order.lines[0].agentFeeEach)).toBe("20.00");
    const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId! } });
    expect(attempt.purpose).toBe("ORDERS");
    expect(money(attempt.amount)).toBe("1199.59");
    expect(attempt.expiresAt.getTime()).toBe(order.holdUntil.getTime());
    expect(r.redirectUrl).toContain(`/demo-pay/${attempt.id}`);
  });

  it("two factories give two orders, one attempt and one fee", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const a = await makeFactory(),
      b = await makeFactory();
    await setCartItem(buyer.id, a.variant.id, 1);
    await setCartItem(buyer.id, b.variant.id, 1);
    const r = await startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k1" });
    expect(r.orderIds).toHaveLength(2);
    expect(await db.paymentAttempt.count()).toBe(1);
    const orders = await db.order.findMany({ where: { id: { in: r.orderIds } } });
    expect(new Set(orders.map((o) => o.paymentAttemptId))).toEqual(new Set([r.attemptId]));
    expect(new Set(orders.map((o) => o.factoryId))).toEqual(new Set([a.factory.id, b.factory.id]));
    // 2320 / 0.967 - 2320 = 79.17, charged once across both orders
    const fee = orders.reduce((s, o) => s.plus(toD(o.gatewayFee)), new D(0));
    expect(money(fee)).toBe("79.17");
    const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId! } });
    expect(money(attempt.amount)).toBe("2399.17");
  });

  it("tokens cover all: no attempt, both orders PAID and joined to baskets", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const a = await makeFactory(),
      b = await makeFactory();
    await fundTokens(buyer.id, "5000");
    await setCartItem(buyer.id, a.variant.id, 1);
    await setCartItem(buyer.id, b.variant.id, 1);
    const r = await startCheckout(buyer.id, {
      agentId: agent.id,
      tokens: "5000",
      requestKey: "k1",
    });
    expect(r.attemptId).toBeNull();
    expect(r.redirectUrl).toBeNull();
    expect(await db.paymentAttempt.count()).toBe(0);
    const orders = await db.order.findMany({ where: { id: { in: r.orderIds } } });
    expect(orders.map((o) => o.status)).toEqual(["PAID", "PAID"]);
    for (const o of orders) {
      expect(o.paidAt).not.toBeNull();
      expect(money(o.tokensApplied)).toBe("1160.00");
      expect(money(o.amountDue)).toBe("0.00");
      const basket = await db.basket.findUniqueOrThrow({ where: { id: o.basketId! } });
      expect([basket.status, money(basket.total), basket.agentId, basket.factoryId]).toEqual([
        "OPEN",
        "1100.00",
        agent.id,
        o.factoryId,
      ]);
      expect(basket.firstOrderAt).not.toBeNull();
    }
    const v = await variant(a.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([49, 0, 1]);
    expect(money(await tokenBalance(buyer.id))).toBe("2680.00");
    const kinds = await db.tokenEntry.findMany({
      where: { userId: buyer.id, orderId: { not: null } },
      orderBy: { eventKey: "asc" },
    });
    expect(kinds.map((k) => [k.kind, money(k.amount)]).sort()).toEqual([
      ["HOLD", "-1160.00"],
      ["HOLD", "-1160.00"],
      ["SPEND", "0.00"],
      ["SPEND", "0.00"],
    ]);
  });

  it("locks the basket when its total reaches the lock amount", async () => {
    await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "2200" } });
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const first = await makeBuyer(),
      second = await makeBuyer();
    for (const buyer of [first, second]) {
      await fundTokens(buyer.id, "2000");
      await setCartItem(buyer.id, f.variant.id, 1);
      await startCheckout(buyer.id, { agentId: agent.id, tokens: "2000", requestKey: "k" });
    }
    const baskets = await db.basket.findMany();
    expect(baskets).toHaveLength(1);
    expect([baskets[0].status, baskets[0].lockReason, money(baskets[0].total)]).toEqual([
      "LOCKED",
      "AMOUNT",
      "2200.00",
    ]);
    expect(baskets[0].lockedAt).not.toBeNull();
    const third = await makeBuyer();
    await fundTokens(third.id, "2000");
    await setCartItem(third.id, f.variant.id, 1);
    await startCheckout(third.id, { agentId: agent.id, tokens: "2000", requestKey: "k" });
    expect(await db.basket.count({ where: { status: "OPEN" } })).toBe(1);
  });

  it("partial tokens hold that amount and the rest goes to the gateway", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await fundTokens(buyer.id, "160");
    await setCartItem(buyer.id, f.variant.id, 1);
    const r = await startCheckout(buyer.id, { agentId: agent.id, tokens: "160", requestKey: "k" });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    // 1000 / 0.967 - 1000 = 34.13
    expect([money(order.tokensApplied), money(order.gatewayFee), money(order.amountDue)]).toEqual([
      "160.00",
      "34.13",
      "1034.13",
    ]);
    expect(money(await tokenBalance(buyer.id))).toBe("0.00");
    const hold = await db.tokenEntry.findUniqueOrThrow({ where: { eventKey: `hold:${order.id}` } });
    expect(money(hold.amount)).toBe("-160.00");
  });

  it("short stock throws and nothing is reserved", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const a = await makeFactory(),
      b = await makeFactory();
    await setCartItem(buyer.id, a.variant.id, 2);
    await setCartItem(buyer.id, b.variant.id, 5);
    await db.variant.update({ where: { id: b.variant.id }, data: { available: 3 } });
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k" }),
    ).rejects.toThrow(/Only 3 left of Shirt/);
    const va = await variant(a.variant.id);
    expect([va.available, va.reserved]).toEqual([50, 0]);
    expect(await db.order.count()).toBe(0);
    expect(await db.cartItem.count({ where: { buyerId: buyer.id } })).toBe(2);
  });

  it("refuses a suspended agent", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent({ status: "SUSPENDED" });
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 1);
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k" }),
    ).rejects.toThrow(CheckoutError);
    expect(await db.order.count()).toBe(0);
  });

  it("factory staff cannot check out with tokens", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const staff = await makeBuyer();
    await db.user.update({ where: { id: staff.id }, data: { factoryId: f.factory.id } });
    await fundTokens(staff.id, "5000");
    await db.cartItem.create({ data: { buyerId: staff.id, variantId: f.variant.id, qty: 1 } });
    await expect(
      startCheckout(staff.id, { agentId: agent.id, tokens: "1160", requestKey: "k" }),
    ).rejects.toThrow(CheckoutError);
    expect(await db.order.count()).toBe(0);
  });

  it("refuses an empty cart and tokens above the balance", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k" }),
    ).rejects.toThrow(CheckoutError);
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 1);
    await fundTokens(buyer.id, "10");
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "11", requestKey: "k" }),
    ).rejects.toThrow(CheckoutError);
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "1.234", requestKey: "k" }),
    ).rejects.toThrow(CheckoutError);
  });

  it("refuses a product that is no longer live", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 1);
    await db.product.updateMany({ data: { status: "ARCHIVED" } });
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k" }),
    ).rejects.toThrow(/No longer available/);
  });

  it("a token-only checkout and a payment for the same basket and size run together", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    for (let round = 0; round < 5; round++) {
      const payer = await makeBuyer(),
        tokenBuyer = await makeBuyer();
      await setCartItem(payer.id, f.variant.id, 1);
      const pending = await startCheckout(payer.id, {
        agentId: agent.id,
        tokens: "0",
        requestKey: `p${round}`,
      });
      await fundTokens(tokenBuyer.id, "1160");
      await setCartItem(tokenBuyer.id, f.variant.id, 1);
      await Promise.all([
        startCheckout(tokenBuyer.id, {
          agentId: agent.id,
          tokens: "1160",
          requestKey: `t${round}`,
        }),
        withOrderTransaction([payer.id], pending.orderIds, (tx) =>
          markOrdersPaid(tx, pending.orderIds, new Date()),
        ),
      ]);
    }
    expect(await db.order.count({ where: { status: "PAID" } })).toBe(10);
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([40, 0, 10]);
    const basket = await db.basket.findFirstOrThrow({ where: { status: "OPEN" } });
    expect(money(basket.total)).toBe("11000.00");
  });

  it("a repeated requestKey makes no second order", async () => {
    const buyer = await makeBuyer();
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await setCartItem(buyer.id, f.variant.id, 1);
    const input = { agentId: agent.id, tokens: "0", requestKey: "same-key" };
    const first = await startCheckout(buyer.id, input);
    await setCartItem(buyer.id, f.variant.id, 1);
    const again = await startCheckout(buyer.id, input);
    expect(again.orderIds).toEqual(first.orderIds);
    expect(again.attemptId).toBe(first.attemptId);
    expect(again.redirectUrl).toBe(first.redirectUrl);
    expect(await db.order.count()).toBe(1);
    expect((await variant(f.variant.id)).reserved).toBe(1);
    await expect(startCheckout(buyer.id, { ...input, requestKey: "bad key!" })).rejects.toThrow(
      CheckoutError,
    );
  });
});
