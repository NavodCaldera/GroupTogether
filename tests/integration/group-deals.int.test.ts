import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { setCartItem } from "@/server/orders/cart";
import { startCheckout } from "@/server/orders/checkout";
import { startOwnCheckout } from "@/server/orders/own-baskets";
import { removeMissingLine, reportMissing } from "@/server/orders/delivery";
import { handleNotice } from "@/server/payments/notice";
import { signNotice } from "@/server/payments/demo";
import { payableLines } from "@/server/payouts";
import { runSweep } from "@/server/sweep";
import { saveDealDraft, startDeal } from "@/server/deals";
import { fundTokens, makeAgent, makeBuyer, makeFactory, makeUser, resetDb } from "./helpers";

const MERCHANT = "1200000";
const SECRET = "test-secret";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", MERCHANT);
  vi.stubEnv("DEMO_MERCHANT_SECRET", SECRET);
  // One paid order locks its agent basket, so missing items can be reported.
  await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "1000" } });
});
afterAll(() => db.$disconnect());

type Factory = Awaited<ReturnType<typeof makeFactory>>;
const money = (v: { toFixed(n: number): string }) => v.toFixed(2);
let key = 0;
const k = () => `deal${++key}`;
/** Colombo wall time for the deal form. */
const colombo = (d: Date) => new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16);

/** A LIVE deal on the factory's product (commission 100): 1+ at 1000 (buyer 1100), 10+ at 900
 * (1000), 20+ at 850 (950). Ends in two days. */
async function liveDeal(f: Factory, maxQty = "") {
  const now = new Date();
  const id = await saveDealDraft(
    f.factory.id,
    f.variant.productId,
    null,
    {
      endsAt: colombo(new Date(now.getTime() + 2 * DAY)),
      maxQty,
      // A capacity must reach the last tier, so a capped deal has tier 1 only.
      tiers: maxQty
        ? [{ minQty: "1", factoryPrice: "1000" }]
        : [
            { minQty: "1", factoryPrice: "1000" },
            { minQty: "10", factoryPrice: "900" },
            { minQty: "20", factoryPrice: "850" },
          ],
    },
    now,
  );
  await startDeal(f.factory.id, id, now);
  return id;
}

const deal = (id: string) => db.groupDeal.findUniqueOrThrow({ where: { id } });
const afterEnd = () => new Date(Date.now() + 3 * DAY);

/** A buyer pays `qty` units at tier 1 (1100) fully in tokens at the agent. */
async function buyWithTokens(agentId: string, f: Factory, qty: number) {
  const buyer = await makeBuyer();
  await fundTokens(buyer.id, (1100 * qty).toFixed(2));
  await setCartItem(buyer.id, f.variant.id, qty);
  const r = await startCheckout(buyer.id, {
    agentId,
    tokens: (1100 * qty).toFixed(2),
    requestKey: k(),
  });
  const order = await db.order.findUniqueOrThrow({
    where: { id: r.orderIds[0] },
    include: { lines: true },
  });
  expect(order.status).toBe("PAID");
  return { buyer, order, line: order.lines[0] };
}

/** A buyer checks out `qty` units without tokens: the order waits for the gateway. */
async function checkoutPending(agentId: string, f: Factory, qty: number) {
  const buyer = await makeBuyer();
  await setCartItem(buyer.id, f.variant.id, qty);
  const r = await startCheckout(buyer.id, { agentId, tokens: "0", requestKey: k() });
  return { buyer, attemptId: r.attemptId!, orderId: r.orderIds[0] };
}

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

async function pay(attemptId: string) {
  const a = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  return handleNotice(noticeBody(a.id, money(a.amount)), new Headers());
}

const rebates = (userId?: string) =>
  db.tokenEntry.findMany({ where: { kind: "DEAL_REBATE", ...(userId ? { userId } : {}) } });

describe("group deal checkout", () => {
  it("sells at tier 1 and counts units only once the payment is verified", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    const p = await checkoutPending(agent.id, f, 3);
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: p.orderId } });
    expect(line.dealId).toBe(id);
    expect(money(line.unitPrice)).toBe("1100.00");
    expect(money(line.paidUnitPrice!)).toBe("1100.00");
    expect(money(line.factoryPrice)).toBe("1000.00");
    expect(line.finalUnitPrice).toBeNull();
    let d = await deal(id);
    expect([d.unitsHeld, d.unitsSold]).toEqual([3, 0]);

    expect(await pay(p.attemptId)).toEqual({ status: 200 });
    // A repeated notice counts nothing twice.
    expect(await pay(p.attemptId)).toEqual({ status: 200 });
    d = await deal(id);
    expect([d.unitsHeld, d.unitsSold]).toEqual([0, 3]);
  });

  it("gives held units back when an unpaid order expires", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    await checkoutPending(agent.id, f, 4);
    expect((await deal(id)).unitsHeld).toBe(4);
    await runSweep(new Date(Date.now() + HOUR));
    const d = await deal(id);
    expect([d.unitsHeld, d.unitsSold, d.status]).toEqual([0, 0, "LIVE"]);
  });

  it("a product with no deal sells as listed", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const { line } = await buyWithTokens(agent.id, f, 1);
    expect(line.dealId).toBeNull();
    expect(line.paidUnitPrice).toBeNull();
    expect(money(line.unitPrice)).toBe("1100.00");
  });

  it("concurrent checkouts and payments at a tier boundary lose no count", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    await buyWithTokens(agent.id, f, 8);
    const pending = await Promise.all([1, 2, 3, 4].map(() => checkoutPending(agent.id, f, 1)));
    expect((await deal(id)).unitsHeld).toBe(4);
    const paid = await Promise.all(pending.map((p) => pay(p.attemptId)));
    expect(paid.every((r) => r.status === 200)).toBe(true);
    const d = await deal(id);
    expect([d.unitsHeld, d.unitsSold]).toEqual([0, 12]);
    const v = await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } });
    expect([v.available, v.reserved, v.sold]).toEqual([38, 0, 12]);
  });

  it("refuses units beyond the factory's capacity, also when buyers race", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f, "5");
    const results = await Promise.allSettled([1, 2, 3].map(() => checkoutPending(agent.id, f, 2)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(refused.reason)).toMatch(/Only 1 left in this deal/);
    expect((await deal(id)).unitsHeld).toBe(4);
    // The refused checkout reserved no stock.
    const v = await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } });
    expect([v.available, v.reserved]).toEqual([46, 4]);
  });

  it("an own basket's order counts toward the same deal", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    await buyWithTokens(agent.id, f, 2);
    const owner = await makeBuyer();
    await fundTokens(owner.id, "3300.00");
    const r = await startOwnCheckout(owner.id, {
      create: { address: "12 Lake Rd", area: "Kandy", phone: "0771234567" },
      lines: [{ variantId: f.variant.id, qty: 3 }],
      tokens: "3300.00",
      requestKey: k(),
    });
    const line = await db.orderLine.findFirstOrThrow({ where: { orderId: r.orderId } });
    expect(line.dealId).toBe(id);
    expect(money(line.paidUnitPrice!)).toBe("1100.00");
    expect((await deal(id)).unitsSold).toBe(5);
  });
});

describe("group deal settlement", () => {
  it("settles once at the highest tier and credits each buyer (paid − final) × qty", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    const a = await buyWithTokens(agent.id, f, 8);
    const b = await buyWithTokens(agent.id, f, 3);

    const first = await runSweep(afterEnd());
    expect(first.dealsSettled).toBe(1);
    const second = await runSweep(new Date(afterEnd().getTime() + HOUR));
    expect(second.dealsSettled ?? 0).toBe(0);

    const d = await db.groupDeal.findUniqueOrThrow({ where: { id }, include: { finalTier: true } });
    expect(d.status).toBe("SETTLED");
    expect(d.unitsSold).toBe(11);
    expect(d.finalTier!.minQty).toBe(10);
    expect(money(d.finalTier!.buyerPrice)).toBe("1000.00");
    const line = await db.orderLine.findUniqueOrThrow({ where: { id: a.line.id } });
    expect(money(line.finalUnitPrice!)).toBe("1000.00");
    expect(money(line.finalFactoryPrice!)).toBe("900.00");

    expect((await rebates()).length).toBe(2);
    const [ra] = await rebates(a.buyer.id);
    expect(money(ra.amount)).toBe("800.00");
    expect(ra.eventKey).toBe(`deal-rebate:${id}:${a.line.id}`);
    expect(money(await tokenBalance(a.buyer.id))).toBe("800.00");
    expect(money(await tokenBalance(b.buyer.id))).toBe("300.00");

    const note = await db.notification.findFirstOrThrow({
      where: { userId: b.buyer.id, title: { startsWith: "Deal closed" } },
    });
    expect(note.title).toBe("Deal closed: tokens back");
    expect(note.body).toContain("300.00 tokens");
  });

  it("always runs: a deal below tier 2 settles at tier 1 with no rebate", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    await buyWithTokens(agent.id, f, 2);
    await runSweep(afterEnd());
    const d = await deal(id);
    expect(d.status).toBe("SETTLED");
    expect(await rebates()).toHaveLength(0);
  });

  it("waits for an unpaid order before settling", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const id = await liveDeal(f);
    await buyWithTokens(agent.id, f, 9);
    const p = await checkoutPending(agent.id, f, 1);
    // The deal has ended, but the payment window is still open at this moment.
    await db.groupDeal.update({ where: { id }, data: { endsAt: new Date(Date.now() - 1000) } });
    const r = await runSweep(new Date());
    expect(r.dealsClosed).toBe(1);
    expect((await deal(id)).status).toBe("CLOSED");
    await pay(p.attemptId);
    await runSweep(new Date());
    const d = await db.groupDeal.findUniqueOrThrow({ where: { id }, include: { finalTier: true } });
    expect(d.status).toBe("SETTLED");
    expect(d.unitsSold).toBe(10);
    expect(d.finalTier!.minQty).toBe(10);
  });

  it("missing units before settlement come off the count and refund the price paid", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "FACTORY");
    const id = await liveDeal(f);
    const a = await buyWithTokens(agent.id, f, 12);
    const b = await buyWithTokens(agent.id, f, 1);
    await reportMissing(f.factory.id, a.line.id, 3, "Short");
    await removeMissingLine(admin.id, a.line.id);
    expect((await deal(id)).unitsSold).toBe(10);
    expect(money(await tokenBalance(a.buyer.id))).toBe("3300.00");

    await runSweep(afterEnd());
    // 10 sold reaches tier 2: 100 back on each unit kept (9 and 1).
    expect(money(await tokenBalance(a.buyer.id))).toBe("4200.00");
    expect(money(await tokenBalance(b.buyer.id))).toBe("100.00");
  });

  it("missing units after settlement keep the tier and refund the final price", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "FACTORY");
    const id = await liveDeal(f);
    const a = await buyWithTokens(agent.id, f, 12);
    await runSweep(afterEnd());
    expect(money(await tokenBalance(a.buyer.id))).toBe("1200.00");
    await reportMissing(f.factory.id, a.line.id, 2, "Short");
    await removeMissingLine(admin.id, a.line.id);
    const d = await deal(id);
    expect(d.unitsSold).toBe(12);
    // 2 × 1000: the 100 rebate on each was already given.
    expect(money(await tokenBalance(a.buyer.id))).toBe("3200.00");
    const deduction = await db.payoutDeduction.findFirstOrThrow({
      where: { kind: "MISSING_ITEM" },
    });
    expect(money(deduction.amount)).toBe("200.00");
  });
});

describe("group deal payouts", () => {
  it("holds a line until its deal settles, then pays the final factory price", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    await liveDeal(f);
    const a = await buyWithTokens(agent.id, f, 12);
    const received = new Date(Date.now() - 10 * DAY);
    await db.order.update({
      where: { id: a.order.id },
      data: { status: "RECEIVED", receivedAt: received },
    });
    await db.orderLine.update({ where: { id: a.line.id }, data: { collectedAt: received } });

    const before = await db.orderLine.count({
      where: { id: a.line.id, ...payableLines(new Date(Date.now() + DAY), 48) },
    });
    expect(before).toBe(0);

    await runSweep(afterEnd());
    const item = await db.payoutItem.findUniqueOrThrow({ where: { orderLineId: a.line.id } });
    expect(money(item.amount)).toBe("10800.00");
  });
});
