import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createSeller } from "@/server/auth/service";
import { createBrandOffer } from "@/server/brands";
import { saveProduct } from "@/server/catalogue";
import { db } from "@/server/db";
import { linkOfferProduct } from "@/server/designs";
import { decideOffer } from "@/server/offers";
import { makeUser, resetDb } from "./helpers";

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
    expect(brand).toMatchObject({ role: "SELLER", isBrand: true, website: SITE });
    expect(await account(false)).toMatchObject({ isBrand: false, website: null });
  });
});

describe("brand products", () => {
  it("publish with the actual price, discount price, pieces and link; admins are told", async () => {
    const [brand, admin] = [await account(true, SITE), await makeUser("ADMIN")];
    const o = await createBrandOffer(brand.id, kaftan);
    expect(o.actualPrice?.toString()).toBe("18500");
    expect(o.offerPrice?.toString()).toBe("9800");
    expect(o.pieces).toBe(40);
    expect(o.amount.toString()).toBe("392000");
    expect(o.status).toBe("IN_REVIEW");
    expect(
      await db.notification.count({
        where: { userId: admin.id, title: "Brand product to review" },
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

  it("go into the shop with the actual price and the link to the brand's page", async () => {
    const brand = await account(true, SITE);
    const o = await createBrandOffer(brand.id, kaftan);
    await decideOffer(o.id, true, "");

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
    await linkOfferProduct(o.id, p.id);
    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).sellerId).toBe(brand.id);
  });
});
