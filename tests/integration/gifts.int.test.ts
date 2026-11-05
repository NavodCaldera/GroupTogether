import { D } from "@/lib/decimal";
import { credit, applyTokens } from "@/server/tokens";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBrandOffer, reviseBrandOffer } from "@/server/brands";
import { db } from "@/server/db";
import { brandPhotoFor } from "@/server/brand-photos";
import {
  approveGiftBill,
  brandDashboard,
  cancelReservedGift,
  recordGiftSettlement,
  reserveGift,
  updateGiftAvailability,
  updateGiftDelivery,
} from "@/server/gifts";
import {
  acceptAndPay,
  acceptMerge,
  cancelCart,
  createCart,
  leaveCart,
  requestMerge,
  setLine,
  sweep,
} from "@/server/carts/service";
import { approveSlip, rejectSlip, uploadSlip } from "@/server/carts/slips";
import { reviewBrandOffer } from "@/server/brand-reviews";
import { giftPhotoFile, makeUser, makeVariant, resetDb, slipFile } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

async function fixture(pieces = 10) {
  const admin = await makeUser("ADMIN", "PREMIUM");
  const warehouse = await makeUser("ADMIN", "WAREHOUSE");
  const owner = await makeUser();
  const brandUser = await makeUser();
  const brand = await db.user.update({
    where: { id: brandUser.id },
    data: {
      role: "SELLER",
      isBrand: true,
      website: "https://brand.example",
      company: "Test brand",
    },
  });
  const offer = await createBrandOffer(
    brand.id,
    {
      name: "Premium gift",
      description: "Partner gift pack",
      packDetails: "One premium gift pack",
      packSize: "200 ml",
      dispatchDays: "2",
      actualPrice: "5000",
      offerPrice: "3500",
      pieces,
      productUrl: "https://brand.example/gift",
    },
    giftPhotoFile(),
  );
  await reviewBrandOffer(admin.id, offer.id, 1, "approve", "");
  const variant = await makeVariant("25000", 20);
  const cart = await createCart(owner.id, {});
  await setLine(owner.id, cart.id, variant.id, 2);
  return { admin, warehouse, owner, brand, offer, variant, cart };
}

async function pay(f: Awaited<ReturnType<typeof fixture>>) {
  await acceptAndPay(f.owner.id, f.cart.id, {
    deliveryAddress: "1 Test Rd",
    deliveryCity: "Colombo",
    deliveryPhone: f.owner.phone!,
  });
  await uploadSlip(f.owner.id, f.cart.id, slipFile());
  const slip = await db.paymentSlip.findFirstOrThrow({
    where: { cartId: f.cart.id },
    orderBy: { createdAt: "desc" },
  });
  await approveSlip(f.warehouse.id, slip.id);
}

describe("brand gift reservations", () => {
  it("reduces availability without exposing unpaid recipients or creating a bill", async () => {
    const f = await fixture();
    const gift = await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    const dash = await brandDashboard(f.brand.id);
    expect(await brandPhotoFor(f.owner, f.offer.id)).toMatchObject({ photoKey: f.offer.photoKey });
    expect(dash.offers[0]).toMatchObject({ available: 9, reserved: 1, allocated: 1 });
    expect(dash.gifts).toEqual([]);
    await expect(approveGiftBill(f.admin.id, gift.id)).rejects.toThrow("cannot be approved");
    await expect(
      updateGiftDelivery(f.brand.id, gift.id, "dispatch", "Courier", "A1", ""),
    ).rejects.toThrow("Only paid");
  });

  it("serializes competing baskets for the last gift", async () => {
    const f = await fixture(1);
    const other = await makeUser();
    const cart = await createCart(other.id, {});
    await setLine(other.id, cart.id, f.variant.id, 1);
    const results = await Promise.allSettled([
      reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id),
      reserveGift(f.admin.id, cart.id, other.id, f.offer.id),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await brandDashboard(f.brand.id)).offers[0].available).toBe(0);
  });

  it("releases removed, reduced, expired and cancelled basket reservations", async () => {
    const f = await fixture();
    const first = await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    await cancelReservedGift(f.owner.id, first.id);
    await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    await setLine(f.owner.id, f.cart.id, f.variant.id, 1);
    expect((await brandDashboard(f.brand.id)).offers[0].available).toBe(10);
    await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    await sweep(new Date(Date.now() + 25 * 3600000), f.cart.id);
    expect((await brandDashboard(f.brand.id)).offers[0].available).toBe(10);
    const cart = await createCart(f.owner.id, {});
    await setLine(f.owner.id, cart.id, f.variant.id, 1);
    await reserveGift(f.admin.id, cart.id, f.owner.id, f.offer.id);
    await cancelCart(f.owner, cart.id);
    expect((await brandDashboard(f.brand.id)).offers[0].available).toBe(10);
  });

  it("releases a departing member's gift and preserves a gift during a basket merge", async () => {
    const f = await fixture();
    const member = await makeUser();
    await setLine(member.id, f.cart.id, f.variant.id, 1);
    await reserveGift(f.admin.id, f.cart.id, member.id, f.offer.id);
    await leaveCart(member.id, f.cart.id);
    expect((await brandDashboard(f.brand.id)).offers[0].reserved).toBe(0);
    const gift = await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    const target = await createCart(member.id, {});
    const req = await requestMerge(f.owner.id, target.id);
    await acceptMerge(member.id, req.id);
    expect(await db.giftOrder.findUniqueOrThrow({ where: { id: gift.id } })).toMatchObject({
      cartId: target.id,
      status: "RESERVED",
    });
    expect((await brandDashboard(f.brand.id)).offers[0].reserved).toBe(1);
  });

  it("keeps the reservation through a rejected slip and releases on payment timeout", async () => {
    const f = await fixture();
    await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    await acceptAndPay(f.owner.id, f.cart.id, {
      deliveryAddress: "1 Test Rd",
      deliveryCity: "Colombo",
      deliveryPhone: f.owner.phone!,
    });
    await uploadSlip(f.owner.id, f.cart.id, slipFile());
    const slip = await db.paymentSlip.findFirstOrThrow({ where: { cartId: f.cart.id } });
    await rejectSlip(f.warehouse.id, slip.id, "Wrong amount");
    expect((await brandDashboard(f.brand.id)).offers[0].reserved).toBe(1);
    await sweep(new Date(Date.now() + 3 * 3600000), f.cart.id);
    expect((await brandDashboard(f.brand.id)).offers[0].available).toBe(10);
  });

  it("enforces brand isolation, allocation floors, pauses and immutable approved prices", async () => {
    const f = await fixture();
    const gift = await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    await expect(reserveGift(f.owner.id, f.cart.id, f.owner.id, f.offer.id)).rejects.toThrow(
      "Only admins",
    );
    await expect(reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id)).rejects.toThrow(
      "already has a gift",
    );
    await expect(updateGiftAvailability(f.brand.id, f.offer.id, 0, false)).rejects.toThrow(
      "below 1",
    );
    await updateGiftAvailability(f.brand.id, f.offer.id, 10, true);
    const outsider = await makeUser();
    const otherBrand = await db.user.update({
      where: { id: outsider.id },
      data: { role: "SELLER", isBrand: true },
    });
    await expect(updateGiftAvailability(otherBrand.id, f.offer.id, 20, false)).rejects.toThrow(
      "not found",
    );
    await pay(f);
    await expect(
      updateGiftDelivery(otherBrand.id, gift.id, "dispatch", "C", "A", ""),
    ).rejects.toThrow("Only paid");
    expect((await brandDashboard(otherBrand.id)).gifts).toEqual([]);
    await reviseBrandOffer(f.brand.id, f.offer.id, {
      name: "Premium gift",
      description: "New details",
      packDetails: "One premium gift pack",
      packSize: "200 ml",
      dispatchDays: "2",
      actualPrice: "6000",
      offerPrice: "4000",
      pieces: 10,
      productUrl: "https://brand.example/gift",
    });
    expect(
      (await db.stockOffer.findUniqueOrThrow({ where: { id: f.offer.id } })).offerPrice?.toString(),
    ).toBe("3500");
    await reviewBrandOffer(f.admin.id, f.offer.id, 2, "approve", "");
    expect(
      (await db.stockOffer.findUniqueOrThrow({ where: { id: f.offer.id } })).offerPrice?.toString(),
    ).toBe("4000");
    expect(
      (await db.giftOrder.findUniqueOrThrow({ where: { id: gift.id } })).partnerPrice.toString(),
    ).toBe("3500");
  });
});

describe("direct fulfilment and settlement", () => {
  it("authorizes on payment approval, records tracking, holds issues and prevents duplicate settlement", async () => {
    const f = await fixture();
    const gift = await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
    await pay(f);
    expect((await brandDashboard(f.brand.id)).gifts[0]).toMatchObject({
      status: "READY",
      recipientName: f.owner.name,
    });
    await expect(updateGiftDelivery(f.brand.id, gift.id, "dispatch", "", "", "")).rejects.toThrow(
      "courier",
    );
    await updateGiftDelivery(f.brand.id, gift.id, "dispatch", "Courier", "TRACK-1", "");
    await approveGiftBill(f.admin.id, gift.id);
    await updateGiftDelivery(f.brand.id, gift.id, "issue", "", "", "Recipient unavailable");
    await expect(recordGiftSettlement(f.admin.id, f.brand.id, [gift.id], "BANK-1")).rejects.toThrow(
      "need review",
    );
    await updateGiftDelivery(f.brand.id, gift.id, "dispatch", "Courier", "TRACK-2", "");
    await updateGiftDelivery(f.brand.id, gift.id, "deliver", "", "", "");
    const results = await Promise.allSettled([
      recordGiftSettlement(f.admin.id, f.brand.id, [gift.id], "BANK-1"),
      recordGiftSettlement(f.admin.id, f.brand.id, [gift.id], "BANK-1"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const dashboard = await brandDashboard(f.brand.id);
    expect(dashboard.settlements).toHaveLength(1);
    expect(dashboard.settlements[0].amount.toString()).toBe("3500");
    expect(dashboard.gifts[0].settlementId).toBe(dashboard.settlements[0].id);
  });
});

it("zero-due acceptance activates gifts, records brand events and notifies the factory", async () => {
  const f = await fixture();
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER" },
  });
  await db.factoryProfile.create({
    data: { factoryUserId: factory.id, complianceDueAt: new Date("2099-01-01") },
  });
  await db.product.update({
    where: { id: f.variant.productId },
    data: { sellerId: factory.id, category: "APPAREL", title: "Token-covered shirts" },
  });
  const gift = await reserveGift(f.admin.id, f.cart.id, f.owner.id, f.offer.id);
  const line = await db.cartLine.findFirstOrThrow({ where: { cartId: f.cart.id } });
  await db.$transaction((tx) =>
    credit(
      tx,
      f.owner.id,
      new D("50000"),
      "CANCELLATION",
      { cartLineId: `fund:${line.id}` },
      "Test credit",
    ),
  );
  await applyTokens(f.owner.id, line.id, "50000");
  const now = new Date();
  await acceptAndPay(
    f.owner.id,
    f.cart.id,
    { deliveryAddress: "1 Test Rd", deliveryCity: "Colombo", deliveryPhone: f.owner.phone! },
    now,
  );
  expect(await db.giftOrder.findUniqueOrThrow({ where: { id: gift.id } })).toMatchObject({
    status: "READY",
    paidAt: now,
  });
  expect(
    await db.brandMessage.count({
      where: { requestKey: `gift-payment:${gift.id}`, authorId: f.owner.id, system: true },
    }),
  ).toBe(1);
  expect(
    await db.notification.count({ where: { userId: factory.id, title: "New order to pack" } }),
  ).toBe(1);
  expect(await db.paymentSlip.count({ where: { cartId: f.cart.id } })).toBe(0);
});
