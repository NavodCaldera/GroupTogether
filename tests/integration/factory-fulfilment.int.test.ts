import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { acceptAndPay, createCart, setLine } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { db } from "@/server/db";
import { bookDelivery, setDeliveryStatus } from "@/server/delivery";
import { IN_SHOP, adjustStock, saveProduct } from "@/server/catalogue";
import { factoryDashboard } from "@/server/factory-dashboard";
import { factoryOrders, markFactoryPacked } from "@/server/factory-orders";
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
    expect((await factoryOrders(factory.id)).map((o) => o.code)).toEqual([cart.code]);
    expect(await factoryOrders(other.factory.id)).toEqual([]);
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
    expect((await factoryOrders(factory.id))[0].delivery?.status).toBe("DELIVERED");
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

    const dash = await factoryDashboard(factory.id);
    expect(dash.pieces).toBe(2);
    expect(dash.value.toString()).toBe("50000");
    expect(dash.orders.delivered).toBe(1);
    expect(dash.rating).toMatchObject({ average: 4.5, count: 2 });
    expect(dash.products[0]).toMatchObject({ pieces: 2, stockLeft: 8 });
  });
});
