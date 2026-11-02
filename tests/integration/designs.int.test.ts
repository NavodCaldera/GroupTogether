import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeller } from "@/server/auth/service";
import { sweep } from "@/server/carts/service";
import { adjustStock, saveProduct } from "@/server/catalogue";
import { db } from "@/server/db";
import { designInsight, linkOfferProduct, sellerDesigns } from "@/server/designs";
import { saveLot } from "@/server/lots";
import { createOffer, decideOffer } from "@/server/offers";
import { colomboIsoDay } from "@/lib/format";
import { makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

const DAY = 86_400_000;
let n = 0;

function seller() {
  n++;
  return createSeller({
    name: "Nuwan",
    company: `Mill ${n}`,
    email: `designs${n}-${Date.now()}@test.lk`,
    phone: `075${String(1000000 + n).slice(-7)}`,
    password: "password123",
  });
}

const shirt = (price = "2400") => ({
  title: "Linen shirt",
  brand: "Ceylon",
  audience: "MEN",
  kind: "men-shirts",
  price,
});

const prices = async (productId: string) =>
  (await db.priceChange.findMany({ where: { productId }, orderBy: { at: "asc" } })).map((p) =>
    p.price.toString(),
  );

/** An accepted offer of `kind` from `sellerId`. */
async function accepted(sellerId: string, kind: "TEST" | "BULK", productId?: string) {
  const o = await createOffer(sellerId, {
    name: "Linen shirts",
    description: "Short sleeve, S to XL",
    amount: "36000",
    kind,
    productId,
  });
  await decideOffer(o.id, true, "");
  return o;
}

/** A cart in `status` holding lines of `variantId`: [buyer, qty, unitPrice, daysAgo]. */
async function cartWith(
  status: "OPEN" | "EXPIRED" | "CONFIRMED" | "DELIVERED",
  variantId: string,
  lines: [string, number, string, number][],
) {
  const owner = lines[0][0];
  return db.groupCart.create({
    data: {
      code: `C${++n}${Date.now()}`.slice(0, 12),
      ownerId: owner,
      status,
      minOrderValue: 50000,
      expiresAt: new Date(Date.now() + DAY),
      members: { create: [...new Set(lines.map((l) => l[0]))].map((userId) => ({ userId })) },
      lines: {
        create: lines.map(([userId, qty, unitPrice, daysAgo]) => ({
          userId,
          variantId,
          qty,
          unitPrice,
          createdAt: new Date(Date.now() - daysAgo * DAY),
        })),
      },
    },
  });
}

describe("price history", () => {
  it("records a product's price when it is created and each time it changes", async () => {
    const p = await saveProduct(null, shirt(), null);
    expect(await prices(p.id)).toEqual(["2400"]);
    await saveProduct(p.id, shirt(), null);
    expect(await prices(p.id)).toEqual(["2400"]);
    await saveProduct(p.id, shirt("2150"), null);
    expect(await prices(p.id)).toEqual(["2400", "2150"]);
  });

  it("records a lot's price drop from the sweep", async () => {
    vi.stubEnv("FULFILMENT_MODE", "WAREHOUSE");
    const lot = await saveLot(null, {
      name: "Ekala linen",
      pieces: "100",
      bulkCost: "100000",
      transportCost: "0",
      wages: "0",
      receivedOn: colomboIsoDay(),
    });
    const p = await saveProduct(null, { ...shirt(), lotId: lot.id }, null);
    expect(await prices(p.id)).toEqual(["1200"]);
    await sweep(new Date(lot.reduceAt.getTime() + 60_000));
    expect(await prices(p.id)).toEqual(["1200", "1100"]);
  });
});

describe("offers and designs", () => {
  it("links an accepted offer to a product, which becomes the seller's design", async () => {
    const s = await seller();
    const p = await saveProduct(null, shirt(), null);
    const o = await createOffer(s.id, {
      name: "Linen shirts",
      description: "24 pieces",
      amount: "36000",
      kind: "TEST",
    });
    await expect(linkOfferProduct(o.id, p.id)).rejects.toThrow("Accept the offer first");
    await decideOffer(o.id, true, "");
    await linkOfferProduct(o.id, p.id);

    expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).sellerId).toBe(s.id);
    expect((await db.stockOffer.findUniqueOrThrow({ where: { id: o.id } })).productId).toBe(p.id);
    expect(
      await db.notification.count({
        where: { userId: s.id, title: "Your design is in our shop" },
      }),
    ).toBe(1);

    // Another factory's offer can't take this product.
    const other = await accepted((await seller()).id, "BULK");
    await expect(linkOfferProduct(other.id, p.id)).rejects.toThrow("another factory");
  });

  it("lets a bulk offer name only the seller's own design, and never test pieces", async () => {
    const [a, b] = [await seller(), await seller()];
    const p = await saveProduct(null, shirt(), null);
    await linkOfferProduct((await accepted(a.id, "TEST")).id, p.id);

    const base = { name: "Linen bulk", description: "240 pieces", amount: "300000" };
    const bulk = await createOffer(a.id, { ...base, kind: "BULK", productId: p.id });
    expect(bulk).toMatchObject({ kind: "BULK", productId: p.id });
    await expect(createOffer(b.id, { ...base, kind: "BULK", productId: p.id })).rejects.toThrow(
      "Choose one of your designs",
    );
    await expect(createOffer(a.id, { ...base, kind: "TEST", productId: p.id })).rejects.toThrow(
      "Test pieces are for a new design",
    );
  });
});

describe("design insight", () => {
  it("counts pieces wanted and bought, people, prices and the test against the bulk", async () => {
    const s = await seller();
    const [b1, b2, b3] = [await makeUser(), await makeUser(), await makeUser()];
    const p = await saveProduct(null, shirt(), null);
    await adjustStock(p.id, "M", "", 30);
    const v = await db.variant.findFirstOrThrow({ where: { productId: p.id } });
    // The price stood at 2,400 from 10 days ago, then 2,150 from 4 days ago.
    await db.priceChange.updateMany({
      where: { productId: p.id },
      data: { at: new Date(Date.now() - 10 * DAY) },
    });
    await db.priceChange.create({
      data: { productId: p.id, price: "2150", at: new Date(Date.now() - 4 * DAY) },
    });
    await db.product.update({ where: { id: p.id }, data: { price: "2150" } });

    const test = await accepted(s.id, "TEST");
    await linkOfferProduct(test.id, p.id);
    await db.stockOffer.update({
      where: { id: test.id },
      data: { receivedAt: new Date(Date.now() - 10 * DAY) },
    });
    const bulk = await accepted(s.id, "BULK", p.id);
    await db.stockOffer.update({
      where: { id: bulk.id },
      data: { receivedAt: new Date(Date.now() - 4 * DAY) },
    });

    // Test: b1 and b2 bought 9 at 2,400; b3 wanted 3 in a cart that expired.
    await cartWith("DELIVERED", v.id, [
      [b1.id, 5, "2400", 8],
      [b2.id, 4, "2400", 8],
    ]);
    await cartWith("EXPIRED", v.id, [[b3.id, 3, "2400", 7]]);
    // Bulk: b1 bought 8 at 2,150; b2 has 2 in an open cart.
    await cartWith("CONFIRMED", v.id, [[b1.id, 8, "2150", 2]]);
    await cartWith("OPEN", v.id, [[b2.id, 2, "2150", 1]]);

    const d = await designInsight(s.id, p.id);
    expect(d).not.toBeNull();
    expect(d!.demand).toEqual({ wanted: 22, bought: 17, people: 2, wantedBy: 3 });
    expect(d!.test).toEqual({ wanted: 12, bought: 9, people: 2, wantedBy: 3 });
    expect(d!.bulk).toMatchObject({ wanted: 10, bought: 8, people: 1, wantedBy: 2 });
    expect(d!.bulkOffered).toBe(true);
    expect(
      d!.byPrice.map((r) => [r.price.toString(), r.wanted, r.bought, r.people, Math.round(r.days)]),
    ).toEqual([
      ["2150", 10, 8, 1, 4],
      ["2400", 12, 9, 2, 6],
    ]);
    expect(d!.chart).toHaveLength(11);
    expect(d!.chart.reduce((sum, day) => sum + day.wanted, 0)).toBe(22);

    // Another factory sees nothing of it.
    const other = await seller();
    expect(await designInsight(other.id, p.id)).toBeNull();
    expect(await sellerDesigns(other.id)).toEqual([]);
    const [mine] = await sellerDesigns(s.id);
    expect(mine).toMatchObject({ id: p.id, stage: "bulk", wanted: 22, bought: 17, people: 2 });
  });
});
