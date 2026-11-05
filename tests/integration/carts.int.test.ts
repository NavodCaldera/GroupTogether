import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { addHours, amountDue, meetsMinimum } from "@/lib/cart-rules";
import {
  requestMerge,
  acceptMerge,
  markDone,
  undoDone,
  removeMember,
  setLine,
  acceptAndPay,
  cancelCart,
  createCart,
  joinCart,
  leaveCart,
  sweep,
  CartError,
} from "@/server/carts/service";
import { approveSlip, rejectSlip, uploadSlip } from "@/server/carts/slips";
import { bookDelivery, markReceived } from "@/server/delivery";
import { D } from "@/lib/decimal";
import { credit, applyTokens, tokenBalance } from "@/server/tokens";
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
async function readyCart(done = true) {
  const [owner, member, admin] = [await makeUser(), await makeUser(), await makeUser("ADMIN")];
  const v = await makeVariant("25000", 5);
  const cart = await createCart(owner.id, { name: "Test" });
  await setLine(owner.id, cart.id, v.id, 1);
  const r = await setLine(member.id, cart.id, v.id, 1);
  if (done) await markDone(member.id, cart.id);
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

    await db.groupCart.update({ where: { id: cart.id }, data: { factoryPackedAt: new Date() } });
    await bookDelivery(cart.id, { quotedFee: "850" });
    const d = await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } });
    expect(d).toMatchObject({ paidBy: "OWNER", provider: "manual" });
    expect((await cartRow(cart.id)).status).toBe("DISPATCHED");
  });

  it("only the owner marks the drop delivered, and only while it is on its way", async () => {
    const { owner, member, admin, cart } = await readyCart();
    await acceptAndPay(owner.id, cart.id, drop);
    await expect(markReceived(owner.id, cart.id)).rejects.toThrow(/isn't on its way/);
    await uploadSlip(owner.id, cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
    await approveSlip(admin.id, slip.id);
    await db.groupCart.update({ where: { id: cart.id }, data: { factoryPackedAt: new Date() } });
    await bookDelivery(cart.id, {});

    await expect(markReceived(member.id, cart.id)).rejects.toThrow(/Only the cart owner/);
    await markReceived(owner.id, cart.id);
    expect((await cartRow(cart.id)).status).toBe("DELIVERED");
    const d = await db.delivery.findUniqueOrThrow({ where: { cartId: cart.id } });
    expect(d.status).toBe("DELIVERED");
    expect(
      await db.notification.count({
        where: { userId: member.id, title: { contains: "delivered" } },
      }),
    ).toBe(1);
    await markReceived(owner.id, cart.id); // a second press does nothing
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

describe("member location", () => {
  it("saves the joiner's address and pin on the membership and the profile", async () => {
    const [owner, joiner] = [await makeUser(), await makeUser()];
    const cart = await createCart(owner.id, {});
    const location = { address: "8 Temple Lane", city: "Kandy", lat: 7.2936, lng: 80.6413 };
    await joinCart(joiner.id, cart.id, location);
    const m = await db.cartMember.findUniqueOrThrow({
      where: { cartId_userId: { cartId: cart.id, userId: joiner.id } },
    });
    expect(m).toMatchObject(location);
    expect(await db.user.findUniqueOrThrow({ where: { id: joiner.id } })).toMatchObject(location);
  });

  it("copies the profile pin when the owner starts a cart", async () => {
    const owner = await makeUser();
    const cart = await createCart(owner.id, {});
    const m = await db.cartMember.findFirstOrThrow({ where: { cartId: cart.id } });
    expect(m).toMatchObject({ lat: 6.9271, lng: 79.8612, city: "Colombo" });
  });
});

describe("one cart at a time", () => {
  it("stops a buyer starting or joining a second active cart", async () => {
    const [a, b] = [await makeUser(), await makeUser()];
    const v = await makeVariant("1000", 10);
    const first = await createCart(a.id, { name: "First" });
    await expect(createCart(a.id, {})).rejects.toThrow(/already have an active cart/);
    const other = await createCart(b.id, {});
    await expect(joinCart(a.id, other.id)).rejects.toThrow(/already have an active cart/);
    await expect(setLine(a.id, other.id, v.id, 1, { add: true })).rejects.toThrow(
      /already have an active cart/,
    );
    // Still free to keep adding to their own cart.
    await setLine(a.id, first.id, v.id, 1, { add: true });
    expect(await variantRow(v.id)).toMatchObject({ available: 9, reserved: 1 });
  });

  it("lets them start another once the first is closed", async () => {
    const a = await makeUser();
    const first = await createCart(a.id, {});
    await cancelCart({ id: a.id, role: "CUSTOMER" }, first.id);
    await expect(createCart(a.id, {})).resolves.toBeTruthy();
  });

  it("can't be beaten by two requests at once", async () => {
    const a = await makeUser();
    const results = await Promise.allSettled([createCart(a.id, {}), createCart(a.id, {})]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

// Exact Part 2 values: Kasun owns the 1500 line in Nimal's cart.
async function tokenCart(qty = 1) {
  const owner = await makeUser(),
    member = await makeUser(),
    admin = await makeUser("ADMIN");
  const cart = await createCart(owner.id, {}),
    v = await makeVariant("1500", 10);
  await setLine(member.id, cart.id, v.id, qty);
  const line = await db.cartLine.findFirstOrThrow({
    where: { cartId: cart.id, userId: member.id },
  });
  await db.$transaction((tx) =>
    credit(
      tx,
      member.id,
      new D("3000"),
      "CANCELLATION",
      { cartLineId: `fund:${member.id}` },
      "Test credit",
    ),
  );
  return { owner, member, admin, cart, v, line };
}
describe("tokens in the cart lifecycle", () => {
  it.each(["remove", "leave", "expire", "cancel"])(
    "releases holds on %s exactly once",
    async (operation) => {
      const f = await tokenCart();
      await applyTokens(f.member.id, f.line.id, "1500");
      expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1500.00");
      expect(amountDue("1500", ["1500"]).toFixed(2)).toBe("0.00");
      if (operation === "remove") await setLine(f.member.id, f.cart.id, f.v.id, 0);
      if (operation === "leave") await leaveCart(f.member.id, f.cart.id);
      if (operation === "expire") await sweep(addHours(new Date(), 25), f.cart.id);
      if (operation === "cancel") await cancelCart(f.owner, f.cart.id);
      expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("3000.00");
      expect(await db.tokenEntry.count({ where: { cartLineId: f.line.id, kind: "RELEASE" } })).toBe(
        1,
      );
    },
  );
  it("releases only excess tokens before reducing quantity", async () => {
    const f = await tokenCart(3);
    await applyTokens(f.member.id, f.line.id, "3000");
    await setLine(f.member.id, f.cart.id, f.v.id, 1);
    const line = await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } });
    expect(line.tokensApplied.toFixed(2)).toBe("1500.00");
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1500.00");
    expect((await cartRow(f.cart.id)).total.toFixed(2)).toBe("1500.00");
  });
  it("uses gross minimum, records the transfer amount, and spends without a second debit", async () => {
    const f = await tokenCart();
    const filler = await makeVariant("48500", 2);
    await setLine(f.owner.id, f.cart.id, filler.id, 1);
    await applyTokens(f.member.id, f.line.id, "1500");
    const cart = await cartRow(f.cart.id);
    expect(cart.status).toBe("READY");
    expect(meetsMinimum(cart.total.toString(), cart.minOrderValue.toString())).toBe(true);
    await markDone(f.member.id, f.cart.id);
    await acceptAndPay(f.owner.id, f.cart.id, drop);
    await uploadSlip(f.owner.id, f.cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: f.cart.id } });
    expect(slip.amount.toFixed(2)).toBe("48500.00");
    await approveSlip(f.admin.id, slip.id);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1500.00");
    expect(await db.tokenEntry.count({ where: { cartLineId: f.line.id, kind: "SPEND" } })).toBe(1);
  });
  it("keeps rejected-slip holds and releases them after the new deadline", async () => {
    const f = await tokenCart();
    const filler = await makeVariant("48500", 2);
    await setLine(f.owner.id, f.cart.id, filler.id, 1);
    await applyTokens(f.member.id, f.line.id, "1500");
    await markDone(f.member.id, f.cart.id);
    await acceptAndPay(f.owner.id, f.cart.id, drop);
    await uploadSlip(f.owner.id, f.cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: f.cart.id } }),
      now = new Date();
    await rejectSlip(f.admin.id, slip.id, "Wrong reference", now);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1500.00");
    await sweep(addHours(now, 3), f.cart.id);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("3000.00");
  });
  it("moves line ids and holds intact through a merge and spends on target payment", async () => {
    const f = await tokenCart();
    const targetOwner = await makeUser(),
      target = await createCart(targetOwner.id, {});
    const filler = await makeVariant("48500", 2);
    await setLine(targetOwner.id, target.id, filler.id, 1);
    await applyTokens(f.member.id, f.line.id, "1500");
    const request = await requestMerge(f.member.id, target.id);
    await acceptMerge(targetOwner.id, request.id);
    const moved = await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } });
    expect(moved.cartId).toBe(target.id);
    expect(moved.tokensApplied.toFixed(2)).toBe("1500.00");
    await markDone(f.member.id, target.id);
    await acceptAndPay(targetOwner.id, target.id, drop);
    await uploadSlip(targetOwner.id, target.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: target.id } });
    await approveSlip(f.admin.id, slip.id);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1500.00");
    expect(await db.tokenEntry.count({ where: { cartLineId: f.line.id, kind: "SPEND" } })).toBe(1);
  });
  it("serializes applying tokens against removal without losing balance", async () => {
    const f = await tokenCart();
    await Promise.allSettled([
      applyTokens(f.member.id, f.line.id, "1500"),
      setLine(f.member.id, f.cart.id, f.v.id, 0),
    ]);
    expect(await db.cartLine.count({ where: { id: f.line.id } })).toBe(0);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("3000.00");
  });
});

async function fullyCoveredCart(amount = "1500") {
  await db.settings.update({ where: { id: 1 }, data: { minOrderValue: "1500" } });
  const f = await tokenCart();
  await applyTokens(f.member.id, f.line.id, amount);
  await markDone(f.member.id, f.cart.id);
  return f;
}
describe("zero-due owner confirmation", () => {
  it("confirms a fully covered cart without a slip and notifies members once", async () => {
    const f = await fullyCoveredCart(),
      now = new Date();
    const before = await tokenBalance(f.member.id);
    await markDone(f.member.id, f.cart.id);
    await acceptAndPay(f.owner.id, f.cart.id, drop, now);
    const cart = await cartRow(f.cart.id);
    expect(cart).toMatchObject({
      status: "CONFIRMED",
      slipDueAt: null,
      acceptedAt: now,
      confirmedAt: now,
      ...drop,
    });
    expect(await db.paymentSlip.count({ where: { cartId: f.cart.id } })).toBe(0);
    expect(await db.tokenEntry.count({ where: { cartLineId: f.line.id, kind: "SPEND" } })).toBe(1);
    expect((await tokenBalance(f.member.id)).eq(before)).toBe(true);
    expect(await variantRow(f.v.id)).toMatchObject({ reserved: 0, sold: 1, available: 9 });
    const notices = await db.notification.findMany({
      where: { userId: { in: [f.owner.id, f.member.id] }, title: "Group order confirmed" },
    });
    expect(notices.map((n) => n.userId).sort()).toEqual([f.owner.id, f.member.id].sort());
    expect(await db.notification.count({ where: { title: "Your group order is locked in" } })).toBe(
      0,
    );
  });
  it("keeps the bank-slip flow when exactly 0.01 remains", async () => {
    const f = await fullyCoveredCart("1499.99");
    await markDone(f.member.id, f.cart.id);
    await acceptAndPay(f.owner.id, f.cart.id, drop);
    const cart = await cartRow(f.cart.id);
    expect(cart.status).toBe("AWAITING_SLIP");
    expect(cart.slipDueAt).not.toBeNull();
    expect(cart.confirmedAt).toBeNull();
    expect(await db.tokenEntry.count({ where: { kind: "SPEND" } })).toBe(0);
    expect(await variantRow(f.v.id)).toMatchObject({ reserved: 1, sold: 0 });
  });
  it("concurrent accepts confirm and move stock only once", async () => {
    const f = await fullyCoveredCart();
    const results = await Promise.allSettled([
      acceptAndPay(f.owner.id, f.cart.id, drop),
      acceptAndPay(f.owner.id, f.cart.id, drop),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await cartRow(f.cart.id)).status).toBe("CONFIRMED");
    expect(await db.tokenEntry.count({ where: { cartLineId: f.line.id, kind: "SPEND" } })).toBe(1);
    expect(await variantRow(f.v.id)).toMatchObject({ reserved: 0, sold: 1 });
    expect(await db.notification.count({ where: { title: "Group order confirmed" } })).toBe(2);
  });
});

const memberRow = (cartId: string, userId: string) =>
  db.cartMember.findUnique({ where: { cartId_userId: { cartId, userId } } });
describe("member done before finish", () => {
  it("blocks finish until members with items are done; ignores members without items", async () => {
    const f = await readyCart(false);
    await expect(acceptAndPay(f.owner.id, f.cart.id, drop)).rejects.toThrow(
      "Waiting for every member to mark their items done",
    );
    const empty = await makeUser();
    await joinCart(empty.id, f.cart.id);
    await markDone(f.member.id, f.cart.id);
    await acceptAndPay(f.owner.id, f.cart.id, drop);
    expect((await cartRow(f.cart.id)).status).toBe("AWAITING_SLIP");
  });
  it.each(["qty", "remove", "tokens"])("resets done after %s changes", async (change) => {
    const f = await readyCart(false);
    await markDone(f.member.id, f.cart.id);
    if (change === "qty") await setLine(f.member.id, f.cart.id, f.v.id, 2);
    if (change === "remove") {
      await setLine(f.owner.id, f.cart.id, f.v.id, 2);
      await setLine(f.member.id, f.cart.id, f.v.id, 0);
      expect((await memberRow(f.cart.id, f.member.id))?.doneAt).toBeNull();
      await setLine(f.member.id, f.cart.id, f.v.id, 1);
    }
    if (change === "tokens") {
      await db.$transaction((tx) =>
        credit(
          tx,
          f.member.id,
          new D("3000"),
          "CANCELLATION",
          { cartLineId: "done-test-credit" },
          "Test credit",
        ),
      );
      const line = await db.cartLine.findFirstOrThrow({
        where: { cartId: f.cart.id, userId: f.member.id },
      });
      await applyTokens(f.member.id, line.id, "1500");
    }
    expect((await memberRow(f.cart.id, f.member.id))?.doneAt).toBeNull();
    await expect(acceptAndPay(f.owner.id, f.cart.id, drop)).rejects.toThrow(
      "Waiting for every member to mark their items done",
    );
  });
  it("allows undo only for a current member before finish", async () => {
    const f = await readyCart(false),
      outsider = await makeUser();
    await expect(markDone(outsider.id, f.cart.id)).rejects.toThrow();
    await expect(markDone(f.owner.id, f.cart.id)).rejects.toThrow();
    await markDone(f.member.id, f.cart.id);
    await undoDone(f.member.id, f.cart.id);
    expect((await memberRow(f.cart.id, f.member.id))?.doneAt).toBeNull();
    await markDone(f.member.id, f.cart.id);
    await acceptAndPay(f.owner.id, f.cart.id, drop);
    await expect(undoDone(f.member.id, f.cart.id)).rejects.toThrow();
    await expect(markDone(f.member.id, f.cart.id)).rejects.toThrow();
  });
  it("removes unfinished members, releases stock/tokens and permits rejoining", async () => {
    const f = await readyCart(false);
    const line = await db.cartLine.findFirstOrThrow({
      where: { cartId: f.cart.id, userId: f.member.id },
    });
    await db.$transaction((tx) =>
      credit(
        tx,
        f.member.id,
        new D("3000"),
        "CANCELLATION",
        { cartLineId: "remove-credit" },
        "Test credit",
      ),
    );
    await applyTokens(f.member.id, line.id, "1500");
    await removeMember(f.owner.id, f.cart.id, f.member.id);
    expect(await memberRow(f.cart.id, f.member.id)).toBeNull();
    expect(await db.cartLine.count({ where: { id: line.id } })).toBe(0);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("3000.00");
    expect(await variantRow(f.v.id)).toMatchObject({ available: 4, reserved: 1 });
    expect((await cartRow(f.cart.id)).status).toBe("OPEN");
    expect(
      await db.notification.count({
        where: { userId: f.member.id, title: `Removed from ${f.cart.name || f.cart.code}` },
      }),
    ).toBe(1);
    await joinCart(f.member.id, f.cart.id);
    expect((await memberRow(f.cart.id, f.member.id))?.doneAt).toBeNull();
  });
  it("denies removal of done members, owners and by other accounts or after expiry", async () => {
    const f = await readyCart(false);
    await markDone(f.member.id, f.cart.id);
    await expect(removeMember(f.owner.id, f.cart.id, f.member.id)).rejects.toThrow(
      "This member has marked their items done",
    );
    await expect(removeMember(f.owner.id, f.cart.id, f.owner.id)).rejects.toThrow();
    await expect(removeMember(f.member.id, f.cart.id, f.owner.id)).rejects.toThrow();
    await undoDone(f.member.id, f.cart.id);
    await db.groupCart.update({ where: { id: f.cart.id }, data: { expiresAt: new Date(0) } });
    await expect(markDone(f.member.id, f.cart.id)).rejects.toThrow();
    await expect(undoDone(f.member.id, f.cart.id)).rejects.toThrow();
    await expect(removeMember(f.owner.id, f.cart.id, f.member.id)).rejects.toThrow();
  });
  it("serializes done with acceptance and edits", async () => {
    const f = await readyCart(false);
    await Promise.allSettled([
      markDone(f.member.id, f.cart.id),
      acceptAndPay(f.owner.id, f.cart.id, drop),
    ]);
    const cart = await cartRow(f.cart.id);
    expect((await memberRow(f.cart.id, f.member.id))?.doneAt).not.toBeNull();
    if (cart.status !== "READY")
      expect((await memberRow(f.cart.id, f.member.id))?.doneAt).not.toBeNull();
  });
  it("serializes line edits with done and checks the final share before finishing", async () => {
    const f = await readyCart(false);
    const results = await Promise.allSettled([
      setLine(f.member.id, f.cart.id, f.v.id, 2),
      markDone(f.member.id, f.cart.id),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(
      (await db.cartLine.findFirstOrThrow({ where: { cartId: f.cart.id, userId: f.member.id } }))
        .qty,
    ).toBe(2);
    const m = await memberRow(f.cart.id, f.member.id);
    if (m?.doneAt) await acceptAndPay(f.owner.id, f.cart.id, drop);
    else
      await expect(acceptAndPay(f.owner.id, f.cart.id, drop)).rejects.toThrow(/Waiting for every/);
  });
  it("serializes remove with done to exactly one outcome", async () => {
    const f = await readyCart(false);
    const results = await Promise.allSettled([
      removeMember(f.owner.id, f.cart.id, f.member.id),
      markDone(f.member.id, f.cart.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const m = await memberRow(f.cart.id, f.member.id);
    if (m) expect(m.doneAt).not.toBeNull();
    else
      expect(await db.cartLine.count({ where: { cartId: f.cart.id, userId: f.member.id } })).toBe(
        0,
      );
  });
  it("resets members arriving by merge", async () => {
    const f = await readyCart(false),
      targetOwner = await makeUser(),
      target = await createCart(targetOwner.id, {});
    await setLine(targetOwner.id, target.id, f.v.id, 1);
    await markDone(f.member.id, f.cart.id);
    const req = await requestMerge(f.member.id, target.id);
    await acceptMerge(targetOwner.id, req.id);
    expect((await memberRow(target.id, f.member.id))?.doneAt).toBeNull();
  });
  it("notifies once per all-done transition, including a new transition after undo", async () => {
    const f = await readyCart(false);
    await Promise.all([markDone(f.member.id, f.cart.id), markDone(f.member.id, f.cart.id)]);
    expect(
      await db.notification.count({ where: { userId: f.owner.id, title: "Everyone is done" } }),
    ).toBe(1);
    await undoDone(f.member.id, f.cart.id);
    await markDone(f.member.id, f.cart.id);
    expect(
      await db.notification.count({ where: { userId: f.owner.id, title: "Everyone is done" } }),
    ).toBe(2);
  });
});
