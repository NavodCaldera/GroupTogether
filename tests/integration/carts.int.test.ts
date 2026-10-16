import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addHours } from "@/lib/cart-rules";
import {
  setLine,
  acceptAndPay,
  cancelCart,
  createCart,
  leaveCart,
  sweep,
  CartError,
} from "@/server/carts/service";
import { approveSlip, rejectSlip, uploadSlip } from "@/server/carts/slips";
import { bookDelivery } from "@/server/delivery";
import { db } from "@/server/db";
import { cartRow, makeUser, makeVariant, resetDb, slipFile, variantRow } from "./helpers";

const drop = {
  deliveryAddress: "12 Flower Rd",
  deliveryCity: "Colombo",
  deliveryPhone: "0771234567",
};

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

/** Owner + member fill a cart to exactly 50,000 with two 25,000 items. */
async function readyCart() {
  const [owner, member, admin] = [await makeUser(), await makeUser(), await makeUser("ADMIN")];
  const v = await makeVariant("25000", 5);
  const cart = await createCart(owner.id, { name: "Test" });
  await setLine(owner.id, cart.id, v.id, 1);
  const r = await setLine(member.id, cart.id, v.id, 1);
  return { owner, member, admin, v, cart, becameReady: r.becameReady };
}

describe("stock locks as soon as items are in a cart", () => {
  it("locks on add, releases on remove and on leaving", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const v = await makeVariant("1000", 10);
    const cart = await createCart(a.id, {});
    await setLine(a.id, cart.id, v.id, 3);
    await setLine(b.id, cart.id, v.id, 2, { add: true });
    await setLine(b.id, cart.id, v.id, 2, { add: true });
    expect(await variantRow(v.id)).toMatchObject({ available: 3, reserved: 7 });
    await setLine(a.id, cart.id, v.id, 0);
    await leaveCart(b.id, cart.id);
    expect(await variantRow(v.id)).toMatchObject({ available: 10, reserved: 0 });
    expect((await cartRow(cart.id)).total.toString()).toBe("0");
  });

  it("refuses more than is free", async () => {
    const a = await makeUser();
    const v = await makeVariant("1000", 2);
    const cart = await createCart(a.id, {});
    await expect(setLine(a.id, cart.id, v.id, 3)).rejects.toThrow("Only 2 more available");
  });

  it("two carts racing for the last units can't oversell", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const v = await makeVariant("1000", 5);
    const [c1, c2] = [await createCart(a.id, {}), await createCart(b.id, {})];
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        setLine(i % 2 ? a.id : b.id, i % 2 ? c1.id : c2.id, v.id, 1, { add: true }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await variantRow(v.id)).toMatchObject({ available: 0, reserved: 5 });
  });
});

describe("minimum order value", () => {
  it("becomes READY at 50,000 and notifies every member once", async () => {
    const { cart, becameReady, member, v } = await readyCart();
    expect(becameReady).toBe(true);
    expect((await cartRow(cart.id)).status).toBe("READY");
    expect(await db.notification.count({ where: { title: { contains: "reached" } } })).toBe(2);
    // More items: still READY, no second notice.
    await db.variant.update({ where: { id: v.id }, data: { available: { increment: 1 } } });
    await setLine(member.id, cart.id, v.id, 2);
    expect(await db.notification.count({ where: { title: { contains: "reached" } } })).toBe(2);
  });

  it("drops back to OPEN when someone removes items", async () => {
    const { cart, member } = await readyCart();
    await leaveCart(member.id, cart.id);
    expect(await cartRow(cart.id)).toMatchObject({ status: "OPEN", readyAt: null });
  });

  it("only the owner can accept, and only once READY", async () => {
    const [owner] = [await makeUser()];
    const v = await makeVariant("1000", 5);
    const cart = await createCart(owner.id, {});
    await setLine(owner.id, cart.id, v.id, 1);
    await expect(acceptAndPay(owner.id, cart.id, drop)).rejects.toThrow(/must reach/);
    const ready = await readyCart();
    await expect(acceptAndPay(ready.member.id, ready.cart.id, drop)).rejects.toThrow(
      /Only the cart owner/,
    );
  });
});

describe("deadlines", () => {
  it("expires a cart at 24h and releases its stock", async () => {
    const a = await makeUser();
    const v = await makeVariant("1000", 5);
    const cart = await createCart(a.id, {});
    await setLine(a.id, cart.id, v.id, 4);
    expect((await sweep(addHours(new Date(), 23))).closed).toBe(0);
    expect((await sweep(addHours(new Date(), 24.01))).closed).toBe(1);
    expect((await cartRow(cart.id)).status).toBe("EXPIRED");
    expect(await variantRow(v.id)).toMatchObject({ available: 5, reserved: 0 });
    // History is kept.
    expect(await db.cartLine.count({ where: { cartId: cart.id } })).toBe(1);
    await expect(setLine(a.id, cart.id, v.id, 1)).rejects.toThrow(CartError);
  });

  it("cancels an accepted cart when the owner misses the 2h slip window", async () => {
    const { owner, cart, v } = await readyCart();
    const now = new Date();
    await acceptAndPay(owner.id, cart.id, drop, now);
    expect((await cartRow(cart.id)).status).toBe("AWAITING_SLIP");
    expect((await sweep(addHours(now, 1.9))).closed).toBe(0);
    expect((await sweep(addHours(now, 2))).closed).toBe(1);
    expect(await cartRow(cart.id)).toMatchObject({ status: "CANCELLED" });
    expect(await variantRow(v.id)).toMatchObject({ available: 5, reserved: 0 });
    await expect(uploadSlip(owner.id, cart.id, slipFile())).rejects.toThrow(/isn't waiting/);
  });
});

describe("one bank slip, then delivery", () => {
  it("slip → admin approves → CONFIRMED (stock sold) → PickMe drop paid by the owner", async () => {
    const { owner, admin, cart, v } = await readyCart();
    await acceptAndPay(owner.id, cart.id, drop);
    await uploadSlip(owner.id, cart.id, slipFile());
    expect((await cartRow(cart.id)).status).toBe("SLIP_REVIEW");
    // A slip in review stops the 2h timer.
    expect((await sweep(addHours(new Date(), 5))).closed).toBe(0);

    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
    expect(slip.amount.toString()).toBe("50000");
    await approveSlip(admin.id, slip.id);
    expect((await cartRow(cart.id)).status).toBe("CONFIRMED");
    expect(await variantRow(v.id)).toMatchObject({ available: 3, reserved: 0, sold: 2 });
    await expect(approveSlip(admin.id, slip.id)).rejects.toThrow(/already been reviewed/);

    await bookDelivery(cart.id, { quotedFee: "850" });
    const d = await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } });
    expect(d).toMatchObject({ paidBy: "OWNER", provider: "manual" });
    expect((await cartRow(cart.id)).status).toBe("DISPATCHED");
  });

  it("a rejected slip gives the owner a fresh window to upload again", async () => {
    const { owner, admin, cart } = await readyCart();
    await acceptAndPay(owner.id, cart.id, drop);
    await uploadSlip(owner.id, cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
    const at = addHours(new Date(), 3);
    await rejectSlip(admin.id, slip.id, "Amount doesn't match", at);
    const c = await cartRow(cart.id);
    expect(c.status).toBe("AWAITING_SLIP");
    expect(c.slipDueAt!.getTime()).toBe(addHours(at, 2).getTime());
  });

  it("the owner can't cancel once the slip is with an admin; an admin can", async () => {
    const { owner, admin, cart, v } = await readyCart();
    await acceptAndPay(owner.id, cart.id, drop);
    await uploadSlip(owner.id, cart.id, slipFile());
    await expect(cancelCart(owner, cart.id)).rejects.toThrow(/no longer be cancelled/);
    await cancelCart(admin, cart.id, "Payment not received");
    expect(await variantRow(v.id)).toMatchObject({ available: 5, reserved: 0 });
  });
});
