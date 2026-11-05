import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import * as agreements from "@/server/agreements";
import {
  getProduct,
  listProducts,
  retailSaving,
  shopFacets,
  suggestProducts,
} from "@/server/catalogue";
import { makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterEach(() => vi.restoreAllMocks());
afterAll(() => db.$disconnect());

describe("independent public catalogue brand exclusion", () => {
  it("keeps brands out even when factory eligibility would match them", async () => {
    const owners = [];
    for (const isBrand of [false, true]) {
      const owner = await db.user.update({
        where: { id: (await makeUser()).id },
        data: { role: "SELLER", isBrand },
      });
      await db.factoryProfile.create({
        data: {
          factoryUserId: owner.id,
          status: "ACTIVE",
          complianceDueAt: new Date("2099-01-01"),
        },
      });
      owners.push(owner);
    }
    const products = [];
    for (let i = 0; i < 4; i++) {
      products.push(
        await db.product.create({
          data: {
            title: `Guard shirt ${i}`,
            brand: i === 0 ? "Ordinary" : "Premium",
            category: "APPAREL",
            audience: "MEN",
            kind: "men-shirts",
            stockType: "FACTORY_SURPLUS",
            status: "LIVE",
            price: "1000",
            retailPrice: "2000",
            sellerId: owners[i === 0 ? 0 : 1].id,
            variants: { create: { size: i === 0 ? "Ordinary-size" : "Brand-size", available: 5 } },
          },
        }),
      );
    }
    // Deliberately broaden the secondary guard: the base commercial boundary must stand alone.
    const eligibility = vi.spyOn(agreements, "sellingFactoryWhere").mockResolvedValue({
      role: "SELLER",
      locked: false,
      factoryProfile: { is: { status: "ACTIVE" } },
    });
    expect((await listProducts()).map((p) => p.id)).toEqual([products[0].id]);
    expect((await suggestProducts("Guard")).map((p) => p.id)).toEqual([products[0].id]);
    expect(await shopFacets()).toEqual({ brands: ["Ordinary"], sizes: ["Ordinary-size"] });
    expect(await getProduct(products[1].id)).toBeNull();
    expect(await retailSaving()).toBeNull();
    expect(eligibility).toHaveBeenCalled();
    // Direct links must still work for sold-out ordinary products.
    await db.variant.updateMany({ where: { productId: products[0].id }, data: { available: 0 } });
    expect(await getProduct(products[0].id)).toMatchObject({ id: products[0].id });
  });
});
