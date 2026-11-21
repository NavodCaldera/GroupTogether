import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { CheckoutError } from "@/server/orders/checkout";
import { cancelOrder, expireOrders } from "@/server/orders/baskets";
import {
  closeOwnBasket,
  confirmOwnDelivery,
  basketPeople,
  ownBasketView,
  publicOwnBaskets,
  setOwnVisibility,
  startOwnCheckout,
  sweepOwnBaskets,
} from "@/server/orders/own-baskets";
import { bookCourier, givenToDriver, markPacked } from "@/server/orders/delivery";
import { fileReturn } from "@/server/returns";
import { handleNotice } from "@/server/payments/notice";
import { signNotice } from "@/server/payments/demo";
import { D } from "@/lib/decimal";
import { fundTokens, makeBuyer, makeFactory, makeUser, resetDb } from "./helpers";

const MERCHANT = "1200000";
const SECRET = "test-secret";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", MERCHANT);
  vi.stubEnv("DEMO_MERCHANT_SECRET", SECRET);
});
afterAll(() => db.$disconnect());

const setMin = (ownMinItems: number) =>
  db.settings.update({ where: { id: 1 }, data: { ownMinItems } });
const money = (v: { toFixed(n: number): string }) => v.toFixed(2);
const ADDRESS = { address: "12 Lake Rd", area: "Kandy", phone: "0771234567" };
let key = 0;
const k = () => `k${++key}`;

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

async function payAttempt(attemptId: string) {
  const a = await db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  expect(await handleNotice(noticeBody(a.id, money(a.amount)), new Headers())).toEqual({
    status: 200,
  });
}

type Factory = Awaited<ReturnType<typeof makeFactory>>;

/** A second size (L) on the factory's product. */
async function addSize(f: Factory) {
  return db.variant.create({ data: { productId: f.variant.productId, size: "L", available: 20 } });
}

/** The owner starts a basket paying fully in tokens. */
async function startPaid(f: Factory, visibility: "LINK" | "PUBLIC" = "LINK", qty = 1) {
  const owner = await makeBuyer();
  await fundTokens(owner.id, 1100 * qty);
  const r = await startOwnCheckout(owner.id, {
    create: { productId: f.variant.productId, visibility, ...ADDRESS },
    lines: [{ variantId: f.variant.id, qty }],
    tokens: (1100 * qty).toFixed(2),
    requestKey: k(),
  });
  expect(r.redirectUrl).toBeNull();
  return { owner, basketId: r.basketId, orderId: r.orderId };
}

async function joinPaid(basketId: string, variantId: string, shareCode?: string, qty = 1) {
  const buyer = await makeBuyer();
  await fundTokens(buyer.id, 1100 * qty);
  const r = await startOwnCheckout(buyer.id, {
    basketId,
    shareCode,
    lines: [{ variantId, qty }],
    tokens: (1100 * qty).toFixed(2),
    requestKey: k(),
  });
  return { buyer, orderId: r.orderId };
}

describe("starting and joining", () => {
  it("the owner's payment opens the basket; it has no agent and no agent fee", async () => {
    const f = await makeFactory();
    const owner = await makeBuyer();
    const r = await startOwnCheckout(owner.id, {
      create: { productId: f.variant.productId, visibility: "PUBLIC", ...ADDRESS },
      lines: [{ variantId: f.variant.id, qty: 2 }],
      tokens: "0",
      requestKey: k(),
    });
    expect(r.redirectUrl).not.toBeNull();
    let b = await db.basket.findUniqueOrThrow({ where: { id: r.basketId } });
    expect([b.kind, b.status, b.agentId, b.firstOrderAt]).toEqual(["OWN", "OPEN", null, null]);
    // Not joinable or listed before the owner has paid.
    expect(await publicOwnBaskets(f.variant.productId)).toEqual([]);

    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { lines: true },
    });
    expect([order.agentId, money(order.itemsTotal)]).toEqual([null, "2200.00"]);
    expect(money(order.lines[0].cashFeeEach)).toBe("0.00");

    await payAttempt(order.paymentAttemptId!);
    b = await db.basket.findUniqueOrThrow({ where: { id: r.basketId } });
    expect([b.status, money(b.total)]).toEqual(["OPEN", "2200.00"]);
    expect(b.firstOrderAt).not.toBeNull();
    const listed = await publicOwnBaskets(f.variant.productId);
    expect(listed).toEqual([{ id: b.id, area: "Kandy", owner: owner.name, items: 2 }]);
  });

  it("a link-only basket needs the share code; any size of the same product joins", async () => {
    const f = await makeFactory();
    const large = await addSize(f);
    const { basketId } = await startPaid(f, "LINK");
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(await publicOwnBaskets(f.variant.productId)).toEqual([]);

    const stranger = await makeBuyer();
    await expect(
      startOwnCheckout(stranger.id, {
        basketId,
        lines: [{ variantId: large.id, qty: 1 }],
        tokens: "0",
        requestKey: k(),
      }),
    ).rejects.toThrow("This basket is not open");
    expect(await ownBasketView(basketId, stranger.id, null)).toBeNull();

    await joinPaid(basketId, large.id, b.shareCode!);
    const after = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(money(after.total)).toBe("2200.00");
  });

  it("a different product cannot go into the basket", async () => {
    const f = await makeFactory();
    const other = await makeFactory();
    const { basketId } = await startPaid(f, "PUBLIC");
    const buyer = await makeBuyer();
    await expect(
      startOwnCheckout(buyer.id, {
        basketId,
        lines: [{ variantId: other.variant.id, qty: 1 }],
        tokens: "0",
        requestKey: k(),
      }),
    ).rejects.toThrow("Choose sizes of this product only");
  });

  it("the owner switches visibility; joiners see no address", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "LINK");
    await setOwnVisibility(owner.id, basketId, "PUBLIC");
    expect(await publicOwnBaskets(f.variant.productId)).toHaveLength(1);
    const { buyer } = await joinPaid(basketId, f.variant.id);
    const seen = await ownBasketView(basketId, buyer.id, null);
    expect([seen?.address, seen?.phone, seen?.shareCode]).toEqual([null, null, null]);
    expect(seen?.orders.map((o) => o.mine)).toEqual([true]);
    const mine = await ownBasketView(basketId, owner.id, null);
    expect(mine?.address).toBe("12 Lake Rd");
    expect(mine?.orders).toHaveLength(2);
    // Everyone in the basket sees the others and their sizes; first names unless the owner.
    const seenByBuyer = await basketPeople(basketId, buyer.id);
    expect(seenByBuyer).toHaveLength(1);
    expect(seenByBuyer[0]?.owner).toBe(true);
    expect(seenByBuyer[0]?.name).not.toContain(" ");
    const seenByOwner = await basketPeople(basketId, owner.id);
    expect(seenByOwner.map((p) => p.owner)).toEqual([false]);
    expect(seenByOwner[0]?.items).toBeGreaterThan(0);
    expect(await basketPeople(basketId, (await makeBuyer()).id)).toEqual([]);
  });

  it("an owner whose first payment expires leaves a cancelled basket", async () => {
    const f = await makeFactory();
    const owner = await makeBuyer();
    const r = await startOwnCheckout(owner.id, {
      create: { productId: f.variant.productId, visibility: "PUBLIC", ...ADDRESS },
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "0",
      requestKey: k(),
    });
    expect(await expireOrders(new Date(Date.now() + 60 * 60_000))).toBe(1);
    const b = await db.basket.findUniqueOrThrow({ where: { id: r.basketId } });
    expect(b.status).toBe("CANCELLED");
    const v = await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } });
    expect([v.available, v.reserved, v.sold]).toEqual([50, 0, 0]);
  });
});

describe("cancelling and closing", () => {
  it("joiners cancel while OPEN; the owner cannot", async () => {
    const f = await makeFactory();
    const { owner, basketId, orderId } = await startPaid(f, "PUBLIC");
    const j = await joinPaid(basketId, f.variant.id);
    await expect(cancelOrder(owner.id, orderId)).rejects.toThrow(CheckoutError);
    await cancelOrder(j.buyer.id, j.orderId);
    expect(money(await tokenBalance(j.buyer.id))).toBe("1100.00");
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(money(b.total)).toBe("1100.00");
  });

  it("the owner places the order only once the basket holds the minimum items", async () => {
    await setMin(5);
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC", 2);
    const stranger = await makeBuyer();
    await expect(closeOwnBasket(stranger.id, basketId)).rejects.toThrow("Basket not found");
    await expect(closeOwnBasket(owner.id, basketId)).rejects.toThrow("at least 5 items");
    await joinPaid(basketId, f.variant.id, undefined, 3);
    await closeOwnBasket(owner.id, basketId);
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    // No delivery fee: the owner pays the courier on delivery.
    expect([b.status, b.lockReason, b.deliveryFee]).toEqual(["LOCKED", "OWNER", null]);
    expect(await db.paymentAttempt.count({ where: { basketId } })).toBe(0);
    expect(money(await tokenBalance(owner.id))).toBe("0.00");
    await expect(joinPaid(basketId, f.variant.id)).rejects.toThrow("This basket is not open");
  });

  it("close waits while someone is still paying to join", async () => {
    await setMin(1);
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC");
    const joiner = await makeBuyer();
    await startOwnCheckout(joiner.id, {
      basketId,
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "0",
      requestKey: k(),
    });
    await expect(closeOwnBasket(owner.id, basketId)).rejects.toThrow("Someone is paying");
  });

  it("a payment that arrives after the hold ran out comes back as tokens less the PayHere fee", async () => {
    const f = await makeFactory();
    const { basketId } = await startPaid(f, "PUBLIC");
    const joiner = await makeBuyer();
    const r = await startOwnCheckout(joiner.id, {
      basketId,
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "0",
      requestKey: k(),
    });
    expect(await expireOrders(new Date(Date.now() + 60 * 60_000))).toBe(1);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    await payAttempt(order.paymentAttemptId!);
    const back = new D(order.amountDue.toString()).minus(order.gatewayFee.toString());
    expect(new D(order.gatewayFee.toString()).gt(0)).toBe(true);
    expect(money(await tokenBalance(joiner.id))).toBe(money(back));
    expect(money(back)).toBe("1100.00");
  });

  it("waits until day 10", async () => {
    await setMin(2);
    const f = await makeFactory();
    await startPaid(f, "PUBLIC", 1);
    const r = await sweepOwnBaskets(new Date(Date.now() + 9 * 86_400_000));
    expect(r).toEqual({ ownClosed: 0, ownCancelled: 0 });
  });

  it("past the maximum wait, a full basket is ordered and a short one is cancelled", async () => {
    await setMin(2);
    const f = await makeFactory();
    const full = await startPaid(f, "PUBLIC", 2);
    const short = await startPaid(f, "PUBLIC", 1);
    const j = await joinPaid(short.basketId, f.variant.id);
    const one = await startPaid(f, "PUBLIC", 1);
    await cancelOrder(j.buyer.id, j.orderId);
    const r = await sweepOwnBaskets(new Date(Date.now() + 11 * 86_400_000));
    expect(r).toEqual({ ownClosed: 1, ownCancelled: 2 });
    const status = async (id: string) =>
      (await db.basket.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(full.basketId)).toBe("LOCKED");
    expect(await status(short.basketId)).toBe("CANCELLED");
    expect(await status(one.basketId)).toBe("CANCELLED");
    expect(money(await tokenBalance(one.owner.id))).toBe("1100.00");
    expect(
      await db.notification.count({ where: { userId: one.owner.id, title: "Basket cancelled" } }),
    ).toBe(1);
  });
});

describe("delivery to the owner", () => {
  it("factory ships, the owner confirms; orders are received and cannot be returned", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC");
    const j = await joinPaid(basketId, f.variant.id);
    await setMin(2);
    await closeOwnBasket(owner.id, basketId);

    await expect(confirmOwnDelivery(owner.id, basketId)).rejects.toThrow();
    const admin = await makeUser("ADMIN", "AGENTS");
    await markPacked(f.factory.id, basketId);
    await bookCourier(admin.id, basketId, {
      fee: "900",
      driverName: "Sunil",
      driverPhone: "0771234567",
      vehicleNo: "LB-1234",
    });
    await givenToDriver(f.factory.id, basketId);
    await expect(confirmOwnDelivery(j.buyer.id, basketId)).rejects.toThrow("Basket not found");
    await confirmOwnDelivery(owner.id, basketId);

    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(b.status).toBe("DELIVERED");
    const titles = async (userId: string) =>
      (await db.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } })).map(
        (n) => n.title,
      );
    expect(await titles(owner.id)).toEqual([
      "Someone joined your basket",
      "Order placed",
      "Basket on the way",
    ]);
    expect(await titles(j.buyer.id)).toEqual([
      "Basket ordered",
      "Basket on the way",
      "Collect from the basket owner",
    ]);
    const order = await db.order.findUniqueOrThrow({
      where: { id: j.orderId },
      include: { lines: true },
    });
    expect(order.status).toBe("RECEIVED");
    expect(order.lines[0].collectedAt).not.toBeNull();
    await expect(
      fileReturn(j.buyer.id, order.lines[0].id, {
        fault: "BUYER",
        buyerReason: "SIZE",
        note: "no",
        photos: [],
      }),
    ).rejects.toThrow("Own-basket items cannot be returned");
  });
});
