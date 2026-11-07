import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { setCartItem } from "@/server/orders/cart";
import { startCheckout } from "@/server/orders/checkout";
import { expireOrders } from "@/server/orders/baskets";
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

function noticeBody(
  attemptId: string,
  o: { amount: string; status?: string; currency?: string; paymentId?: string },
  secret = SECRET,
) {
  const fields = {
    merchant_id: MERCHANT,
    order_id: attemptId,
    payment_id: o.paymentId ?? "pay_1",
    payhere_amount: o.amount,
    payhere_currency: o.currency ?? "LKR",
    status_code: o.status ?? "2",
  };
  return new URLSearchParams({ ...fields, md5sig: signNotice(fields, secret) }).toString();
}

const send = (raw: string) => handleNotice(raw, new Headers());

async function pendingCheckout(tokens = "0") {
  const buyer = await makeBuyer();
  const { agent } = await makeAgent();
  const f = await makeFactory();
  if (tokens !== "0") await fundTokens(buyer.id, tokens);
  await setCartItem(buyer.id, f.variant.id, 1);
  const r = await startCheckout(buyer.id, { agentId: agent.id, tokens, requestKey: "k" });
  const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId! } });
  return { buyer, agent, f, r, attempt, amount: money(attempt.amount) };
}

describe("payment notices", () => {
  it("paid notice: the order is PAID, stock is sold and the basket total is 1100", async () => {
    const { f, r, attempt, amount } = await pendingCheckout();
    expect(await send(noticeBody(attempt.id, { amount }))).toEqual({ status: 200 });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    expect(order.status).toBe("PAID");
    expect(order.paidAt).not.toBeNull();
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([49, 0, 1]);
    const basket = await db.basket.findUniqueOrThrow({ where: { id: order.basketId! } });
    expect([basket.status, money(basket.total)]).toEqual(["OPEN", "1100.00"]);
    const after = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect([after.status, after.gatewayRef]).toEqual(["SUCCEEDED", "pay_1"]);
    expect(await db.paymentEvent.count({ where: { attemptId: attempt.id } })).toBe(1);
  });

  it("duplicate event: no change", async () => {
    const { f, r, attempt, amount } = await pendingCheckout();
    const raw = noticeBody(attempt.id, { amount });
    await send(raw);
    expect(await send(raw)).toEqual({ status: 200 });
    expect(await db.paymentEvent.count()).toBe(1);
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([49, 0, 1]);
    const basket = await db.basket.findFirstOrThrow();
    expect(money(basket.total)).toBe("1100.00");
    expect(await db.tokenEntry.count({ where: { orderId: r.orderIds[0] } })).toBe(1);
    expect(await db.tokenEntry.count({ where: { kind: "LATE_PAYMENT" } })).toBe(0);
  });

  it("forged signature: 400 with no event recorded", async () => {
    const { r, attempt, amount } = await pendingCheckout();
    expect(await send(noticeBody(attempt.id, { amount }, "wrong-secret"))).toEqual({ status: 400 });
    expect(await db.paymentEvent.count()).toBe(0);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    expect(order.status).toBe("PENDING");
  });

  it("amount mismatch: the order stays PENDING", async () => {
    const { f, r, attempt } = await pendingCheckout();
    expect(await send(noticeBody(attempt.id, { amount: "1.00" }))).toEqual({ status: 200 });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    expect(order.status).toBe("PENDING");
    const event = await db.paymentEvent.findFirstOrThrow();
    expect(event.outcome).toBe("AMOUNT_MISMATCH");
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "PENDING",
    );
    expect((await variant(f.variant.id)).reserved).toBe(1);
    expect(await db.basket.count()).toBe(0);
  });

  it("currency mismatch: the order stays PENDING", async () => {
    const { r, attempt, amount } = await pendingCheckout();
    expect(await send(noticeBody(attempt.id, { amount, currency: "USD" }))).toEqual({
      status: 200,
    });
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    expect(order.status).toBe("PENDING");
  });

  it("failed notice: stock and tokens are released", async () => {
    const { buyer, f, r, attempt, amount } = await pendingCheckout("160");
    expect(money(await tokenBalance(buyer.id))).toBe("0.00");
    expect(await send(noticeBody(attempt.id, { amount, status: "-2" }))).toEqual({ status: 200 });
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([50, 0, 0]);
    expect(money(await tokenBalance(buyer.id))).toBe("160.00");
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    expect(order.status).toBe("CANCELLED");
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "FAILED",
    );
  });

  it("cancelled notice: the order is cancelled and stock released", async () => {
    const { f, r, attempt, amount } = await pendingCheckout();
    await send(noticeBody(attempt.id, { amount, status: "-1" }));
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } })).status).toBe(
      "CANCELLED",
    );
    expect((await variant(f.variant.id)).available).toBe(50);
  });

  it("pending notice: recorded only", async () => {
    const { r, attempt, amount } = await pendingCheckout();
    await send(noticeBody(attempt.id, { amount, status: "0" }));
    expect(await db.paymentEvent.count()).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } })).status).toBe(
      "PENDING",
    );
  });

  it("late notice after expire, posted 3 times: one LATE_PAYMENT for the attempt amount", async () => {
    const { buyer, f, r, attempt, amount } = await pendingCheckout();
    expect(await expireOrders(new Date(attempt.expiresAt.getTime() + 1000))).toBe(1);
    const raw = noticeBody(attempt.id, { amount });
    const results = await Promise.all([send(raw), send(raw), send(raw)]);
    expect(results).toEqual([{ status: 200 }, { status: 200 }, { status: 200 }]);
    const late = await db.tokenEntry.findMany({ where: { kind: "LATE_PAYMENT" } });
    expect(late).toHaveLength(1);
    expect([late[0].userId, money(late[0].amount), late[0].eventKey]).toEqual([
      buyer.id,
      amount,
      `late:${attempt.id}`,
    ]);
    const orders = await db.order.findMany({ where: { id: { in: r.orderIds } } });
    expect(orders.map((o) => o.status)).toEqual(["CANCELLED"]);
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "LATE_PAID",
    );
    const v = await variant(f.variant.id);
    expect([v.available, v.reserved, v.sold]).toEqual([50, 0, 0]);
    expect(await db.basket.count()).toBe(0);
    expect(money(await tokenBalance(buyer.id))).toBe(amount);
  });

  it("a second payment for a paid attempt is credited once", async () => {
    const { buyer, attempt, amount } = await pendingCheckout();
    await send(noticeBody(attempt.id, { amount, paymentId: "pay_1" }));
    await send(noticeBody(attempt.id, { amount, paymentId: "pay_2" }));
    await send(noticeBody(attempt.id, { amount, paymentId: "pay_3" }));
    expect(await db.order.count({ where: { status: "PAID" } })).toBe(1);
    expect(money(await tokenBalance(buyer.id))).toBe(amount);
    expect(await db.tokenEntry.count({ where: { kind: "LATE_PAYMENT" } })).toBe(1);
  });

  it("deposit notices are not built yet and record nothing", async () => {
    const { user, agent } = await makeAgent({ status: "APPROVED" });
    const attempt = await db.paymentAttempt.create({
      data: {
        purpose: "DEPOSIT",
        agentId: agent.id,
        amount: "206825.23",
        gatewayRef: "ga_deposit",
        expiresAt: new Date(Date.now() + 900_000),
      },
    });
    await expect(send(noticeBody(attempt.id, { amount: "206825.23" }))).rejects.toThrow(
      /not built/,
    );
    expect(await db.paymentEvent.count()).toBe(0);
    expect(money(await tokenBalance(user.id))).toBe("0.00");
  });
});
