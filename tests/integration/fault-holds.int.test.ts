import { afterAll, beforeEach, describe, it, expect } from "vitest";
import { db } from "@/server/db";
import { factoryDecide, adminDecide, fileReturn } from "@/server/returns";
import { recordFault, countedFaultUnits } from "@/server/fault-holds";
import { makeUser, makeVariant, resetDb, giftPhotoFile } from "./helpers";
beforeEach(resetDb);
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
      { units: 3, confirmedBy: "FACTORY", confirmedById: f.factory.id },
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
