import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSeller, homeFor } from "@/server/auth/service";
import { createCart, setLine } from "@/server/carts/service";
import { db } from "@/server/db";
import {
  deleteDraft,
  publishProduct,
  returnToSeller,
  sellerAdjustStock,
  sellerSaveProduct,
  submitForReview,
  withdrawFromReview,
} from "@/server/seller";
import { makeUser, resetDb } from "./helpers";

const shoe = {
  title: "Factory loafer",
  brand: "Ceylon",
  audience: "MEN",
  kind: "men-sneakers",
  stockType: "FACTORY_SURPLUS",
  price: "6200",
  // A seller can't choose the status: this is ignored.
  status: "LIVE",
};

let n = 0;
beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

async function seller() {
  n++;
  return createSeller({
    name: "Nuwan",
    company: `Mill ${n}`,
    email: `seller${n}-${Date.now()}@test.lk`,
    phone: `076${String(1000000 + n).slice(-7)}`,
    password: "password123",
  });
}

const product = (id: string) => db.product.findUniqueOrThrow({ where: { id } });

describe("factory seller listing flow", () => {
  it("draft → stock → review → returned → resubmitted → live, and a buyer can add it", async () => {
    const [s, admin, buyer] = [await seller(), await makeUser("ADMIN"), await makeUser()];
    expect(s.role).toBe("SELLER");
    expect(homeFor(s.role)).toBe("/seller");

    const p = await sellerSaveProduct(s.id, null, shoe, null);
    expect(p).toMatchObject({ status: "DRAFT", sellerId: s.id });

    await expect(submitForReview(s.id, p.id)).rejects.toThrow("Add stock");
    await sellerAdjustStock(s.id, p.id, "UK 9", "", 5);
    await submitForReview(s.id, p.id);
    expect((await product(p.id)).status).toBe("IN_REVIEW");
    expect(await db.notification.count({ where: { userId: admin.id } })).toBe(1);

    // Locked while in review.
    await expect(sellerSaveProduct(s.id, p.id, shoe, null)).rejects.toThrow("in review");
    await expect(sellerAdjustStock(s.id, p.id, "UK 9", "", 1)).rejects.toThrow("in review");

    await returnToSeller(p.id, "Add a photo");
    expect(await product(p.id)).toMatchObject({ status: "DRAFT", reviewNote: "Add a photo" });
    expect(await db.notification.count({ where: { userId: s.id, title: "Your product needs changes" } })).toBe(1);

    await sellerSaveProduct(s.id, p.id, { ...shoe, title: "Factory loafer v2" }, null);
    await submitForReview(s.id, p.id);
    expect((await product(p.id)).reviewNote).toBeNull();
    await publishProduct(p.id);
    expect(await product(p.id)).toMatchObject({ status: "LIVE", title: "Factory loafer v2" });
    expect(await db.notification.count({ where: { userId: s.id, title: "Your product is live" } })).toBe(1);

    // Live: the seller can't change it any more; buyers can buy it.
    await expect(sellerSaveProduct(s.id, p.id, shoe, null)).rejects.toThrow("live");
    await expect(sellerAdjustStock(s.id, p.id, "UK 9", "", 10)).rejects.toThrow("live");
    const v = await db.variant.findFirstOrThrow({ where: { productId: p.id } });
    const cart = await createCart(buyer.id, {});
    await setLine(buyer.id, cart.id, v.id, 2);
    expect(await db.variant.findUniqueOrThrow({ where: { id: v.id } })).toMatchObject({
      available: 3,
      reserved: 2,
    });
  });

  it("a product in review is hidden from the shop and can't be added to carts", async () => {
    const [s, buyer] = [await seller(), await makeUser()];
    const p = await sellerSaveProduct(s.id, null, shoe, null);
    await sellerAdjustStock(s.id, p.id, "UK 9", "", 5);
    await submitForReview(s.id, p.id);
    const v = await db.variant.findFirstOrThrow({ where: { productId: p.id } });
    const cart = await createCart(buyer.id, {});
    await expect(setLine(buyer.id, cart.id, v.id, 1)).rejects.toThrow();
  });

  it("sellers only touch their own drafts", async () => {
    const [a, b] = [await seller(), await seller()];
    const p = await sellerSaveProduct(a.id, null, shoe, null);
    await expect(sellerSaveProduct(b.id, p.id, shoe, null)).rejects.toThrow("not found");
    await expect(sellerAdjustStock(b.id, p.id, "UK 9", "", 1)).rejects.toThrow("not found");
    await expect(deleteDraft(b.id, p.id)).rejects.toThrow("not found");
  });

  it("withdraws from review and deletes a draft", async () => {
    const s = await seller();
    const p = await sellerSaveProduct(s.id, null, shoe, null);
    await sellerAdjustStock(s.id, p.id, "UK 9", "", 1);
    await submitForReview(s.id, p.id);
    await withdrawFromReview(s.id, p.id);
    expect((await product(p.id)).status).toBe("DRAFT");
    await deleteDraft(s.id, p.id);
    expect(await db.product.count({ where: { id: p.id } })).toBe(0);
  });

  it("B-grade needs defects, and admins can only publish what is in review", async () => {
    const s = await seller();
    await expect(
      sellerSaveProduct(s.id, null, { ...shoe, stockType: "B_GRADE" }, null),
    ).rejects.toThrow();
    const p = await sellerSaveProduct(s.id, null, shoe, null);
    await expect(publishProduct(p.id)).rejects.toThrow("isn't waiting for review");
  });

  it("refuses a second account with the same email", async () => {
    const s = await seller();
    await expect(
      createSeller({
        name: "Another person",
        company: "Y Mills",
        email: s.email,
        phone: "0769999999",
        password: "password123",
      }),
    ).rejects.toThrow("already exists");
  });
});
