import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPacker, homeFor } from "@/server/auth/service";
import { acceptAndPay, createCart, setLine } from "@/server/carts/service";
import { approveSlip, uploadSlip } from "@/server/carts/slips";
import { db } from "@/server/db";
import { bookDelivery } from "@/server/delivery";
import { checkPacking, handOver, markPacked, packingQueue, repack } from "@/server/packing";
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

const packingOf = (cartId: string) =>
  db.packing.findUniqueOrThrow({ where: { cartId }, include: { checks: true } });

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
  it("packed by one, checked by two other people, then handed to PickMe", async () => {
    const [amal, nimal, kamal, sunil] = [
      await makeUser("PACKER"),
      await makeUser("PACKER"),
      await makeUser("PACKER"),
      await makeUser("PACKER"),
    ];
    const { cart, owner } = await confirmedCart();
    // Every packer hears about the new paid order.
    expect(
      await db.notification.count({ where: { userId: amal.id, href: `/packing/${cart.code}` } }),
    ).toBe(1);
    expect((await packingQueue()).toPack.map((c) => c.id)).toEqual([cart.id]);

    await expect(checkPacking(nimal.id, cart.id)).rejects.toThrow("Pack this order first");
    await markPacked(amal.id, cart.id);
    await expect(markPacked(nimal.id, cart.id)).rejects.toThrow("already packed");
    expect((await packingQueue()).toCheck.map((c) => c.id)).toEqual([cart.id]);

    // The packer never checks their own packing, and nobody checks twice.
    await expect(checkPacking(amal.id, cart.id)).rejects.toThrow("You packed this order");
    await checkPacking(nimal.id, cart.id);
    await expect(checkPacking(nimal.id, cart.id)).rejects.toThrow("Someone else must check");
    await expect(checkPacking(amal.id, cart.id)).rejects.toThrow("You packed this order");
    await expect(handOver(amal.id, cart.id)).rejects.toThrow("1 more check");
    await checkPacking(kamal.id, cart.id);
    await expect(checkPacking(sunil.id, cart.id)).rejects.toThrow("checked twice");
    expect((await packingQueue()).ready.map((c) => c.id)).toEqual([cart.id]);

    // Not until the admin has booked PickMe.
    await expect(handOver(kamal.id, cart.id)).rejects.toThrow("isn't booked yet");
    await bookDelivery(cart.id, { externalRef: "PM-1" });
    expect(
      await db.notification.count({ where: { userId: kamal.id, title: "PickMe booked" } }),
    ).toBe(1);
    await handOver(kamal.id, cart.id);
    await expect(handOver(kamal.id, cart.id)).rejects.toThrow("already gone");
    await expect(repack(cart.id)).rejects.toThrow("already gone");

    const p = await packingOf(cart.id);
    expect(p).toMatchObject({ packedById: amal.id, handedOverById: kamal.id });
    expect(p.checks.map((c) => c.userId).sort()).toEqual([nimal.id, kamal.id].sort());
    expect((await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } })).status).toBe(
      "PICKED_UP",
    );
    expect(
      await db.notification.count({
        where: { userId: owner.id, title: "Your order is with the PickMe driver" },
      }),
    ).toBe(1);
    const q = await packingQueue();
    expect([...q.toPack, ...q.toCheck, ...q.ready]).toEqual([]);
    expect(q.handedToday.map((c) => c.id)).toEqual([cart.id]);
  });

  it("a checker can send it back: the packing and its checks are cleared", async () => {
    const [amal, nimal] = [await makeUser("PACKER"), await makeUser("PACKER")];
    const { cart } = await confirmedCart();
    await markPacked(amal.id, cart.id);
    await checkPacking(nimal.id, cart.id);
    await repack(cart.id);
    expect(await db.packing.count()).toBe(0);
    expect(await db.packingCheck.count()).toBe(0);
    expect((await packingQueue()).toPack.map((c) => c.id)).toEqual([cart.id]);
  });

  it("only paid orders can be packed", async () => {
    const [owner, amal] = [await makeUser(), await makeUser("PACKER")];
    const v = await makeVariant("1000", 5);
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, v.id, 1);
    await expect(markPacked(amal.id, cart.id)).rejects.toThrow("isn't waiting to be packed");
  });
});
