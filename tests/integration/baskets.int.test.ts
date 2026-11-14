import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { setCartItem } from "@/server/orders/cart";
import { CheckoutError, startCheckout } from "@/server/orders/checkout";
import { cancelOrder, expireOrders } from "@/server/orders/baskets";
import { handleNotice } from "@/server/payments/notice";
import { signNotice } from "@/server/payments/demo";
import { fundTokens, makeAgent, makeBuyer, makeFactory, resetDb } from "./helpers";

const MERCHANT = "1200000";
const SECRET = "test-secret";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", MERCHANT);
  vi.stubEnv("DEMO_MERCHANT_SECRET", SECRET);
});
afterAll(() => db.$disconnect());

const money = (v: { toFixed(n: number): string }) => v.toFixed(2);
const variant = (id: string) => db.variant.findUniqueOrThrow({ where: { id } });

function noticeBody(attemptId: string, amount: string) {
  const fields = {
    merchant_id: MERCHANT,
    order_id: attemptId,
    payment_id: `pay_${attemptId}`,
    payhere_amount: amount,
    payhere_currency: "LKR",
    status_code: "2",
  };
  return new URLSearchParams({ ...fields, md5sig: signNotice(fields, SECRET) }).toString();
}

/** A new buyer checks out one item and gets back an unpaid order and its signed paid notice. */
async function pending(agentId: string, variantId: string, tokens = "0") {
  const buyer = await makeBuyer();
  if (tokens !== "0") await fundTokens(buyer.id, tokens);
  await setCartItem(buyer.id, variantId, 1);
  const r = await startCheckout(buyer.id, { agentId, tokens, requestKey: "k" });
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId! } });
  return {
    buyer,
    orderId: r.orderIds[0],
    attempt,
    raw: noticeBody(attempt.id, money(attempt.amount)),
  };
}

async function paid(agentId: string, variantId: string, tokens = "0") {
  const p = await pending(agentId, variantId, tokens);
  expect(await handleNotice(p.raw, new Headers())).toEqual({ status: 200 });
  return p;
}

describe("basket fill and lock", () => {
  it("46 orders of 1100 lock the basket at 50,600 and the 47th opens a new one", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const orders: string[] = [];
    for (let i = 0; i < 46; i++) orders.push((await paid(agent.id, f.variant.id)).orderId);
    const first = await db.basket.findFirstOrThrow();
    expect([first.status, first.lockReason, money(first.total)]).toEqual([
      "LOCKED",
      "AMOUNT",
      "50600.00",
    ]);
    expect(first.lockedAt).not.toBeNull();
    expect(await db.order.count({ where: { basketId: first.id } })).toBe(46);
    const last = await paid(agent.id, f.variant.id);
    const order = await db.order.findUniqueOrThrow({ where: { id: last.orderId } });
    expect(order.basketId).not.toBe(first.id);
    const second = await db.basket.findUniqueOrThrow({ where: { id: order.basketId! } });
    expect([second.status, money(second.total)]).toEqual(["OPEN", "1100.00"]);
  }, 120_000);

  it("concurrent crossing: exactly one basket locks and the totals add up", async () => {
    await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "2000" } });
    for (let round = 0; round < 3; round++) {
      const { agent } = await makeAgent();
      const f = await makeFactory();
      await paid(agent.id, f.variant.id);
      const a = await pending(agent.id, f.variant.id);
      const b = await pending(agent.id, f.variant.id);
      const results = await Promise.all([
        handleNotice(a.raw, new Headers()),
        handleNotice(b.raw, new Headers()),
      ]);
      expect(results).toEqual([{ status: 200 }, { status: 200 }]);
      const baskets = await db.basket.findMany({
        where: { agentId: agent.id, factoryId: f.factory.id },
      });
      expect(baskets.map((x) => x.status).sort()).toEqual(["LOCKED", "OPEN"]);
      const locked = baskets.find((x) => x.status === "LOCKED")!;
      const open = baskets.find((x) => x.status === "OPEN")!;
      expect([money(locked.total), money(open.total)]).toEqual(["2200.00", "1100.00"]);
      expect(await db.order.count({ where: { basketId: locked.id } })).toBe(2);
      expect(await db.order.count({ where: { basketId: open.id } })).toBe(1);
      const v = await variant(f.variant.id);
      expect([v.available, v.reserved, v.sold]).toEqual([47, 0, 3]);
    }
  });

  it("a second OPEN basket for the same agent and factory is refused by the database", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await db.basket.create({ data: { agentId: agent.id, factoryId: f.factory.id } });
    await expect(
      db.basket.create({ data: { agentId: agent.id, factoryId: f.factory.id } }),
    ).rejects.toThrow();
    await db.basket.create({
      data: { agentId: agent.id, factoryId: f.factory.id, status: "LOCKED" },
    });
    expect(await db.basket.count()).toBe(2);
  });
});

describe("cancel before lock", () => {
  it("refunds everything as tokens, lowers the total and moves firstOrderAt", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const first = await paid(agent.id, f.variant.id, "160");
    const second = await paid(agent.id, f.variant.id);
    const firstOrder = await db.order.findUniqueOrThrow({ where: { id: first.orderId } });
    const secondOrder = await db.order.findUniqueOrThrow({ where: { id: second.orderId } });
    const before = await db.basket.findUniqueOrThrow({ where: { id: firstOrder.basketId! } });
    expect(before.firstOrderAt!.getTime()).toBe(firstOrder.paidAt!.getTime());
    expect(money(before.total)).toBe("2200.00");

    await cancelOrder(first.buyer.id, first.orderId);

    const basket = await db.basket.findUniqueOrThrow({ where: { id: before.id } });
    expect([basket.status, money(basket.total)]).toEqual(["OPEN", "1100.00"]);
    expect(basket.firstOrderAt!.getTime()).toBe(secondOrder.paidAt!.getTime());
    // 160 tokens + 1028.96 paid (995 + 33.96 fee)
    expect(money(await tokenBalance(first.buyer.id))).toBe("1188.96");
    const entry = await db.tokenEntry.findUniqueOrThrow({
      where: { eventKey: `cancel:${first.orderId}` },
    });
    expect([entry.kind, money(entry.amount)]).toEqual(["ORDER_CANCEL", "1188.96"]);
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).status).toBe(
      "CANCELLED",
    );
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([49, 0, 1]);
    await expect(cancelOrder(first.buyer.id, first.orderId)).rejects.toThrow(CheckoutError);
    expect(money(await tokenBalance(first.buyer.id))).toBe("1188.96");
  });

  it("cancelling the only order clears firstOrderAt", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const only = await paid(agent.id, f.variant.id);
    await cancelOrder(only.buyer.id, only.orderId);
    const basket = await db.basket.findFirstOrThrow();
    expect([basket.status, money(basket.total), basket.firstOrderAt]).toEqual([
      "OPEN",
      "0.00",
      null,
    ]);
    expect(money(await tokenBalance(only.buyer.id))).toBe(money(only.attempt.amount));
  });

  it("refuses after the basket locks, for another buyer and for an unpaid order", async () => {
    await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "1100" } });
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const locked = await paid(agent.id, f.variant.id);
    expect((await db.basket.findFirstOrThrow()).status).toBe("LOCKED");
    await expect(cancelOrder(locked.buyer.id, locked.orderId)).rejects.toThrow(CheckoutError);

    await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "50000" } });
    const open = await paid(agent.id, f.variant.id);
    const stranger = await makeBuyer();
    await expect(cancelOrder(stranger.id, open.orderId)).rejects.toThrow(CheckoutError);
    const unpaid = await pending(agent.id, f.variant.id);
    await expect(cancelOrder(unpaid.buyer.id, unpaid.orderId)).rejects.toThrow(CheckoutError);

    expect(await db.order.count({ where: { status: "PAID" } })).toBe(2);
    expect(
      await db.tokenEntry.count({
        where: { kind: "ORDER_CANCEL", eventKey: { startsWith: "cancel:" } },
      }),
    ).toBe(0);
  });
});

describe("expire", () => {
  it("after 15 minutes the stock is back and the hold is released", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const p = await pending(agent.id, f.variant.id, "160");
    expect(money(await tokenBalance(p.buyer.id))).toBe("0.00");
    expect(await expireOrders(new Date(p.attempt.createdAt.getTime() + 14 * 60_000))).toBe(0);

    const later = new Date(p.attempt.createdAt.getTime() + 15 * 60_000 + 1000);
    expect(await expireOrders(later)).toBe(1);
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([50, 0, 0]);
    expect(money(await tokenBalance(p.buyer.id))).toBe("160.00");
    const release = await db.tokenEntry.findUniqueOrThrow({
      where: { eventKey: `release:${p.orderId}` },
    });
    expect([release.kind, money(release.amount)]).toEqual(["RELEASE", "160.00"]);
    expect((await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status).toBe(
      "CANCELLED",
    );
    expect(
      (await db.paymentAttempt.findUniqueOrThrow({ where: { id: p.attempt.id } })).status,
    ).toBe("EXPIRED");
    expect(await expireOrders(later)).toBe(0);
  });
});
