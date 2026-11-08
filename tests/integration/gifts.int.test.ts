import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createBrandOffer, reviseBrandOffer } from "@/server/brands";
import { db } from "@/server/db";
import {
  approveGiftBill,
  brandDashboard,
  recordGiftSettlement,
  updateGiftAvailability,
  updateGiftDelivery,
} from "@/server/gifts";
import { reviewBrandOffer } from "@/server/brand-reviews";
import { giftPhotoFile, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

// Gift reservation lived on the old group carts and is parked with them; these tests cover the
// brand side of gift orders that already exist.
async function fixture(pieces = 10) {
  const admin = await makeUser("ADMIN", "PREMIUM");
  const recipient = await makeUser();
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
  return { admin, recipient, brand, offer };
}

/** A stored gift order; `paid` makes it ready for the brand to dispatch. */
function gift(f: Awaited<ReturnType<typeof fixture>>, paid: boolean) {
  return db.giftOrder.create({
    data: {
      offerId: f.offer.id,
      recipientId: f.recipient.id,
      status: paid ? "READY" : "RESERVED",
      retailValue: "5000",
      partnerPrice: "3500",
      recipientName: f.recipient.name,
      phone: f.recipient.phone!,
      address: "1 Test Rd",
      city: "Colombo",
      authorizedById: f.admin.id,
      paidAt: paid ? new Date() : null,
    },
  });
}

describe("brand gift orders", () => {
  it("hides unpaid gifts from the brand and bills nothing for them", async () => {
    const f = await fixture();
    const g = await gift(f, false);
    const dash = await brandDashboard(f.brand.id);
    expect(dash.offers[0]).toMatchObject({ available: 9, reserved: 1, allocated: 1 });
    expect(dash.gifts).toEqual([]);
    await expect(approveGiftBill(f.admin.id, g.id)).rejects.toThrow("cannot be approved");
    await expect(
      updateGiftDelivery(f.brand.id, g.id, "dispatch", "Courier", "A1", ""),
    ).rejects.toThrow("Only paid");
  });

  it("enforces brand isolation, allocation floors, pauses and immutable approved prices", async () => {
    const f = await fixture();
    const g = await gift(f, true);
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
    await expect(updateGiftDelivery(otherBrand.id, g.id, "dispatch", "C", "A", "")).rejects.toThrow(
      "Only paid",
    );
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
      (await db.giftOrder.findUniqueOrThrow({ where: { id: g.id } })).partnerPrice.toString(),
    ).toBe("3500");
  });
});

describe("direct fulfilment and settlement", () => {
  it("records tracking, holds issues and prevents duplicate settlement", async () => {
    const f = await fixture();
    const g = await gift(f, true);
    expect((await brandDashboard(f.brand.id)).gifts[0]).toMatchObject({
      status: "READY",
      recipientName: f.recipient.name,
    });
    await expect(updateGiftDelivery(f.brand.id, g.id, "dispatch", "", "", "")).rejects.toThrow(
      "courier",
    );
    await updateGiftDelivery(f.brand.id, g.id, "dispatch", "Courier", "TRACK-1", "");
    expect(
      await db.notification.count({
        where: { userId: f.recipient.id, title: "Your gift was dispatched" },
      }),
    ).toBe(1);
    await approveGiftBill(f.admin.id, g.id);
    await updateGiftDelivery(f.brand.id, g.id, "issue", "", "", "Recipient unavailable");
    await expect(recordGiftSettlement(f.admin.id, f.brand.id, [g.id], "BANK-1")).rejects.toThrow(
      "need review",
    );
    await updateGiftDelivery(f.brand.id, g.id, "dispatch", "Courier", "TRACK-2", "");
    await updateGiftDelivery(f.brand.id, g.id, "deliver", "", "", "");
    const results = await Promise.allSettled([
      recordGiftSettlement(f.admin.id, f.brand.id, [g.id], "BANK-1"),
      recordGiftSettlement(f.admin.id, f.brand.id, [g.id], "BANK-1"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const dashboard = await brandDashboard(f.brand.id);
    expect(dashboard.settlements).toHaveLength(1);
    expect(dashboard.settlements[0].amount.toString()).toBe("3500");
    expect(dashboard.gifts[0].settlementId).toBe(dashboard.settlements[0].id);
  });
});
