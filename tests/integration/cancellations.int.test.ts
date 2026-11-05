import { afterAll, beforeEach, describe, it, expect } from "vitest";
import { D } from "@/lib/decimal";
import { db } from "@/server/db";
import { cancelPaidLines, flushCancellationNotices } from "@/server/cancellations";
import { withCartTransaction } from "@/server/carts/locks";
import { createCart, setLine, markDone, acceptAndPay } from "@/server/carts/service";
import { uploadSlip, approveSlip } from "@/server/carts/slips";
import { credit, applyTokens, tokenBalance } from "@/server/tokens";
import { bookDelivery } from "@/server/delivery";
import { cartTotal } from "@/lib/cart-rules";
import { makeUser, makeVariant, resetDb, slipFile } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
export async function paidFixture() {
  await db.settings.update({ where: { id: 1 }, data: { minOrderValue: "3000" } });
  const owner = await makeUser(),
    member = await makeUser(),
    admin = await makeUser("ADMIN");
  const v = await makeVariant("1500", 10),
    cart = await createCart(owner.id, {});
  await setLine(owner.id, cart.id, v.id, 1);
  await setLine(member.id, cart.id, v.id, 1);
  const lines = await db.cartLine.findMany({
      where: { cartId: cart.id },
      orderBy: { userId: "asc" },
    }),
    line = lines.find((l) => l.userId === member.id)!;
  await db.$transaction((tx) =>
    credit(
      tx,
      member.id,
      new D("1000"),
      "CANCELLATION",
      { cartLineId: "seed-credit" },
      "Test credit",
    ),
  );
  await applyTokens(member.id, line.id, "500");
  await markDone(member.id, cart.id);
  await acceptAndPay(owner.id, cart.id, {
    deliveryAddress: "12 Flower Rd",
    deliveryCity: "Colombo",
    deliveryPhone: "0771234567",
  });
  await uploadSlip(owner.id, cart.id, slipFile());
  const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
  await approveSlip(admin.id, slip.id);
  return { owner, member, admin, v, cart, line, other: lines.find((l) => l.userId === owner.id)! };
}
async function cancel(cartId: string, lineIds: string[]) {
  await withCartTransaction([cartId], [], (tx) => cancelPaidLines(tx, lineIds, "Quality problem"));
  await flushCancellationNotices();
}
describe("paid line cancellation", () => {
  it("credits the full price once, preserves paid total, and cancels the cart only on the last line", async () => {
    const f = await paidFixture();
    const before = await tokenBalance(f.member.id);
    await Promise.allSettled([cancel(f.cart.id, [f.line.id]), cancel(f.cart.id, [f.line.id])]);
    expect((await tokenBalance(f.member.id)).eq(before.plus("1500"))).toBe(true);
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(1);
    expect(await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      status: "CANCELLED",
      notEarned: true,
      cancelReason: "Quality problem",
    });
    const cart = await db.groupCart.findUniqueOrThrow({
      where: { id: f.cart.id },
      include: { lines: true },
    });
    expect(cart.status).toBe("CONFIRMED");
    expect(cart.total.toFixed(2)).toBe("3000.00");
    expect(cartTotal(cart.lines).toFixed(2)).toBe("1500.00");
    expect(await db.variant.findUniqueOrThrow({ where: { id: f.v.id } })).toMatchObject({
      sold: 1,
      available: 8,
    });
    expect(
      await db.notification.count({ where: { userId: f.member.id, body: "Quality problem" } }),
    ).toBe(1);
    await cancel(f.cart.id, [f.other.id]);
    expect((await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).status).toBe(
      "CANCELLED",
    );
  });
  it("leaves delivered lines untouched", async () => {
    const f = await paidFixture();
    await db.groupCart.update({ where: { id: f.cart.id }, data: { status: "DELIVERED" } });
    await cancel(f.cart.id, [f.line.id]);
    expect((await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).status).toBe(
      "ACTIVE",
    );
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(0);
  });
  it("keeps dispatched delivery unchanged and notifies warehouse once", async () => {
    const f = await paidFixture();
    await db.groupCart.update({ where: { id: f.cart.id }, data: { factoryPackedAt: new Date() } });
    await bookDelivery(f.cart.id, { quotedFee: "850" });
    const delivery = await db.delivery.findUniqueOrThrow({ where: { cartId: f.cart.id } });
    await cancel(f.cart.id, [f.line.id, f.other.id]);
    await cancel(f.cart.id, [f.line.id, f.other.id]);
    expect(await db.delivery.findUniqueOrThrow({ where: { cartId: f.cart.id } })).toEqual(delivery);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: `Cancelled dispatched cart ${f.cart.code}` },
      }),
    ).toBe(1);
  });
});

it("cancels zero-value paid items without minting tokens", async () => {
  await db.settings.update({ where: { id: 1 }, data: { minOrderValue: "3000" } });
  const owner = await makeUser(),
    member = await makeUser(),
    admin = await makeUser("ADMIN"),
    paid = await makeVariant("3000", 3),
    free = await makeVariant("0", 3),
    cart = await createCart(owner.id, {});
  await setLine(owner.id, cart.id, paid.id, 1);
  await setLine(member.id, cart.id, free.id, 1);
  await markDone(member.id, cart.id);
  await acceptAndPay(owner.id, cart.id, {
    deliveryAddress: "12 Flower Rd",
    deliveryCity: "Colombo",
    deliveryPhone: "0771234567",
  });
  await uploadSlip(owner.id, cart.id, slipFile());
  const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
  await approveSlip(admin.id, slip.id);
  const line = await db.cartLine.findFirstOrThrow({
    where: { cartId: cart.id, userId: member.id },
  });
  await cancel(cart.id, [line.id]);
  expect((await db.cartLine.findUniqueOrThrow({ where: { id: line.id } })).status).toBe(
    "CANCELLED",
  );
  expect((await tokenBalance(member.id)).isZero()).toBe(true);
});
