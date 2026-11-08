import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { IN_SHOP, adjustStock, saveProduct } from "@/server/catalogue";
import { factoryInsights, factoryProducts } from "@/server/factory-dashboard";
import { rateProduct, ratingSummaries } from "@/server/ratings";
import { makeReceivedOrder, makeUser, makeVariant, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

/** A factory seller with one product of `available` pieces. */
async function factoryVariant(available = 10) {
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    // Existing-factory fixture explicitly represents the migration's 30-day grace.
    data: {
      role: "SELLER",
      company: "Lanka Knits",
      address: "5 Mill Rd",
      city: "Kandy",
      factoryProfile: { create: { complianceDueAt: new Date(Date.now() + 30 * 86400000) } },
    },
  });
  const v = await makeVariant("25000", available);
  await db.product.update({ where: { id: v.productId }, data: { sellerId: factory.id } });
  return { factory, v };
}

describe("factory-direct fulfilment", () => {
  it("factories publish their own listings straight to the shop; admins can hide them", async () => {
    const { factory } = await factoryVariant();
    const other = await factoryVariant();
    const listing = {
      title: "Linen shirt",
      brand: "Lanka Knits",
      audience: "MEN",
      kind: "men-shirts",
      price: "3200",
    };
    const p = await saveProduct(null, listing, null, { sellerId: factory.id });
    expect(p).toMatchObject({ sellerId: factory.id, status: "LIVE" });
    await expect(saveProduct(p.id, listing, null, { sellerId: other.factory.id })).rejects.toThrow(
      "not found",
    );
    await expect(adjustStock(p.id, "M", "", 5, { sellerId: other.factory.id })).rejects.toThrow(
      "not found",
    );
    await adjustStock(p.id, "M", "", 5, { sellerId: factory.id });
    const inShop = () => db.product.count({ where: { id: p.id, ...IN_SHOP } });
    expect(await inShop()).toBe(1);
    await db.product.update({ where: { id: p.id }, data: { status: "ARCHIVED" } });
    expect(await inShop()).toBe(0);
  });

  it("paid orders count in product figures and insights; buyer carts are demand, not sales", async () => {
    const { factory, v } = await factoryVariant();
    const o = await makeReceivedOrder({ factory: { factory, variant: v } });
    await rateProduct(o.buyer.id, o.order.id, v.productId, 5);
    expect((await ratingSummaries([factory.id])).get(factory.id)).toEqual({ average: 5, count: 1 });

    // Held for an unpaid order, and wanted in a buyer's cart: never a sale.
    await db.variant.update({ where: { id: v.id }, data: { available: 5, reserved: 3 } });
    const other = await makeUser();
    await db.cartItem.create({ data: { buyerId: other.id, variantId: v.id, qty: 2 } });

    const [product] = await factoryProducts(factory.id);
    expect(product).toMatchObject({ pieces: 1, bestSize: "M" });
    expect(product.value.toString()).toBe("1000");
    expect(product.variants[0]).toMatchObject({
      available: 5,
      reserved: 3,
      soldPaid: 1,
      removable: false,
    });
    const insights = await factoryInsights(factory.id);
    // One rating: the count shows, the average is held back until there are five.
    expect(insights.rating).toMatchObject({ count: 1, average: null });
    expect(insights.demand).toEqual([{ product: product.title, buyers: 1, pieces: 2 }]);
    expect(insights.priceBands).toHaveLength(1);
    // One city with one order: suppressed.
    expect(insights.cities).toEqual([]);
  });
});
