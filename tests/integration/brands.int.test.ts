import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSeller } from "@/server/auth/service";
import { createBrandOffer, reviseBrandOffer } from "@/server/brands";
import { brandPhotoFor } from "@/server/brand-photos";
import { storage } from "@/server/storage";
import { getProduct, listProducts, saveProduct, suggestProducts } from "@/server/catalogue";
import { createCart, setLine } from "@/server/carts/service";
import { stockToReceive } from "@/server/receiving";
import { db } from "@/server/db";
import { linkOfferProduct } from "@/server/designs";
import { reviewBrandOffer } from "@/server/brand-reviews";
import { giftPhotoFile, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

let n = 0;
const SITE = "https://www.serendib-atelier.example";

function account(isBrand: boolean, website?: string) {
  n++;
  return createSeller({
    name: "Amaya",
    company: isBrand ? "Serendib Atelier" : `Mill ${n}`,
    email: `brand${n}-${Date.now()}@test.lk`,
    phone: `074${String(1000000 + n).slice(-7)}`,
    password: "password123",
    ...(isBrand ? { isBrand: "on", website } : {}),
  });
}

const kaftan = {
  name: "Hand-loomed linen kaftan",
  description: "Natural linen, S to L. Last season's colours.",
  packDetails: "One linen kaftan in a gift box",
  packSize: "One size",
  dispatchDays: "2",
  actualPrice: "18,500",
  offerPrice: "9800",
  pieces: "40",
  productUrl: "https://serendib-atelier.example/products/linen-kaftan",
};

describe("luxury brand accounts", () => {
  it("need the brand's website", async () => {
    await expect(account(true)).rejects.toThrow("brand's website");
    await expect(account(true, "http://insecure.example")).rejects.toThrow("brand's website");
    const brand = await account(true, SITE);
    await expect(createBrandOffer(brand.id, { ...kaftan, offerPrice: "abc" })).rejects.toThrow(
      "discount price",
    );
    expect(brand).toMatchObject({ role: "SELLER", isBrand: true, website: SITE });
    expect(await account(false)).toMatchObject({ isBrand: false, website: null });
  });
});

describe("brand products", () => {
  it("requires an image and pack/dispatch details, supports optional description and protects photos", async () => {
    const brand = await account(true, SITE);
    await expect(createBrandOffer(brand.id, kaftan)).rejects.toThrow("gift photo");
    await expect(
      createBrandOffer(brand.id, { ...kaftan, packDetails: "" }, giftPhotoFile()),
    ).rejects.toThrow("gift contains");
    await expect(
      createBrandOffer(brand.id, { ...kaftan, dispatchDays: "0" }, giftPhotoFile()),
    ).rejects.toThrow("business day");
    const offer = await createBrandOffer(
      brand.id,
      { ...kaftan, description: "", hasExpiry: true, minShelfLifeDays: "180" },
      giftPhotoFile(),
    );
    expect(offer).toMatchObject({
      description: "",
      packSize: "One size",
      dispatchDays: 2,
      minShelfLifeDays: 180,
      photoType: "image/png",
    });
    expect(await storage().get(offer.photoKey!)).not.toBeNull();
    expect(await brandPhotoFor(null, offer.id)).toBeNull();
    const outsider = await makeUser();
    expect(await brandPhotoFor(outsider, offer.id)).toBeNull();
    expect(await brandPhotoFor(brand, offer.id)).toMatchObject({ photoKey: offer.photoKey });
    const admin = await makeUser("ADMIN", "PREMIUM");
    expect(await brandPhotoFor(admin, offer.id)).toMatchObject({ photoKey: offer.photoKey });
    await reviseBrandOffer(brand.id, offer.id, {
      ...kaftan,
      packDetails: "Revised kaftan with a matching pouch",
    });
    expect(await db.stockOffer.findUniqueOrThrow({ where: { id: offer.id } })).toMatchObject({
      photoKey: offer.photoKey,
      packDetails: "Revised kaftan with a matching pouch",
    });
    await expect(
      createBrandOffer(brand.id, { ...kaftan, hasExpiry: true }, giftPhotoFile()),
    ).rejects.toThrow("expiry date or minimum");
    await expect(
      createBrandOffer(
        brand.id,
        { ...kaftan, hasExpiry: true, expiryDate: "2026-02-31" },
        giftPhotoFile(),
      ),
    ).rejects.toThrow("expiry date");
  });
  it("publish with the actual price, discount price, pieces and link; admins are told", async () => {
    const [brand, admin] = [await account(true, SITE), await makeUser("ADMIN", "PREMIUM")];
    const o = await createBrandOffer(brand.id, kaftan, giftPhotoFile());
    expect(o.actualPrice?.toString()).toBe("18500");
    expect(o.offerPrice?.toString()).toBe("9800");
    expect(o.pieces).toBe(40);
    expect(o.amount.toString()).toBe("392000");
    expect(o.status).toBe("IN_REVIEW");
    expect(
      await db.notification.count({
        where: { userId: admin.id, title: "Brand workspace update" },
      }),
    ).toBe(1);
  });

  it("refuse a link off the brand's site, a discount at or above the actual price, and factories", async () => {
    const brand = await account(true, SITE);
    await expect(
      createBrandOffer(brand.id, { ...kaftan, productUrl: "https://reseller.lk/kaftan" }),
    ).rejects.toThrow("serendib-atelier.example");
    await expect(createBrandOffer(brand.id, { ...kaftan, offerPrice: "18500" })).rejects.toThrow(
      "below the actual price",
    );
    const factory = await account(false);
    await expect(createBrandOffer(factory.id, kaftan)).rejects.toThrow("Only luxury brands");
  });

  it("retain retail references but cannot be linked to an ordinary shop product", async () => {
    const brand = await account(true, SITE);
    const o = await createBrandOffer(brand.id, kaftan, giftPhotoFile());
    await reviewBrandOffer((await makeUser("ADMIN", "PREMIUM")).id, o.id, 1, "approve", "");

    const product = {
      title: kaftan.name,
      brand: "Serendib Atelier",
      audience: "WOMEN",
      kind: "women-dresses",
      price: "11900",
    };
    await expect(
      saveProduct(null, { ...product, brandUrl: kaftan.productUrl }, null),
    ).rejects.toThrow("actual price");
    await expect(
      saveProduct(null, { ...product, retailPrice: "18500", brandUrl: "not a link" }, null),
    ).rejects.toThrow("full link");

    const p = await saveProduct(
      null,
      { ...product, retailPrice: "18500", brandUrl: kaftan.productUrl },
      null,
    );
    expect(p.brandUrl).toBe(kaftan.productUrl);
    expect(p.retailPrice?.toString()).toBe("18500");
    await expect(linkOfferProduct(o.id, p.id)).rejects.toThrow("gift-only");
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).sellerId).toBeNull();
    // Legacy linked products remain stored, but no longer appear or sell as clothing.
    await db.product.update({ where: { id: p.id }, data: { sellerId: brand.id } });
    const variant = await db.variant.create({ data: { productId: p.id, size: "M", available: 5 } });
    expect(await listProducts()).toEqual([]);
    expect(await suggestProducts("kaftan")).toEqual([]);
    expect(await getProduct(p.id)).toBeNull();
    expect(await stockToReceive()).toEqual([]);
    const buyer = await makeUser();
    const cart = await createCart(buyer.id, {});
    await expect(setLine(buyer.id, cart.id, variant.id, 1)).rejects.toThrow("complimentary gifts");
  });
});
