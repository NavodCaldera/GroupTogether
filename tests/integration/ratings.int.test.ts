import { afterAll, beforeEach, describe, it, expect, vi } from "vitest";
const principal = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => principal.user }));
import { db } from "@/server/db";
import { rateProduct, ratingSummaries } from "@/server/ratings";
import { GET } from "@/app/api/report-photos/[id]/route";
import { createCart, setLine, joinCart } from "@/server/carts/service";
import { makeUser, makeVariant, resetDb, giftPhotoFile } from "./helpers";
beforeEach(async () => {
  await resetDb();
  principal.user = null;
});
afterAll(() => db.$disconnect());
async function fixture() {
  const user = await makeUser(),
    other = await makeUser(),
    factory = await db.user.update({
      where: { id: (await makeUser()).id },
      data: { role: "SELLER" },
    });
  const v = await makeVariant("1500", 5);
  const cart = await createCart(user.id, {});
  await setLine(user.id, cart.id, v.id, 1);
  await joinCart(other.id, cart.id);
  await db.product.update({
    where: { id: v.productId },
    data: { sellerId: factory.id, category: "APPAREL", title: "Delivered shirt" },
  });
  await db.groupCart.update({ where: { id: cart.id }, data: { status: "DELIVERED" } });
  return { user, other, factory, v, cart };
}
describe("product ratings", () => {
  it("requires actual receipt, valid stars and required report/photo", async () => {
    const f = await fixture();
    await expect(rateProduct(f.other.id, f.cart.id, f.v.productId, 5)).rejects.toThrow();
    await expect(rateProduct(f.user.id, f.cart.id, f.v.productId, 2)).rejects.toThrow(/report/i);
    await expect(
      rateProduct(f.user.id, f.cart.id, f.v.productId, 2, {
        reason: "STITCHING",
        note: "Loose seam",
        photos: [],
      }),
    ).rejects.toThrow(/photo/i);
    for (const stars of [0, 6, 1.5])
      await expect(rateProduct(f.user.id, f.cart.id, f.v.productId, stars)).rejects.toThrow();
    await rateProduct(f.user.id, f.cart.id, f.v.productId, 2, {
      reason: "STITCHING",
      note: "Loose seam",
      photos: [giftPhotoFile()],
    });
    expect(await db.productRating.count()).toBe(1);
    expect(await db.qualityReport.count()).toBe(1);
    expect(await db.reportPhoto.count()).toBe(1);
    await expect(rateProduct(f.user.id, f.cart.id, f.v.productId, 5)).rejects.toThrow(/already/i);
  });
  it("deduplicates concurrent submissions and accepts returned receipt while refusing cancelled lines", async () => {
    const f = await fixture();
    await db.cartLine.updateMany({ where: { cartId: f.cart.id }, data: { status: "RETURNED" } });
    const results = await Promise.allSettled([
      rateProduct(f.user.id, f.cart.id, f.v.productId, 5),
      rateProduct(f.user.id, f.cart.id, f.v.productId, 4),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await db.productRating.deleteMany();
    await db.cartLine.updateMany({ where: { cartId: f.cart.id }, data: { status: "CANCELLED" } });
    await expect(rateProduct(f.user.id, f.cart.id, f.v.productId, 5)).rejects.toThrow();
  });
  it("combines legacy factory and product stars one-for-one", async () => {
    const f = await fixture();
    await rateProduct(f.user.id, f.cart.id, f.v.productId, 5);
    await db.factoryRating.create({
      data: { cartId: f.cart.id, userId: f.user.id, factoryId: f.factory.id, stars: 1 },
    });
    const score = (await ratingSummaries([f.factory.id])).get(f.factory.id)!;
    expect(score).toEqual({ average: 3, count: 2 });
  });
  it("keeps report photos private to the rater and FACTORY/CORE admins", async () => {
    const f = await fixture();
    await rateProduct(f.user.id, f.cart.id, f.v.productId, 1, {
      reason: "DAMAGED",
      note: "Torn",
      photos: [giftPhotoFile()],
    });
    const photo = await db.reportPhoto.findFirstOrThrow();
    const get = () =>
      GET(new Request("http://localhost/api/report-photos/" + photo.id), {
        params: Promise.resolve({ id: photo.id }),
      });
    expect((await get()).status).toBe(404);
    for (const actor of [
      f.other,
      f.factory,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN", "WAREHOUSE"),
    ]) {
      principal.user = actor;
      expect((await get()).status).toBe(404);
    }
    for (const actor of [
      f.user,
      await makeUser("ADMIN", "FACTORY"),
      await makeUser("ADMIN", "CORE"),
    ]) {
      principal.user = actor;
      const response = await get();
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
  });
});
