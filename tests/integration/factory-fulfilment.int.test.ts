import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { acceptAndPay, createCart, setLine } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { db } from "@/server/db";
import { bookDelivery, setDeliveryStatus } from "@/server/delivery";
import { factoryOrders, markFactoryPacked } from "@/server/factory-orders";
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
});
