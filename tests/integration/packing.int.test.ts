import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPacker, homeFor } from "@/server/auth/service";
import { acceptAndPay, createCart, setLine } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { db } from "@/server/db";
import { bookDelivery } from "@/server/delivery";
import { handOver, markGathered, markPacked, packingQueue, sendBack } from "@/server/packing";
import { makeUser, makeVariant, resetDb, slipFile } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

/** A cart paid for and confirmed by an admin. */
async function confirmedCart() {
  const [owner, admin] = [await makeUser(), await makeUser("ADMIN")];
  const v = await makeVariant("25000", 10);
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
  return { cart, owner, admin };
}

const packingOf = (cartId: string) => db.packing.findUniqueOrThrow({ where: { cartId } });

describe("packing staff accounts", () => {
  it("are created by an admin and land on the packing list", async () => {
    const p = await createPacker({
      name: "Kasun Perera",
      email: "kasun@test.lk",
      phone: "0712345678",
      password: "password123",
    });
    expect(p.role).toBe("PACKER");
    expect(homeFor(p.role)).toBe("/packing");
    await expect(
      createPacker({
        name: "Other",
        email: "kasun@test.lk",
        phone: "0712345679",
        password: "password123",
      }),
    ).rejects.toThrow("email already exists");
  });
});

describe("packing a confirmed order", () => {
  it("checked and gathered by one, rechecked and packed by another, then handed to PickMe", async () => {
    const [amal, nimal] = [await makeUser("PACKER"), await makeUser("PACKER")];
    const { cart, owner } = await confirmedCart();
    // Every packer hears about the new paid order.
    expect(
      await db.notification.count({ where: { userId: amal.id, href: `/packing/${cart.code}` } }),
    ).toBe(1);
    expect((await packingQueue()).toGather.map((c) => c.id)).toEqual([cart.id]);

    await expect(markPacked(nimal.id, cart.id)).rejects.toThrow("Check and gather it first");
    await markGathered(amal.id, cart.id);
    await expect(markGathered(nimal.id, cart.id)).rejects.toThrow("Already gathered");
    expect((await packingQueue()).toPack.map((c) => c.id)).toEqual([cart.id]);

    // The two steps are always two different people.
    await expect(markPacked(amal.id, cart.id)).rejects.toThrow("someone else packs it");
    await expect(handOver(amal.id, cart.id)).rejects.toThrow("Not packed yet");
    await markPacked(nimal.id, cart.id);
    await expect(markPacked(nimal.id, cart.id)).rejects.toThrow("Already packed");
    expect((await packingQueue()).ready.map((c) => c.id)).toEqual([cart.id]);

    // Not until the admin has booked PickMe; then either of them can hand it over.
    await expect(handOver(amal.id, cart.id)).rejects.toThrow("isn't booked yet");
    await bookDelivery(cart.id, { externalRef: "PM-1" });
    expect(
      await db.notification.count({ where: { userId: amal.id, title: "PickMe booked" } }),
    ).toBe(1);
    await handOver(amal.id, cart.id);
    await expect(handOver(amal.id, cart.id)).rejects.toThrow("already gone");
    await expect(sendBack(cart.id)).rejects.toThrow("already gone");

    expect(await packingOf(cart.id)).toMatchObject({
      gatheredById: amal.id,
      packedById: nimal.id,
      handedOverById: amal.id,
    });
    expect((await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } })).status).toBe(
      "PICKED_UP",
    );
    expect(
      await db.notification.count({
        where: { userId: owner.id, title: "Your order is with the PickMe driver" },
      }),
    ).toBe(1);
    const q = await packingQueue();
    expect([...q.toGather, ...q.toPack, ...q.ready]).toEqual([]);
    expect(q.handedToday.map((c) => c.id)).toEqual([cart.id]);
  });

  it("something wrong before packing: it is sent back and gathered again from the start", async () => {
    const [amal, nimal] = [await makeUser("PACKER"), await makeUser("PACKER")];
    const { cart } = await confirmedCart();
    await markGathered(amal.id, cart.id);
    await sendBack(cart.id);
    expect(await db.packing.count()).toBe(0);
    expect((await packingQueue()).toGather.map((c) => c.id)).toEqual([cart.id]);
    // Once packed it is final.
    await markGathered(amal.id, cart.id);
    await markPacked(nimal.id, cart.id);
    await expect(sendBack(cart.id)).rejects.toThrow("already packed");
  });

  it("only paid orders can be packed", async () => {
    const [owner, amal] = [await makeUser(), await makeUser("PACKER")];
    const v = await makeVariant("1000", 5);
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, v.id, 1);
    await expect(markGathered(amal.id, cart.id)).rejects.toThrow("isn't waiting to be packed");
  });
});
