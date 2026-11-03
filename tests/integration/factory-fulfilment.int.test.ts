import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { acceptAndPay, createCart, setLine } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { db } from "@/server/db";
import { bookDelivery, setDeliveryStatus } from "@/server/delivery";
import { IN_SHOP, adjustStock, saveProduct } from "@/server/catalogue";
import {
  factoryHome,
  factoryInsights,
  factoryOrderBoard,
  factoryProducts,
} from "@/server/factory-dashboard";
import { markFactoryPacked } from "@/server/factory-orders";
import { rateFactory, ratingSummaries } from "@/server/ratings";
import { cartRow, makeUser, makeVariant, resetDb, slipFile } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

/** A factory seller with one product of `available` pieces. */
async function factoryVariant(available = 10) {
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER", company: "Lanka Knits", address: "5 Mill Rd", city: "Kandy" },
  });
  const v = await makeVariant("25000", available);
  await db.product.update({ where: { id: v.productId }, data: { sellerId: factory.id } });
  return { factory, v };
}

describe("factory-direct fulfilment", () => {
  it("keeps one cart to one factory", async () => {
    const owner = await makeUser();
    const a = await factoryVariant();
    const b = await factoryVariant();
    const own = await makeVariant("25000", 5);
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, a.v.id, 1);
    await expect(setLine(owner.id, cart.id, b.v.id, 1)).rejects.toThrow("another factory");
    await expect(setLine(owner.id, cart.id, own.id, 1)).rejects.toThrow("another factory");
    await setLine(owner.id, cart.id, a.v.id, 3);
    expect((await db.variant.findUniqueOrThrow({ where: { id: b.v.id } })).reserved).toBe(0);
  });

  it("factory packs → admin books PickMe from the factory → picked up → delivered", async () => {
    const [owner, admin, warehouse] = [
      await makeUser(),
      await makeUser("ADMIN"),
      await makeUser("ADMIN", "WAREHOUSE"),
    ];
    const { factory, v } = await factoryVariant();
    const other = await factoryVariant();
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, v.id, 2);
    await acceptAndPay(owner.id, cart.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    await uploadSlip(owner.id, cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
    await approveSlip(admin.id, slip.id);

    // The factory hears about it and sees it; another factory doesn't.
    expect(
      await db.notification.count({ where: { userId: factory.id, title: "New order to pack" } }),
    ).toBe(1);
    expect((await factoryOrderBoard(factory.id)).orders.map((o) => o.code)).toEqual([cart.code]);
    expect((await factoryOrderBoard(other.factory.id)).orders).toEqual([]);
    await expect(markFactoryPacked(other.factory.id, cart.id)).rejects.toThrow("not found");

    await expect(bookDelivery(cart.id, {})).rejects.toThrow("hasn't marked this order packed");
    await markFactoryPacked(factory.id, cart.id);
    await markFactoryPacked(factory.id, cart.id); // a second tap changes nothing
    expect(
      await db.notification.count({
        where: { userId: warehouse.id, title: "Ready for PickMe pickup" },
      }),
    ).toBe(1);

    await bookDelivery(cart.id, { driverName: "Ruwan" });
    expect((await cartRow(cart.id)).status).toBe("DISPATCHED");
    expect(
      await db.notification.count({ where: { userId: factory.id, title: "PickMe booked" } }),
    ).toBe(1);

    const d = await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } });
    await setDeliveryStatus(d.id, "PICKED_UP");
    await setDeliveryStatus(d.id, "DELIVERED");
    expect((await cartRow(cart.id)).status).toBe("DELIVERED");
    expect((await factoryOrderBoard(factory.id)).orders[0].delivery?.status).toBe("DELIVERED");
  });

  it("factories publish their own listings straight to the shop; admins can hide them", async () => {
    const { factory } = await factoryVariant();
    const other = await factoryVariant();
    const listing = {
      title: "Linen shirt",
      brand: "Lanka Knits",
      audience: "MEN",
      kind: "men-shirts",
      price: "3200",
    };
    const p = await saveProduct(null, listing, null, { sellerId: factory.id });
    expect(p).toMatchObject({ sellerId: factory.id, status: "LIVE", lotId: null });
    await expect(saveProduct(p.id, listing, null, { sellerId: other.factory.id })).rejects.toThrow(
      "not found",
    );
    await expect(adjustStock(p.id, "M", "", 5, { sellerId: other.factory.id })).rejects.toThrow(
      "not found",
    );
    await adjustStock(p.id, "M", "", 5, { sellerId: factory.id });
    const inShop = () => db.product.count({ where: { id: p.id, ...IN_SHOP } });
    expect(await inShop()).toBe(1);
    await db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    expect(await inShop()).toBe(0);
  });

  it("members rate the factory once after delivery; the dashboard counts sales", async () => {
    const [owner, friend, admin] = [await makeUser(), await makeUser(), await makeUser("ADMIN")];
    const { factory, v } = await factoryVariant();
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, v.id, 2);
    await expect(rateFactory(owner.id, cart.id, 5)).rejects.toThrow(
      "once your group order is delivered",
    );
    await db.cartMember.create({ data: { cartId: cart.id, userId: friend.id } });
    await acceptAndPay(owner.id, cart.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    await uploadSlip(owner.id, cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
    await approveSlip(admin.id, slip.id);
    await markFactoryPacked(factory.id, cart.id);
    await bookDelivery(cart.id, {});
    const d = await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } });
    await setDeliveryStatus(d.id, "DELIVERED");

    await rateFactory(owner.id, cart.id, 5);
    await rateFactory(friend.id, cart.id, 4);
    await expect(rateFactory(owner.id, cart.id, 1)).rejects.toThrow("already rated");
    await expect(rateFactory(admin.id, cart.id, 1)).rejects.toThrow("delivered");
    await expect(rateFactory(friend.id, cart.id, 6)).rejects.toThrow("1 to 5");
    expect((await ratingSummaries([factory.id])).get(factory.id)).toEqual({
      average: 4.5,
      count: 2,
    });

    // An unpaid cart holding 3 more pieces is "wanted", never a sale.
    const other = await makeUser();
    const open = await createCart(other.id, {});
    await setLine(other.id, open.id, v.id, 3);

    const home = await factoryHome(factory.id);
    expect(home.month).toMatchObject({ pieces: 2, delivered: 1 });
    expect(home.month.value.toString()).toBe("50000");
    expect(home.months.reduce((n, m) => n + m.pieces, 0)).toBe(2);
    expect(home.toPack).toBe(0);
    const [product] = await factoryProducts(factory.id);
    expect(product).toMatchObject({ pieces: 2, bestSize: "UK 9" });
    expect(product.value.toString()).toBe("50000");
    expect(product.variants[0]).toMatchObject({ available: 5, reserved: 3, soldPaid: 2 });
    expect((await factoryOrderBoard(factory.id)).counts).toMatchObject({ delivered: 1, toPack: 0 });
    const insights = await factoryInsights(factory.id);
    // Two ratings: the count shows, the average is held back until there are five.
    expect(insights.rating).toMatchObject({ count: 2, average: null });
    expect(insights.packTime.sample).toBe(1);
    expect(insights.demand).toEqual([{ product: product.title, carts: 1, averagePct: 100 }]);
    // One city with one order: suppressed.
    expect(insights.cities).toEqual([]);
  });

  it("a rapid double tap on Mark packed changes the order once", async () => {
    const [owner, admin] = [await makeUser(), await makeUser("ADMIN")];
    const warehouse = await makeUser("ADMIN", "WAREHOUSE");
    const { factory, v } = await factoryVariant();
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, v.id, 2);
    await acceptAndPay(owner.id, cart.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    await uploadSlip(owner.id, cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
    await approveSlip(admin.id, slip.id);
    await Promise.all([
      markFactoryPacked(factory.id, cart.id),
      markFactoryPacked(factory.id, cart.id),
    ]);
    const first = (await cartRow(cart.id)).factoryPackedAt;
    await markFactoryPacked(factory.id, cart.id);
    expect((await cartRow(cart.id)).factoryPackedAt).toEqual(first);
    expect(
      await db.notification.count({
        where: { userId: warehouse.id, title: "Ready for PickMe pickup" },
      }),
    ).toBe(1);
  });
});
