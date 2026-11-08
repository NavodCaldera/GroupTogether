import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adjustStock, saveProduct } from "@/server/catalogue";
import { createOffer } from "@/server/offers";
import { makeUser, resetDb } from "./helpers";

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
  it("routes factory review notices to unlocked factory admins only", async () => {
    const admins = await Promise.all(Array.from({ length: 5 }, () => makeUser("ADMIN")));
    const areas = ["FACTORY", "FACTORY", "PREMIUM", "AGENTS", "FACTORY"] as const;
    for (const [i, admin] of admins.entries()) {
      await db.user.update({
        where: { id: admin.id },
        data: { adminArea: areas[i], locked: i === 4 },
      });
    }
    const seller = await db.user.create({
      data: {
        name: "Factory contact",
        email: "factory-admin-test@example.com",
        phone: "0769999999",
        role: "SELLER",
        isBrand: false,
        company: "Apparel factory",
        passwordHash: "x",
      },
    });
    const offer = await createOffer(seller.id, {
      name: "Cotton shirt design",
      description: "Test pieces in three sizes",
      amount: "2500",
      kind: "TEST",
    });
    const notices = await db.notification.findMany({
      where: { title: "Stock offer to review" },
      select: { userId: true, href: true },
    });
    expect(notices.map((n) => n.userId).sort()).toEqual([admins[0].id, admins[1].id].sort());
    expect(notices.every((n) => n.href === `/admin/offers/${offer.id}`)).toBe(true);
  });
});
