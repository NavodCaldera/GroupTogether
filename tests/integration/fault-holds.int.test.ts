import { afterAll, afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import * as quality from "@/server/quality";
import * as cartLocks from "@/server/carts/locks";
import { sweep } from "@/server/carts/service";
import { db, type Tx } from "@/server/db";
import { factoryDecide, adminDecide, fileReturn } from "@/server/returns";
import { recordFault, countedFaultUnits } from "@/server/fault-holds";
import { makeUser, makeVariant, resetDb, giftPhotoFile } from "./helpers";
beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());
const now = new Date("2026-11-06T10:00:00Z");
async function fixture() {
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: {
      role: "SELLER",
      factoryProfile: { create: { complianceDueAt: new Date("2099-01-01") } },
    },
  });
  const admin = await makeUser("ADMIN", "FACTORY"),
    buyer = await makeUser();
  const v = await makeVariant("1500", 40);
  await db.product.update({ where: { id: v.productId }, data: { sellerId: factory.id } });
  return { factory, admin, buyer, v };
}
async function request(
  f: Awaited<ReturnType<typeof fixture>>,
  qty = 1,
  fault: "FACTORY" | "BUYER" = "FACTORY",
) {
  const cart = await db.groupCart.create({
    data: {
      code: crypto.randomUUID().slice(0, 8),
      ownerId: f.buyer.id,
      status: "DELIVERED",
      total: "4500",
      minOrderValue: "1500",
      expiresAt: now,
      delivery: { create: { provider: "manual", status: "DELIVERED", deliveredAt: now } },
      lines: { create: { userId: f.buyer.id, variantId: f.v.id, qty, unitPrice: "1500" } },
    },
    include: { lines: true },
  });
  return fileReturn(
    f.buyer.id,
    cart.lines[0].id,
    {
      qty,
      fault,
      reason: "DAMAGED",
      note: "Seam",
      photos: fault === "FACTORY" ? [giftPhotoFile()] : [],
    },
    now,
  );
}
describe("factory faults", () => {
  it("factory accepts qty 3: one fault with 3 units and a hold", async () => {
    const f = await fixture(),
      r = await request(f, 3);
    await factoryDecide(f.factory.id, r.id, true, now);
    expect(await db.factoryFault.findMany()).toMatchObject([
      { units: 3, confirmedBy: "FACTORY", confirmedById: f.factory.id, recordedAt: now },
    ]);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("qty 1 then qty 1 opens a hold on the second", async () => {
    const f = await fixture();
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    expect(await db.faultHold.count()).toBe(0);
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    expect(await db.faultHold.count()).toBe(1);
  });
  it("buyer-fault accepts and rejections record no faults", async () => {
    const f = await fixture();
    await factoryDecide(f.factory.id, (await request(f, 1, "BUYER")).id, true, now);
    const r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    await adminDecide(f.admin.id, r.id, false, "No defect");
    expect(await db.factoryFault.count()).toBe(0);
  });
  it.each([false, true])("admin accepts factory fault, received=%s", async (received) => {
    const f = await fixture(),
      r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    if (received) await db.returnRequest.update({ where: { id: r.id }, data: { receivedAt: now } });
    await adminDecide(f.admin.id, r.id, true, "Confirmed");
    expect(await db.factoryFault.findUnique({ where: { returnId: r.id } })).toMatchObject({
      confirmedBy: "ADMIN",
      units: 1,
      confirmedById: f.admin.id,
    });
  });
  it("calendar window boundary and cancelled faults", async () => {
    const f = await fixture();
    for (const date of ["2026-06-05", "2027-06-05"]) {
      const r = await request(f);
      await db.$transaction((tx) => recordFault(tx, r, "FACTORY", f.factory.id, new Date(date)));
    }
    expect(await countedFaultUnits(db, f.factory.id, new Date("2027-06-06"))).toBe(1);
    await db.factoryFault.updateMany({
      data: { cancelledAt: now, cancelledById: f.admin.id, cancelNote: "Mistake" },
    });
    expect(await countedFaultUnits(db, f.factory.id, new Date("2027-06-06"))).toBe(0);
  });
  it("two faults eleven months apart open a hold; same return records once", async () => {
    const f = await fixture(),
      r = await request(f),
      s = await request(f);
    await db.$transaction((tx) =>
      recordFault(tx, r, "FACTORY", f.factory.id, new Date("2026-01-01")),
    );
    await db.$transaction((tx) =>
      recordFault(tx, s, "FACTORY", f.factory.id, new Date("2026-12-01")),
    );
    await db.$transaction((tx) =>
      recordFault(tx, s, "FACTORY", f.factory.id, new Date("2026-12-01")),
    );
    expect(await db.factoryFault.count()).toBe(2);
    expect(await db.faultHold.count()).toBe(1);
  });
  it("parallel accepts reaching 2 open one hold", async () => {
    const f = await fixture();
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    const a = await request(f),
      b = await request(f);
    const results = await Promise.allSettled([
      factoryDecide(f.factory.id, a.id, true, now),
      factoryDecide(f.factory.id, b.id, true, now),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
    expect(await db.factoryFault.count()).toBe(3);
  });
  it("removed factory opens no hold", async () => {
    const f = await fixture(),
      r = await request(f, 3);
    await db.factoryProfile.update({
      where: { factoryUserId: f.factory.id },
      data: { status: "REMOVED" },
    });
    await db.returnRequest.update({ where: { id: r.id }, data: { status: "WITH_ADMIN" } });
    await adminDecide(f.admin.id, r.id, true, "Confirmed");
    expect(await db.factoryFault.count()).toBe(1);
    expect(await db.faultHold.count()).toBe(0);
  });
  it("hold notices go only to owners and FACTORY/CORE", async () => {
    const f = await fixture(),
      core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM"),
      warehouse = await makeUser("ADMIN");
    const staff = [];
    for (const role of ["OWNER", "SALES", "PACKING"] as const)
      staff.push(
        await db.user.update({
          where: { id: (await makeUser()).id },
          data: { role: "SELLER", factoryId: f.factory.id, factoryRole: role },
        }),
      );
    await factoryDecide(f.factory.id, (await request(f, 2)).id, true, now);
    for (const id of [f.factory.id, staff[0].id])
      expect(
        await db.notification.count({ where: { userId: id, title: "Your shop is on hold" } }),
      ).toBe(1);
    for (const id of [core.id, f.admin.id])
      expect(await db.notification.count({ where: { userId: id, title: "Factory on hold" } })).toBe(
        1,
      );
    for (const id of [premium.id, warehouse.id, staff[1].id, staff[2].id])
      expect(
        await db.notification.count({
          where: { userId: id, title: { in: ["Your shop is on hold", "Factory on hold"] } },
        }),
      ).toBe(0);
  });
});
import { enforceHold } from "@/server/fault-holds";
import { hideProduct, removeFactory } from "@/server/quality";
import { canSellIn } from "@/server/agreements";
import { saveProduct } from "@/server/catalogue";
import { postReturnMessage } from "@/server/returns";
import { D } from "@/lib/decimal";
import { credit, applyTokens, tokenBalance, spendCartTokens } from "@/server/tokens";
import { approveSlip } from "@/server/carts/slips";
import { withCartTransaction } from "@/server/carts/locks";
async function statusCart(
  f: Awaited<ReturnType<typeof fixture>>,
  status:
    "OPEN" | "READY" | "AWAITING_SLIP" | "SLIP_REVIEW" | "CONFIRMED" | "DISPATCHED" | "DELIVERED",
  deliveryStatus: "BOOKED" | "PICKED_UP" | "FAILED" | "DELIVERED" = "BOOKED",
) {
  const member = await makeUser(),
    owner = await makeUser();
  const cart = await db.groupCart.create({
    data: {
      code: crypto.randomUUID().slice(0, 8),
      ownerId: owner.id,
      status: "READY",
      total: "4500",
      minOrderValue: "3000",
      expiresAt: new Date(Date.now() + 86400000),
      slipDueAt: new Date(Date.now() + 86400000),
      members: { create: [{ userId: owner.id }, { userId: member.id }] },
      lines: {
        create: [
          { userId: owner.id, variantId: f.v.id, qty: 1, unitPrice: "1500" },
          { userId: member.id, variantId: f.v.id, qty: 2, unitPrice: "1500" },
        ],
      },
    },
    include: { lines: true, members: true },
  });
  const line = cart.lines.find((l) => l.userId === member.id)!;
  await db.$transaction((tx) =>
    credit(
      tx,
      member.id,
      new D("1000"),
      "CANCELLATION",
      { cartLineId: `seed:${line.id}` },
      "Synthetic credit",
    ),
  );
  await applyTokens(member.id, line.id, "500");
  await db.cartMember.updateMany({ where: { cartId: cart.id }, data: { doneAt: new Date() } });
  const paid = ["CONFIRMED", "DISPATCHED", "DELIVERED"].includes(status);
  await db.variant.update({
    where: { id: f.v.id },
    data: paid
      ? { available: { decrement: 3 }, sold: { increment: 3 } }
      : { available: { decrement: 3 }, reserved: { increment: 3 } },
  });
  await db.groupCart.update({
    where: { id: cart.id },
    data: { status, ...(paid ? { confirmedAt: new Date() } : {}) },
  });
  if (paid) await withCartTransaction([cart.id], [], (tx) => spendCartTokens(tx, cart.id));
  let slipId = "";
  if (status === "SLIP_REVIEW")
    slipId = (
      await db.paymentSlip.create({
        data: {
          cartId: cart.id,
          uploaderId: owner.id,
          storageKey: "synthetic.jpg",
          contentType: "image/jpeg",
          amount: "4000",
        },
      })
    ).id;
  if (status === "DISPATCHED" || status === "DELIVERED")
    await db.delivery.create({
      data: { cartId: cart.id, provider: "manual", status: deliveryStatus },
    });
  return { cart, line, member, owner, slipId };
}
const cartRow = (id: string) => db.groupCart.findUniqueOrThrow({ where: { id } });
const cancellationCredits = async (cartId: string) =>
  db.tokenEntry.findMany({
    where: {
      kind: { in: ["RETURN", "CANCELLATION"] },
      cartLineId: {
        in: (await db.cartLine.findMany({ where: { cartId }, select: { id: true } })).map(
          (l) => l.id,
        ),
      },
    },
  });
describe("hold enforcement and removal", () => {
  it.each([
    "OPEN",
    "READY",
    "AWAITING_SLIP",
    "SLIP_REVIEW",
    "CONFIRMED",
    "DISPATCHED",
    "DELIVERED",
  ] as const)("cleans %s with correct stock and tokens, idempotently", async (status) => {
    const f = await fixture(),
      c = await statusCart(f, status);
    const before = await db.variant.findUniqueOrThrow({ where: { id: f.v.id } });
    const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    await enforceHold(hold.id);
    await enforceHold(hold.id);
    const lines = await db.cartLine.findMany({ where: { cartId: c.cart.id } });
    if (["OPEN", "READY"].includes(status)) {
      expect(lines).toHaveLength(0);
      expect((await tokenBalance(c.member.id)).toFixed(2)).toBe("1000.00");
      expect(
        await db.cartMember.count({ where: { cartId: c.cart.id, doneAt: { not: null } } }),
      ).toBe(0);
      expect(await db.variant.findUniqueOrThrow({ where: { id: f.v.id } })).toMatchObject({
        available: before.available + 3,
        reserved: before.reserved - 3,
      });
    } else if (["AWAITING_SLIP", "SLIP_REVIEW"].includes(status)) {
      expect((await cartRow(c.cart.id)).status).toBe("CANCELLED");
      expect((await tokenBalance(c.member.id)).toFixed(2)).toBe("1000.00");
      expect(await cancellationCredits(c.cart.id)).toHaveLength(0);
      expect((await db.variant.findUniqueOrThrow({ where: { id: f.v.id } })).reserved).toBe(0);
    } else if (status === "CONFIRMED") {
      expect((await cartRow(c.cart.id)).status).toBe("CANCELLED");
      expect((await cancellationCredits(c.cart.id)).map((e) => e.amount.toFixed(2)).sort()).toEqual(
        ["1500.00", "3000.00"],
      );
      expect((await tokenBalance(c.member.id)).toFixed(2)).toBe("3500.00");
      expect((await db.variant.findUniqueOrThrow({ where: { id: f.v.id } })).sold).toBe(0);
    } else {
      expect((await cartRow(c.cart.id)).status).toBe(status);
      expect(lines.every((l) => l.status === "ACTIVE")).toBe(true);
      expect(await cancellationCredits(c.cart.id)).toHaveLength(0);
      expect(await db.variant.findUniqueOrThrow({ where: { id: f.v.id } })).toEqual(before);
    }
    expect(await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).toMatchObject({
      hiddenByHoldId: hold.id,
    });
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: hold.id } })).cleanedAt,
    ).not.toBeNull();
  });
  it.each(["BOOKED", "PICKED_UP", "FAILED"] as const)(
    "removal never touches dispatched %s",
    async (stage) => {
      const f = await fixture(),
        c = await statusCart(f, "DISPATCHED", stage);
      const before = await cartRow(c.cart.id),
        delivery = await db.delivery.findUniqueOrThrow({ where: { cartId: c.cart.id } });
      await removeFactory(f.admin.id, f.factory.id, "Repeated defects", false);
      expect(await cartRow(c.cart.id)).toEqual(before);
      expect(await db.delivery.findUniqueOrThrow({ where: { cartId: c.cart.id } })).toEqual(
        delivery,
      );
      expect(await cancellationCredits(c.cart.id)).toHaveLength(0);
    },
  );
  it.each(["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW", "CONFIRMED", "DELIVERED"] as const)(
    "removal shares cleanup for %s",
    async (status) => {
      const f = await fixture(),
        c = await statusCart(f, status);
      await removeFactory(f.admin.id, f.factory.id, "Repeated defects", false);
      expect((await cartRow(c.cart.id)).status).toBe(
        ["OPEN", "READY"].includes(status)
          ? "OPEN"
          : status === "DELIVERED"
            ? "DELIVERED"
            : "CANCELLED",
      );
      expect(await cancellationCredits(c.cart.id)).toHaveLength(status === "CONFIRMED" ? 2 : 0);
    },
  );
  it("keeps an existing admin hide and blocks sales while allowing returns and threads", async () => {
    const f = await fixture(),
      v = await makeVariant("1500", 2);
    await db.product.update({
      where: { id: v.productId },
      data: {
        sellerId: f.factory.id,
        hiddenAt: now,
        hiddenReason: "Admin hide",
        hiddenById: f.admin.id,
      },
    });
    const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    await enforceHold(hold.id);
    expect(await db.product.findUniqueOrThrow({ where: { id: v.productId } })).toMatchObject({
      hiddenByHoldId: null,
      hiddenReason: "Admin hide",
    });
    expect(await canSellIn(db, f.factory.id, new Date())).toBe(false);
    await expect(
      saveProduct(
        null,
        { title: "Shirt", brand: "Test", audience: "MEN", kind: "men-shirts", price: "1400" },
        null,
        { sellerId: f.factory.id },
      ),
    ).rejects.toThrow();
    const r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    await postReturnMessage(f.factory.id, r.id, "Please review");
  });
  it("slip approval racing hold cleanup gives unpaid release or full paid credits", async () => {
    const f = await fixture(),
      c = await statusCart(f, "SLIP_REVIEW"),
      warehouse = await makeUser("ADMIN");
    const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    const results = await Promise.allSettled([
      enforceHold(hold.id),
      approveSlip(warehouse.id, c.slipId),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect((await cartRow(c.cart.id)).status).toBe("CANCELLED");
    const credits = await cancellationCredits(c.cart.id);
    const spent = await db.tokenEntry.count({
      where: {
        kind: "SPEND",
        cartLineId: {
          in: (
            await db.cartLine.findMany({ where: { cartId: c.cart.id }, select: { id: true } })
          ).map((l) => l.id),
        },
      },
    });
    expect(credits).toHaveLength(spent ? 2 : 0);
    expect((await tokenBalance(c.member.id)).toFixed(2)).toBe(spent ? "3500.00" : "1000.00");
  });
  it.each(["AWAITING_SLIP", "CONFIRMED", "DISPATCHED"] as const)(
    "ordinary hide leaves %s untouched",
    async (status) => {
      const f = await fixture(),
        c = await statusCart(f, status),
        before = await cartRow(c.cart.id);
      await hideProduct(f.admin.id, f.v.productId, "Quality check");
      expect(await cartRow(c.cart.id)).toEqual(before);
      expect(await cancellationCredits(c.cart.id)).toHaveLength(0);
      expect((await db.cartLine.findUniqueOrThrow({ where: { id: c.line.id } })).status).toBe(
        "ACTIVE",
      );
    },
  );
});
import {
  decideHold,
  cancelFault,
  postHoldMessage,
  listHoldMessages,
  factoryFaults,
  adminHolds,
} from "@/server/fault-holds";
async function held() {
  const f = await fixture(),
    r = await request(f, 2);
  await factoryDecide(f.factory.id, r.id, true, now);
  const hold = await db.faultHold.findFirstOrThrow();
  return { ...f, r, hold };
}
describe("hold decisions and private discussion", () => {
  it("continue restores only its hidden products; cancelled carts stay cancelled and next fault reopens", async () => {
    const f = await fixture(),
      c = await statusCart(f, "CONFIRMED"),
      v = await makeVariant("1500", 2);
    await db.product.update({
      where: { id: v.productId },
      data: { sellerId: f.factory.id, hiddenAt: now, hiddenReason: "Admin hide" },
    });
    await factoryDecide(f.factory.id, (await request(f, 2)).id, true, now);
    const hold = await db.faultHold.findFirstOrThrow();
    await decideHold(f.admin.id, hold.id, "CONTINUE", "Reviewed");
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).hiddenAt,
    ).toBeNull();
    expect((await db.product.findUniqueOrThrow({ where: { id: v.productId } })).hiddenReason).toBe(
      "Admin hide",
    );
    expect((await cartRow(c.cart.id)).status).toBe("CANCELLED");
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    expect(await db.faultHold.count()).toBe(2);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("admin hides during a hold stay hidden on continue", async () => {
    const f = await held();
    await hideProduct(f.admin.id, f.v.productId, "Separate quality issue");
    await decideHold(f.admin.id, f.hold.id, "CONTINUE", "Reviewed");
    expect(await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).toMatchObject({
      hiddenByHoldId: null,
      hiddenReason: "Separate quality issue",
    });
  });
  it("remove closes hold and locks staff; direct removal also closes holds", async () => {
    const f = await held();
    const staff = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", factoryId: f.factory.id, factoryRole: "OWNER" },
    });
    await decideHold(f.admin.id, f.hold.id, "REMOVE", "Repeated faults");
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).locked).toBe(true);
    expect((await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).decision).toBe(
      "REMOVE",
    );
  });
  it("direct removal closes an open hold", async () => {
    const f = await held();
    await removeFactory(f.admin.id, f.factory.id, "Repeated faults", false);
    expect(await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).toMatchObject({
      decision: "REMOVE",
    });
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(0);
  });
  it("two decisions give one outcome", async () => {
    const f = await held();
    const results = await Promise.allSettled([
      decideHold(f.admin.id, f.hold.id, "CONTINUE", "Reviewed"),
      decideHold(f.admin.id, f.hold.id, "REMOVE", "Repeated faults"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).decidedAt,
    ).not.toBeNull();
  });
  it("continue during cleanup stops further cancellations and never re-hides products", async () => {
    const f = await fixture(),
      paused = await pauseBetweenCarts(f);
    const enforcing = enforceHold(paused.hold.id);
    await paused.started;
    const deciding = decideHold(f.admin.id, paused.hold.id, "CONTINUE", "Reviewed between carts");
    try {
      await promptly(deciding);
    } finally {
      paused.release();
      await Promise.allSettled([enforcing, deciding]);
    }
    expect((await cartRow(paused.first.cart.id)).status).toBe("CANCELLED");
    expect(await cancellationCredits(paused.first.cart.id)).toHaveLength(2);
    expect((await cartRow(paused.second.cart.id)).status).toBe("CONFIRMED");
    expect(await cancellationCredits(paused.second.cart.id)).toHaveLength(0);
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: paused.hold.id } })).cleanedAt,
    ).toBeNull();
    await enforceHold(paused.hold.id);
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: f.v.productId } })).hiddenAt,
    ).toBeNull();
    expect((await cartRow(paused.second.cart.id)).status).toBe("CONFIRMED");
  });
  it("cancelling a fault needs a note, keeps history and stops counting without closing hold", async () => {
    const f = await held(),
      fault = await db.factoryFault.findFirstOrThrow();
    for (const note of [" ", "x".repeat(2001)])
      await expect(cancelFault(f.admin.id, fault.id, note)).rejects.toThrow();
    await cancelFault(f.admin.id, fault.id, "Mistaken fault");
    expect(await countedFaultUnits(db, f.factory.id, new Date())).toBe(0);
    expect(await db.factoryFault.findUniqueOrThrow({ where: { id: fault.id } })).toMatchObject({
      cancelNote: "Mistaken fault",
      cancelledById: f.admin.id,
    });
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("owners and FACTORY/CORE share a thread, unread notices deduplicate, and history stays readable", async () => {
    const f = await held(),
      core = await makeUser("ADMIN", "CORE"),
      owner = await db.user.update({
        where: { id: (await makeUser()).id },
        data: { role: "SELLER", factoryId: f.factory.id, factoryRole: "OWNER" },
      });
    await postHoldMessage(owner.id, f.hold.id, "Seams checked");
    await postHoldMessage(f.factory.id, f.hold.id, "Inspection done");
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New hold message", readAt: null },
      }),
    ).toBe(1);
    expect(await listHoldMessages(f.admin.id, f.hold.id)).toHaveLength(2);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New hold message", readAt: null },
      }),
    ).toBe(0);
    await postHoldMessage(core.id, f.hold.id, "Continue after review");
    expect(await listHoldMessages(owner.id, f.hold.id)).toHaveLength(3);
    expect((await factoryFaults(owner.id)).faults).toHaveLength(1);
    expect(await adminHolds(core.id)).toHaveLength(1);
    await decideHold(core.id, f.hold.id, "CONTINUE", "Reviewed");
    expect(await listHoldMessages(f.factory.id, f.hold.id)).toHaveLength(3);
    await expect(postHoldMessage(owner.id, f.hold.id, "Late")).rejects.toThrow();
  });
  it("denies outsiders with not found, including staff, other factories, buyers and admin areas", async () => {
    const f = await held();
    const outsiders = [
      f.buyer,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN"),
      await fixture().then((x) => x.factory),
    ];
    for (const role of ["SALES", "PACKING", "PLANNER"] as const)
      outsiders.push(
        await db.user.update({
          where: { id: (await makeUser()).id },
          data: { role: "SELLER", factoryId: f.factory.id, factoryRole: role },
        }),
      );
    for (const u of outsiders) {
      await expect(listHoldMessages(u.id, f.hold.id)).rejects.toThrow(/not found/i);
      await expect(postHoldMessage(u.id, f.hold.id, "Secret")).rejects.toThrow(/not found/i);
      if (u.role === "SELLER" && u.factoryId === null)
        expect((await factoryFaults(u.id)).faults).toHaveLength(0);
      else await expect(factoryFaults(u.id)).rejects.toThrow();
      await expect(
        cancelFault(u.id, (await db.factoryFault.findFirstOrThrow()).id, "Mistake"),
      ).rejects.toThrow();
      await expect(decideHold(u.id, f.hold.id, "CONTINUE", "Review")).rejects.toThrow();
    }
  });
  it("validates notes, body length and ten messages per minute", async () => {
    const f = await held();
    for (const note of [" ", "x".repeat(2001)])
      await expect(decideHold(f.admin.id, f.hold.id, "CONTINUE", note)).rejects.toThrow();
    for (const body of [" ", "x".repeat(1001)])
      await expect(postHoldMessage(f.factory.id, f.hold.id, body)).rejects.toThrow();
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, (_, i) =>
        postHoldMessage(f.factory.id, f.hold.id, `Message ${i}`),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(10);
  });
});

it("enforcement flushes a pending hold message only after releasing its gate", async () => {
  const f = await fixture(),
    c = await statusCart(f, "CONFIRMED");
  const hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
  const id = `hold-message:${hold.id}:interrupted:${f.admin.id}`;
  await db.qualityNotice.create({
    data: {
      id,
      userId: f.admin.id,
      title: "New hold message",
      body: "",
      href: `/admin/factory/quality?hold=${hold.id}`,
    },
  });
  await enforceHold(hold.id);
  expect((await cartRow(c.cart.id)).status).toBe("CANCELLED");
  expect((await db.qualityNotice.findUniqueOrThrow({ where: { id } })).deliveredAt).not.toBeNull();
  expect(
    await db.notification.count({
      where: { userId: f.admin.id, title: "New hold message", readAt: null },
    }),
  ).toBe(1);
});

async function promptly<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Blocked by cleanup transaction")), 1500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function pauseBetweenCarts(f: Awaited<ReturnType<typeof fixture>>) {
  const first = await statusCart(f, "CONFIRMED"),
    second = await statusCart(f, "CONFIRMED"),
    hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
  let release!: () => void,
    ready!: () => void,
    paused = false;
  const started = new Promise<void>((r) => (ready = r)),
    block = new Promise<void>((r) => (release = r));
  const original = cartLocks.withCartTransaction;
  async function transaction<T>(
    ids: string[],
    users: string[],
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    const result = await original(ids, users, work);
    if (ids[0] === first.cart.id && !paused) {
      paused = true;
      ready();
      await block;
    }
    return result;
  }
  vi.spyOn(cartLocks, "withCartTransaction").mockImplementation(transaction);
  return { first, second, hold, started, release };
}
describe("review recovery regressions", () => {
  it("sweep recovers a committed Remove decision after removal fails, once", async () => {
    const f = await held();
    const staff = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER", factoryId: f.factory.id, factoryRole: "PACKING" },
    });
    const remove = vi
      .spyOn(quality, "removeFactory")
      .mockRejectedValueOnce(new Error("Simulated removal failure"));
    await expect(decideHold(f.admin.id, f.hold.id, "REMOVE", "Repeated faults")).rejects.toThrow(
      "Simulated removal failure",
    );
    const decision = await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } });
    expect(decision).toMatchObject({
      decision: "REMOVE",
      decidedById: f.admin.id,
      decisionNote: "Repeated faults",
    });
    expect(decision.decidedAt).not.toBeNull();
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }))
        .status,
    ).toBe("ACTIVE");
    await sweep();
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }))
        .status,
    ).toBe("REMOVED");
    expect((await db.user.findUniqueOrThrow({ where: { id: staff.id } })).locked).toBe(true);
    const profile = await db.factoryProfile.findUniqueOrThrow({
      where: { factoryUserId: f.factory.id },
    });
    await sweep();
    expect(remove).toHaveBeenCalledTimes(2);
    expect(
      await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }),
    ).toEqual(profile);
    expect(await db.faultHold.findUniqueOrThrow({ where: { id: f.hold.id } })).toEqual(decision);
  });
  it("one failed removal does not block other holds or normal expiry", async () => {
    const bad = await fixture(),
      good = await fixture();
    for (const f of [bad, good])
      await db.faultHold.create({
        data: {
          factoryId: f.factory.id,
          decision: "REMOVE",
          decidedAt: new Date(),
          decidedById: f.admin.id,
          decisionNote: "Repeated faults",
        },
      });
    const c = await statusCart(bad, "OPEN");
    await db.groupCart.update({ where: { id: c.cart.id }, data: { expiresAt: new Date(0) } });
    const original = quality.removeFactory;
    vi.spyOn(quality, "removeFactory").mockImplementation(
      (adminId, factoryId, reason, hold, note) =>
        factoryId === bad.factory.id
          ? Promise.reject(new Error("Still failing"))
          : original(adminId, factoryId, reason, hold, note),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(sweep()).resolves.toMatchObject({ closed: 1 });
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: good.factory.id } }))
        .status,
    ).toBe("REMOVED");
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: bad.factory.id } }))
        .status,
    ).toBe("ACTIVE");
    expect((await cartRow(c.cart.id)).status).toBe("EXPIRED");
  });
  it("hold posting and reading work while cleanup is paused between carts", async () => {
    const f = await fixture(),
      paused = await pauseBetweenCarts(f),
      enforcing = enforceHold(paused.hold.id);
    await paused.started;
    const posting = postHoldMessage(f.factory.id, paused.hold.id, "Inspection while cleaning");
    try {
      await promptly(posting);
      expect(
        (await promptly(listHoldMessages(f.admin.id, paused.hold.id))).map((m) => m.body),
      ).toEqual(["Inspection while cleaning"]);
    } finally {
      paused.release();
      await Promise.allSettled([enforcing, posting]);
    }
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: paused.hold.id } })).cleanedAt,
    ).not.toBeNull();
  });
  it("partial cleanup failure stays retryable with one credit per line", async () => {
    const f = await fixture(),
      first = await statusCart(f, "CONFIRMED"),
      second = await statusCart(f, "CONFIRMED"),
      hold = await db.faultHold.create({ data: { factoryId: f.factory.id } });
    const original = cartLocks.withCartTransaction;
    let failed = false;
    async function transaction<T>(
      ids: string[],
      users: string[],
      work: (tx: Tx) => Promise<T>,
    ): Promise<T> {
      if (ids[0] === second.cart.id && !failed) {
        failed = true;
        throw new Error("Interrupted between carts");
      }
      return original(ids, users, work);
    }
    vi.spyOn(cartLocks, "withCartTransaction").mockImplementation(transaction);
    await expect(enforceHold(hold.id)).rejects.toThrow("Interrupted between carts");
    expect((await db.faultHold.findUniqueOrThrow({ where: { id: hold.id } })).cleanedAt).toBeNull();
    expect((await cartRow(first.cart.id)).status).toBe("CANCELLED");
    expect((await cartRow(second.cart.id)).status).toBe("CONFIRMED");
    await sweep();
    await sweep();
    expect(
      (await db.faultHold.findUniqueOrThrow({ where: { id: hold.id } })).cleanedAt,
    ).not.toBeNull();
    for (const c of [first, second]) {
      expect((await cartRow(c.cart.id)).status).toBe("CANCELLED");
      expect((await cancellationCredits(c.cart.id)).map((e) => e.amount.toFixed(2)).sort()).toEqual(
        ["1500.00", "3000.00"],
      );
    }
  });
});
