import { saveProduct } from "@/server/catalogue";
import { addStaff, setStaffLocked } from "@/server/factory-team";
import { rateProduct } from "@/server/ratings";
import { afterAll, beforeEach, describe, it, expect } from "vitest";
import { D, toD } from "@/lib/decimal";
import { db } from "@/server/db";
import { hideProduct, removeFactory, qualityOverview } from "@/server/quality";
import { createCart, setLine, markDone, acceptAndPay, sweep } from "@/server/carts/service";
import { flushCancellationNotices } from "@/server/cancellations";
import { uploadSlip, approveSlip, rejectSlip } from "@/server/carts/slips";
import { credit, applyTokens, tokenBalance } from "@/server/tokens";
import { getProduct, listProducts, suggestProducts, shopFacets } from "@/server/catalogue";
import { authenticate, startSession, userForToken } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { bookDelivery } from "@/server/delivery";
import { makeReceivedOrder, makeUser, makeVariant, resetDb, slipFile } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
async function fund(userId: string, amount: string, ref: string) {
  await db.$transaction((tx) =>
    credit(tx, userId, new D(amount), "CANCELLATION", { cartLineId: ref }, "Test credit"),
  );
}
async function fixture(state = "READY", tokens = "500") {
  await db.settings.update({ where: { id: 1 }, data: { minOrderValue: "3000" } });
  const admin = await makeUser("ADMIN", "FACTORY"),
    warehouse = await makeUser("ADMIN"),
    owner = await makeUser(),
    member = await makeUser();
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER" },
  });
  await db.factoryProfile.create({
    data: { factoryUserId: factory.id, complianceDueAt: new Date("2099-01-01") },
  });
  const a = await makeVariant("1500", 5),
    b = await makeVariant("1500", 5);
  for (const [v, title] of [
    [a, "Quality shirt"],
    [b, "Other shirt"],
  ] as const)
    await db.product.update({
      where: { id: v.productId },
      data: {
        sellerId: factory.id,
        title,
        category: "APPAREL",
        factoryPrice: "1400",
        commission: "100",
        kind: "men-shirts",
        audience: "MEN",
      },
    });
  const cart = await createCart(owner.id, {});
  await setLine(owner.id, cart.id, b.id, 1);
  await setLine(member.id, cart.id, a.id, 1);
  const line = await db.cartLine.findFirstOrThrow({
    where: { cartId: cart.id, userId: member.id },
  });
  await fund(member.id, "1000", `seed:${member.id}`);
  if (tokens !== "0") await applyTokens(member.id, line.id, tokens);
  await markDone(member.id, cart.id);
  let slipId = "";
  if (state !== "READY") {
    await acceptAndPay(owner.id, cart.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    if (state !== "AWAITING_SLIP") {
      await uploadSlip(owner.id, cart.id, slipFile());
      const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: cart.id } });
      slipId = slip.id;
      if (state !== "SLIP_REVIEW") await approveSlip(warehouse.id, slip.id);
    }
  }
  if (state === "DISPATCHED") {
    await db.groupCart.update({ where: { id: cart.id }, data: { factoryPackedAt: new Date() } });
    await bookDelivery(cart.id, { quotedFee: "850" });
  }
  if (state === "DELIVERED")
    await db.groupCart.update({ where: { id: cart.id }, data: { status: "DELIVERED" } });
  return { admin, warehouse, owner, member, factory, a, b, cart, line, slipId };
}
async function conservation() {
  const credited = await db.tokenEntry.aggregate({
    where: { kind: { in: ["CANCELLATION", "RETURN"] } },
    _sum: { amount: true },
  });
  const people = await db.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true } });
  let balance = new D("0");
  for (const p of people) balance = balance.plus(await tokenBalance(p.id));
  const lines = await db.cartLine.findMany({
    where: {
      OR: [
        { cart: { confirmedAt: { not: null } } },
        {
          status: "ACTIVE",
          cart: { status: { in: ["OPEN", "READY", "AWAITING_SLIP", "SLIP_REVIEW"] } },
        },
      ],
    },
    select: { tokensApplied: true },
  });
  expect(
    balance
      .plus(lines.reduce((s, l) => s.plus(toD(l.tokensApplied)), new D("0")))
      .eq(toD(credited._sum.amount ?? "0")),
  ).toBe(true);
}
describe("quality hide/remove", () => {
  it.each(["500", "0"])(
    "removes unpaid lines with %s held tokens and resets done through normal release",
    async (tokens) => {
      const f = await fixture("READY", tokens);
      await db.product.update({
        where: { id: f.a.productId },
        data: { brand: "Hidden-only brand" },
      });
      await hideProduct(f.admin.id, f.a.productId, "Poor stitching");
      expect(await db.cartLine.count({ where: { id: f.line.id } })).toBe(0);
      expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1000.00");
      expect(await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).toMatchObject({
        status: "OPEN",
      });
      expect(
        (
          await db.cartMember.findUniqueOrThrow({
            where: { cartId_userId: { cartId: f.cart.id, userId: f.member.id } },
          })
        ).doneAt,
      ).toBeNull();
      expect(await db.variant.findUniqueOrThrow({ where: { id: f.a.id } })).toMatchObject({
        available: 5,
        reserved: 0,
      });
      expect(await getProduct(f.a.productId)).toBeNull();
      expect((await listProducts({})).some((p) => p.id === f.a.productId)).toBe(false);
      expect((await suggestProducts("Quality")).some((p) => p.id === f.a.productId)).toBe(false);
      expect((await shopFacets()).brands).not.toContain("Hidden-only brand");
      expect(await getProduct(f.b.productId)).not.toBeNull();
      await conservation();
    },
  );
  it("keeps accepted hidden lines and amounts unchanged through approval", async () => {
    const f = await fixture("AWAITING_SLIP");
    const before = await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } });
    const balance = await tokenBalance(f.member.id);
    await hideProduct(f.admin.id, f.a.productId, "Damaged stock");
    expect(await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      status: "ACTIVE",
      qty: 1,
    });
    expect(
      (await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).tokensApplied.toFixed(2),
    ).toBe("500.00");
    expect(
      (await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).total.toFixed(2),
    ).toBe(before.total.toFixed(2));
    await uploadSlip(f.owner.id, f.cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: f.cart.id } });
    expect(slip.amount.toFixed(2)).toBe("2500.00");
    await approveSlip(f.warehouse.id, slip.id);
    expect((await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).status).toBe(
      "ACTIVE",
    );
    expect((await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).status).toBe(
      "CONFIRMED",
    );
    expect((await tokenBalance(f.member.id)).eq(balance)).toBe(true);
    await hideProduct(f.admin.id, f.a.productId, "Retry");
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(0);
    await conservation();
  });
  it("confirms token-only carts with a product hidden before its cleanup transaction", async () => {
    const f = await fixture();
    await fund(f.member.id, "1000", "extra");
    await applyTokens(f.member.id, f.line.id, "1000");
    const own = await db.cartLine.findFirstOrThrow({
      where: { cartId: f.cart.id, userId: f.owner.id },
    });
    await fund(f.owner.id, "1500", "owner-fund");
    await applyTokens(f.owner.id, own.id, "1500");
    await markDone(f.member.id, f.cart.id);
    // Emulate interruption after hideProduct's metadata commit and before its per-cart cleanup.
    await db.product.update({
      where: { id: f.a.productId },
      data: { hiddenAt: new Date(), hiddenReason: "Quality hold", hiddenById: f.admin.id },
    });
    await acceptAndPay(f.owner.id, f.cart.id, {
      deliveryAddress: "12 Flower Rd",
      deliveryCity: "Colombo",
      deliveryPhone: "0771234567",
    });
    expect((await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).status).toBe(
      "CONFIRMED",
    );
    expect((await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).status).toBe(
      "ACTIVE",
    );
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(0);
    expect(await db.paymentSlip.count()).toBe(0);
    await conservation();
  });
  it("rejected slips release normally on timeout without cancellation credit", async () => {
    const f = await fixture("SLIP_REVIEW");
    await hideProduct(f.admin.id, f.a.productId, "Quality hold");
    await rejectSlip(f.warehouse.id, f.slipId, "Try again");
    await sweep(new Date(Date.now() + 3 * 3600000), f.cart.id);
    expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1000.00");
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(0);
    expect(await db.variant.findUniqueOrThrow({ where: { id: f.a.id } })).toMatchObject({
      available: 5,
      reserved: 0,
    });
    await conservation();
  });
  it("leaves delivered orders untouched", async () => {
    const f = await fixture("DELIVERED");
    await hideProduct(f.admin.id, f.a.productId, "Quality hold");
    expect((await db.cartLine.findUniqueOrThrow({ where: { id: f.line.id } })).status).toBe(
      "ACTIVE",
    );
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(0);
  });
  it("guards FACTORY/CORE quality queries and mutations", async () => {
    const f = await fixture();
    for (const actor of [f.member, f.factory, await makeUser("ADMIN", "PREMIUM"), f.warehouse]) {
      await expect(qualityOverview(actor.id)).rejects.toThrow();
      await expect(hideProduct(actor.id, f.a.productId, "Reason")).rejects.toThrow();
      await expect(removeFactory(actor.id, f.factory.id, "Reason", false)).rejects.toThrow();
    }
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: f.a.productId } })).hiddenAt,
    ).toBeNull();
    await qualityOverview(f.admin.id);
    const core = await makeUser("ADMIN", "CORE");
    await qualityOverview(core.id);
    await hideProduct(core.id, f.a.productId, "Core decision");
  });
  it("serializes hide with editable share changes and preserves ledger conservation", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      hideProduct(f.admin.id, f.a.productId, "Race quality"),
      setLine(f.member.id, f.cart.id, f.a.id, 2),
      applyTokens(f.member.id, f.line.id, "100"),
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(await db.cartLine.count({ where: { id: f.line.id } })).toBe(0);
    await conservation();
  });
  it("serializes hide with approval without credits and refuses frozen edits", async () => {
    const f = await fixture("SLIP_REVIEW");
    const results = await Promise.allSettled([
      hideProduct(f.admin.id, f.a.productId, "Race quality"),
      approveSlip(f.warehouse.id, f.slipId),
      setLine(f.member.id, f.cart.id, f.a.id, 2),
      applyTokens(f.member.id, f.line.id, "100"),
    ]);
    expect(results.slice(0, 2).every((r) => r.status === "fulfilled")).toBe(true);
    expect(results.slice(2).every((r) => r.status === "rejected")).toBe(true);
    await flushCancellationNotices();
    expect(
      await db.tokenEntry.count({ where: { eventKey: `credit:CANCELLATION:${f.line.id}` } }),
    ).toBe(0);
    await conservation();
  });
  it("removes factories, ends staff sessions, holds earnings and sends no factory notice", async () => {
    const f = await fixture("CONFIRMED");
    const staff = await db.user.create({
      data: {
        name: "Factory staff",
        email: "staff@test.lk",
        passwordHash: await hashPassword("password123"),
        role: "SELLER",
        factoryId: f.factory.id,
        factoryRole: "SALES",
      },
    });
    const sessions = [await startSession(f.factory.id), await startSession(staff.id)];
    await db.notification.deleteMany({ where: { userId: { in: [f.factory.id, staff.id] } } });
    await removeFactory(
      f.admin.id,
      f.factory.id,
      "Repeated quality failures",
      true,
      "Pending review",
    );
    await removeFactory(f.admin.id, f.factory.id, "Retry", true, "Pending review");
    expect(
      await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }),
    ).toMatchObject({
      status: "REMOVED",
      removedById: f.admin.id,
      removalReason: "Repeated quality failures",
      earningsHeld: true,
      earningsHeldNote: "Pending review",
    });
    for (const session of sessions) expect(await userForToken(session.token)).toBeNull();
    await expect(authenticate(staff.email, "password123")).rejects.toThrow(/locked/);
    expect(await db.session.count({ where: { userId: { in: [f.factory.id, staff.id] } } })).toBe(0);
    expect(
      await db.notification.count({ where: { userId: { in: [f.factory.id, staff.id] } } }),
    ).toBe(0);
    expect(await db.product.count({ where: { sellerId: f.factory.id, hiddenAt: null } })).toBe(0);
    expect((await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).status).toBe(
      "CANCELLED",
    );
    expect(
      await db.tokenEntry.count({
        where: {
          kind: "CANCELLATION",
          cartLineId: {
            in: [
              f.line.id,
              (
                await db.cartLine.findFirstOrThrow({
                  where: { cartId: f.cart.id, userId: f.owner.id },
                })
              ).id,
            ],
          },
        },
      }),
    ).toBe(2);
    await conservation();
  });
  it("removing a dispatched factory preserves delivery without cancellation alerts", async () => {
    const f = await fixture("DISPATCHED");
    const delivery = await db.delivery.findUniqueOrThrow({ where: { cartId: f.cart.id } });
    await removeFactory(f.admin.id, f.factory.id, "Pickup quality hold", false);
    await removeFactory(f.admin.id, f.factory.id, "Add hold", true, "Later quality review");
    await removeFactory(f.admin.id, f.factory.id, "Retry", false);
    expect(
      (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }))
        .earningsHeld,
    ).toBe(true);
    expect(await db.delivery.findUniqueOrThrow({ where: { cartId: f.cart.id } })).toEqual(delivery);
    expect(
      await db.notification.count({
        where: { userId: f.warehouse.id, title: `Cancelled dispatched cart ${f.cart.code}` },
      }),
    ).toBe(0);
  });
});

it("computes report flags on reads without automatic hiding or removal", async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) {
    const o = await makeReceivedOrder({ factory: { factory: f.factory, variant: f.a } });
    await rateProduct(o.buyer.id, o.order.id, f.a.productId, 1, {
      reason: "SIZE",
      note: "Too small",
      photos: [],
    });
  }
  const overview = await qualityOverview(f.admin.id);
  expect(overview.products.find((p) => p.id === f.a.productId)?.flagged).toBe(true);
  expect(overview.factories.find((p) => p.id === f.factory.id)?.flagged).toBe(false);
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: f.a.productId } })).hiddenAt,
  ).toBeNull();
  expect(
    (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } })).status,
  ).toBe("ACTIVE");
});
it("retries interrupted metadata-first cleanup and notice delivery without double credits or notices", async () => {
  const f = await fixture();
  await db.product.update({
    where: { id: f.a.productId },
    data: { hiddenAt: new Date(), hiddenById: f.admin.id, hiddenReason: "Original reason" },
  });
  await hideProduct(f.admin.id, f.a.productId, "Retry reason");
  await db.qualityNotice.updateMany({ data: { deliveredAt: null } });
  await hideProduct(f.admin.id, f.a.productId, "Retry again");
  expect(
    await db.notification.count({ where: { userId: f.member.id, body: "Original reason" } }),
  ).toBe(1);
  expect(await db.qualityNotice.count({ where: { deliveredAt: null } })).toBe(0);
  expect((await tokenBalance(f.member.id)).toFixed(2)).toBe("1000.00");
});
it("fences in-flight listings, staff creation and unlocks before removal locks all factory accounts", async () => {
  const f = await fixture();
  const staff = await db.user.create({
    data: {
      name: "Locked staff",
      email: "locked@test.lk",
      role: "SELLER",
      factoryId: f.factory.id,
      factoryRole: "SALES",
      passwordHash: "x",
      locked: true,
    },
  });
  const results = await Promise.allSettled([
    saveProduct(
      null,
      {
        title: "Concurrent shirt",
        brand: "Factory",
        audience: "MEN",
        kind: "men-shirts",
        price: "1400",
      },
      null,
      { sellerId: f.factory.id },
    ),
    addStaff(f.factory.id, {
      name: "New staff",
      email: "new-staff@test.lk",
      phone: "",
      role: "SALES",
      password: "password123",
    }),
    setStaffLocked(f.factory.id, staff.id, false, f.factory.id),
    removeFactory(f.admin.id, f.factory.id, "Quality removal", false),
  ]);
  expect(results[3].status).toBe("fulfilled");
  expect(await db.user.count({ where: { factoryId: f.factory.id, locked: false } })).toBe(0);
  expect(await db.product.count({ where: { sellerId: f.factory.id, hiddenAt: null } })).toBe(0);
});
