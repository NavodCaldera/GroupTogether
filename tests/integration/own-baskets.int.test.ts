import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { expireOrders } from "@/server/orders/baskets";
import {
  closeOwnBasket,
  confirmOwnDelivery,
  basketPayments,
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
import { myOpenOwnBaskets } from "@/server/orders/own-baskets";
import { oldOpenBaskets } from "@/server/agents/admin-screens";

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
    create: { visibility, ...ADDRESS },
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
      create: { visibility: "PUBLIC", ...ADDRESS },
      lines: [{ variantId: f.variant.id, qty: 2 }],
      tokens: "0",
      requestKey: k(),
    });
    expect(r.redirectUrl).not.toBeNull();
    let b = await db.basket.findUniqueOrThrow({ where: { id: r.basketId } });
    expect([b.kind, b.status, b.agentId, b.firstOrderAt]).toEqual(["OWN", "OPEN", null, null]);
    // Not joinable or listed before the owner has paid.
    expect(await publicOwnBaskets(f.factory.id, null)).toEqual([]);

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
    const listed = await publicOwnBaskets(f.factory.id, null);
    expect(listed).toEqual([
      { id: b.id, area: "Kandy", owner: owner.name.split(" ")[0], items: 2 },
    ]);
    expect(b.productId).toBeNull();
  });

  it("a link-only basket needs the share code; any size of the same product joins", async () => {
    const f = await makeFactory();
    const large = await addSize(f);
    const { basketId } = await startPaid(f, "LINK");
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(await publicOwnBaskets(f.factory.id, null)).toEqual([]);

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

  it("another factory's item cannot go into the basket", async () => {
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
    ).rejects.toThrow("A basket holds items of one factory only");
  });

  it("the owner switches visibility; joiners see no address", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "LINK");
    await setOwnVisibility(owner.id, basketId, "PUBLIC");
    expect(await publicOwnBaskets(f.factory.id, null)).toHaveLength(1);
    const { buyer } = await joinPaid(basketId, f.variant.id);
    const seen = await ownBasketView(basketId, buyer.id, null);
    expect([seen?.address, seen?.phone, seen?.shareCode]).toEqual([null, null, null]);
    expect(seen?.orders.map((o) => o.mine)).toEqual([true]);
    const mine = await ownBasketView(basketId, owner.id, null);
    expect(mine?.address).toBe("12 Lake Rd");
    expect(mine?.orders).toHaveLength(2);
  });

  it("an owner whose first payment expires leaves a cancelled basket", async () => {
    const f = await makeFactory();
    const owner = await makeBuyer();
    const r = await startOwnCheckout(owner.id, {
      create: { visibility: "PUBLIC", ...ADDRESS },
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

/** Another product of the same factory, priced 2000 (factory 1800). */
async function addProduct(f: Factory) {
  const p = await db.product.create({
    data: {
      title: "Chinos",
      brand: "Test",
      category: "APPAREL",
      stockType: "FACTORY_SURPLUS",
      price: "2000",
      factoryPrice: "1800",
      commission: "200",
      status: "LIVE",
      sellerId: f.factory.id,
      variants: { create: { size: "32", available: 20 } },
    },
    include: { variants: true },
  });
  return p.variants[0]!;
}

describe("factory baskets (spec 005)", () => {
  it("holds two products of one factory", async () => {
    const f = await makeFactory();
    const chinos = await addProduct(f);
    const owner = await makeBuyer();
    await fundTokens(owner.id, 3100);
    const r = await startOwnCheckout(owner.id, {
      create: { visibility: "PUBLIC", ...ADDRESS },
      lines: [
        { variantId: f.variant.id, qty: 1 },
        { variantId: chinos.id, qty: 1 },
      ],
      tokens: "3100.00",
      requestKey: k(),
    });
    const b = await db.basket.findUniqueOrThrow({ where: { id: r.basketId } });
    expect([b.factoryId, b.productId, money(b.total)]).toEqual([f.factory.id, null, "3100.00"]);
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { lines: { orderBy: { unitPrice: "asc" } } },
    });
    expect(money(order.itemsTotal)).toBe("3100.00");
    expect(order.lines.map((l) => [money(l.unitPrice), money(l.factoryPrice)])).toEqual([
      ["1100.00", "1000.00"],
      ["2000.00", "1800.00"],
    ]);
    const shirt = await db.product.findUniqueOrThrow({ where: { id: f.variant.productId } });
    const view = await ownBasketView(r.basketId, owner.id, null);
    expect(view?.factory.name).toBe(f.factory.company);
    expect(view?.products.map((p) => p.title).sort()).toEqual(["Chinos", shirt.title].sort());
  });

  it("refuses another factory's items", async () => {
    const f = await makeFactory();
    const other = await makeFactory();
    const owner = await makeBuyer();
    await expect(
      startOwnCheckout(owner.id, {
        create: { visibility: "PUBLIC", ...ADDRESS },
        lines: [
          { variantId: f.variant.id, qty: 1 },
          { variantId: other.variant.id, qty: 1 },
        ],
        tokens: "0",
        requestKey: k(),
      }),
    ).rejects.toThrow("A basket holds items of one factory only");
    expect(await db.basket.count()).toBe(0);
    const { basketId } = await startPaid(f, "PUBLIC");
    const buyer = await makeBuyer();
    await expect(
      startOwnCheckout(buyer.id, {
        basketId,
        lines: [{ variantId: other.variant.id, qty: 1 }],
        tokens: "0",
        requestKey: k(),
      }),
    ).rejects.toThrow("A basket holds items of one factory only");
  });

  it("old basket takes another product", async () => {
    const f = await makeFactory();
    const chinos = await addProduct(f);
    const { owner, basketId } = await startPaid(f, "PUBLIC");
    await db.basket.update({ where: { id: basketId }, data: { productId: f.variant.productId } });
    const buyer = await makeBuyer();
    await fundTokens(buyer.id, 2000);
    await startOwnCheckout(buyer.id, {
      basketId,
      lines: [{ variantId: chinos.id, qty: 1 }],
      tokens: "2000.00",
      requestKey: k(),
    });
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    expect(money(b.total)).toBe("3100.00");
    const view = await ownBasketView(basketId, owner.id, null);
    expect(view?.items).toBe(2);
    expect(view?.products).toHaveLength(2);
  });

  it("public list excludes link-only and own", async () => {
    const f = await makeFactory();
    const pub = await startPaid(f, "PUBLIC");
    await startPaid(f, "LINK");
    const other = await makeFactory();
    await startPaid(other, "PUBLIC");
    const viewer = await makeBuyer();
    expect((await publicOwnBaskets(f.factory.id, viewer.id)).map((b) => b.id)).toEqual([
      pub.basketId,
    ]);
    expect(await publicOwnBaskets(f.factory.id, pub.owner.id)).toEqual([]);
  });

  it("my open baskets per factory", async () => {
    const f = await makeFactory();
    const other = await makeFactory();
    const first = await startPaid(f, "LINK", 2);
    const owner = first.owner;
    await fundTokens(owner.id, 2200);
    const second = await startOwnCheckout(owner.id, {
      create: { visibility: "PUBLIC", ...ADDRESS },
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "1100.00",
      requestKey: k(),
    });
    await startOwnCheckout(owner.id, {
      create: { visibility: "PUBLIC", ...ADDRESS },
      lines: [{ variantId: other.variant.id, qty: 1 }],
      tokens: "1100.00",
      requestKey: k(),
    });
    // Not paid yet: not listed.
    await startOwnCheckout(owner.id, {
      create: { visibility: "PUBLIC", ...ADDRESS },
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "0",
      requestKey: k(),
    });
    const mine = await myOpenOwnBaskets(owner.id, f.factory.id);
    expect(mine.map((b) => [b.id, b.items])).toEqual([
      [first.basketId, 2],
      [second.basketId, 1],
    ]);
    expect(mine[0]?.area).toBe("Kandy");
  });
});

describe("review fixes (spec 005)", () => {
  it("a member of a link-only basket can add more from the cart; strangers cannot", async () => {
    const f = await makeFactory();
    const { basketId } = await startPaid(f, "LINK");
    const b = await db.basket.findUniqueOrThrow({ where: { id: basketId } });
    const { buyer } = await joinPaid(basketId, f.variant.id, b.shareCode!);
    expect((await publicOwnBaskets(f.factory.id, buyer.id)).map((x) => x.id)).toEqual([basketId]);
    await fundTokens(buyer.id, 1100);
    await startOwnCheckout(buyer.id, {
      basketId,
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "1100.00",
      requestKey: k(),
    });
    expect(money((await db.basket.findUniqueOrThrow({ where: { id: basketId } })).total)).toBe(
      "3300.00",
    );
    const stranger = await makeBuyer();
    expect(await publicOwnBaskets(f.factory.id, stranger.id)).toEqual([]);
  });

  it("buys the cart rows read inside the transaction and clears them with it", async () => {
    const f = await makeFactory();
    const owner = await makeBuyer();
    await fundTokens(owner.id, 2200);
    await db.cartItem.create({ data: { buyerId: owner.id, variantId: f.variant.id, qty: 2 } });
    const r = await startOwnCheckout(owner.id, {
      create: { visibility: "PUBLIC", ...ADDRESS },
      fromCart: [f.variant.id, "gone"],
      tokens: "2200.00",
      requestKey: k(),
    });
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
      include: { lines: true },
    });
    expect(order.lines.map((l) => [l.variantId, l.qty])).toEqual([[f.variant.id, 2]]);
    expect(await db.cartItem.count({ where: { buyerId: owner.id } })).toBe(0);
    // A second tab paying the same items finds the cart empty.
    await expect(
      startOwnCheckout(owner.id, {
        create: { visibility: "PUBLIC", ...ADDRESS },
        fromCart: [f.variant.id],
        tokens: "0",
        requestKey: k(),
      }),
    ).rejects.toThrow("Your cart is empty");
  });
});

describe("basket payments (DEC-026)", () => {
  it("owner sees everyone's money", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC", 2);
    const j = await joinPaid(basketId, f.variant.id);
    const view = await basketPayments(basketId, owner.id);
    expect(view?.buyers.map((b) => [b.you, b.owner])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(view?.buyers[1]?.name).toBe(j.buyer.name);
    expect(money(view!.buyers[0]!.paid!)).toBe("2200.00");
    expect(money(view!.buyers[1]!.paid!)).toBe("1100.00");
    expect(money(view!.buyers[1]!.lines[0]!.amount!)).toBe("1100.00");
    expect(view?.totals?.items).toBe(3);
    expect(money(view!.totals!.itemsAmount)).toBe("3300.00");
    expect(money(view!.totals!.total)).toBe("3300.00");
  });

  it("joiner sees no money for others", async () => {
    const f = await makeFactory();
    const { basketId } = await startPaid(f, "PUBLIC", 2);
    const j = await joinPaid(basketId, f.variant.id);
    const view = await basketPayments(basketId, j.buyer.id);
    expect(view?.buyers[0]?.you).toBe(true);
    expect(money(view!.buyers[0]!.paid!)).toBe("1100.00");
    const owner = view!.buyers[1]!;
    expect(owner.owner).toBe(true);
    expect(owner.name).not.toContain(" ");
    expect([owner.paid, owner.payhereFee, owner.tokens, owner.itemsAmount]).toEqual([
      null,
      null,
      null,
      null,
    ]);
    expect(owner.lines.every((l) => l.amount === null)).toBe(true);
    expect(owner.items).toBe(2);
    expect(view?.totals).toBeNull();
  });

  it("merges a buyer's orders", async () => {
    const f = await makeFactory();
    const { owner, basketId } = await startPaid(f, "PUBLIC");
    const j = await joinPaid(basketId, f.variant.id);
    await fundTokens(j.buyer.id, 1100);
    await startOwnCheckout(j.buyer.id, {
      basketId,
      lines: [{ variantId: f.variant.id, qty: 1 }],
      tokens: "1100.00",
      requestKey: k(),
    });
    const view = await basketPayments(basketId, owner.id);
    expect(view?.buyers).toHaveLength(2);
    expect(view?.buyers[1]?.items).toBe(2);
    expect(money(view!.buyers[1]!.paid!)).toBe("2200.00");
  });

  it("stranger gets null", async () => {
    const f = await makeFactory();
    const { basketId } = await startPaid(f, "PUBLIC");
    expect(await basketPayments(basketId, (await makeBuyer()).id)).toBeNull();
  });
});

describe("admin wait limits (DEC-026)", () => {
  it("own baskets are measured against ownMaxWaitDays", async () => {
    const f = await makeFactory();
    const { basketId } = await startPaid(f, "PUBLIC");
    const { baskets } = await oldOpenBaskets((await makeUser("ADMIN", "AGENTS")).id);
    expect(baskets.find((b) => b.id === basketId)?.limit).toBe(10);
  });
});

describe("cancelling and closing", () => {
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
    const one = await startPaid(f, "PUBLIC", 1);
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
