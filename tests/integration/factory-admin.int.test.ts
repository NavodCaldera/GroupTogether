import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adjustStock, saveProduct } from "@/server/catalogue";
import { resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

describe("factory admin stakeholder routing", () => {
  it("refuses factory stock and product edits against historical brand-linked products", async () => {
    const brand = await db.user.create({
      data: {
        name: "Brand contact",
        email: "brand-factory-denial@example.com",
        phone: "0769999998",
        role: "SELLER",
        isBrand: true,
        passwordHash: "x",
      },
    });
    const product = await db.product.create({
      data: {
        title: "Historical brand gift",
        brand: "Premium",
        sellerId: brand.id,
        category: "APPAREL",
        stockType: "FACTORY_SURPLUS",
        price: "1500",
      },
    });
    await expect(adjustStock(product.id, "M", "", 1)).rejects.toThrow("Brand rewards");
    await expect(saveProduct(product.id, {}, null)).rejects.toThrow("Brand rewards");
    expect(await db.variant.count({ where: { productId: product.id } })).toBe(0);
  });
});
