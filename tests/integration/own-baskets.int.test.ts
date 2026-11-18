import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { CheckoutError } from "@/server/orders/checkout";
import { cancelOrder, expireOrders } from "@/server/orders/baskets";
import {
  closeOwnBasket,
  confirmOwnDelivery,
  deliveryFeeFor,
  myOwnBaskets,
  ownBasketView,
  payDeliveryFee,
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
    expect((await myOwnBaskets(buyer.id)).map((x) => x.owner)).toEqual([false]);
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

  it("close works out the delivery fee; paying it locks the basket for the factory", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC", 2);
    await joinPaid(basketId, f.variant.id, undefined, 3);
    const stranger = await makeBuyer();
    await expect(closeOwnBasket(stranger.id, basketId)).rejects.toThrow("Basket not found");
    await closeOwnBasket(owner.id, basketId);
    let b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    // 400 + 5 items x 50
    expect([b.status, money(b.deliveryFee!)]).toEqual(["AWAITING_FEE", "650.00"]);
    expect(deliveryFeeFor(5, new D(400), new D(50)).toFixed(2)).toBe("650.00");
    await expect(joinPaid(basketId, f.variant.id)).rejects.toThrow("This basket is not open");

    await payDeliveryFee(owner.id, basketId);
    const attempt = await db.paymentAttempt.findFirstOrThrow({
      where: { basketId, purpose: "DELIVERY_FEE" },
    });
    // 650 plus the gateway fee
    expect(new D(attempt.amount.toString()).gt(650)).toBe(true);
    await payAttempt(attempt.id);
    b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect([b.status, b.lockReason]).toEqual(["LOCKED", "OWNER"]);
    expect(b.feePaidAt).not.toBeNull();
  });

  it("close waits while someone is still paying to join", async () => {
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

  it("an unpaid delivery fee past its due date cancels and refunds everyone", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC");
    const j = await joinPaid(basketId, f.variant.id);
    await closeOwnBasket(owner.id, basketId);
    const r = await sweepOwnBaskets(new Date(Date.now() + 3 * 86_400_000));
    expect(r.ownCancelled).toBe(1);
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(b.status).toBe("CANCELLED");
    expect(money(await tokenBalance(owner.id))).toBe("1100.00");
    expect(money(await tokenBalance(j.buyer.id))).toBe("1100.00");
    const v = await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } });
    expect([v.available, v.sold]).toEqual([50, 0]);
  });

  it("the maximum wait closes an own basket on its own", async () => {
    const f = await makeFactory();
    const { basketId } = await startPaid(f, "PUBLIC");
    const r = await sweepOwnBaskets(new Date(Date.now() + 61 * 86_400_000));
    expect(r.ownClosed).toBe(1);
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(b.status).toBe("AWAITING_FEE");
  });
});

describe("delivery to the owner", () => {
  it("factory ships, the owner confirms; orders are received and cannot be returned", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC");
    const j = await joinPaid(basketId, f.variant.id);
    await closeOwnBasket(owner.id, basketId);
    await payDeliveryFee(owner.id, basketId);
    const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { basketId } });
    await payAttempt(attempt.id);

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
