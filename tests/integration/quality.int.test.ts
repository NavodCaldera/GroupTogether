import { saveProduct } from "@/server/catalogue";
import { addStaff, setStaffLocked } from "@/server/factory-team";
import { rateProduct } from "@/server/ratings";
import { afterAll, beforeEach, describe, it, expect } from "vitest";
import { db } from "@/server/db";
import { hideProduct, removeFactory, qualityOverview } from "@/server/quality";
import { getProduct, listProducts, suggestProducts, shopFacets } from "@/server/catalogue";
import { authenticate, startSession, userForToken } from "@/server/auth/service";
import { hashPassword } from "@/server/auth/password";
import { makeReceivedOrder, makeUser, makeVariant, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());
async function fixture() {
  const admin = await makeUser("ADMIN", "FACTORY"),
    warehouse = await makeUser("ADMIN"),
    member = await makeUser();
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: { role: "SELLER" },
  });
  await db.factoryProfile.create({
    data: { factoryUserId: factory.id, complianceDueAt: new Date("2099-01-01") },
  });
  const a = await makeVariant("1500", 5),
    b = await makeVariant("1500", 5);
  for (const [v, title] of [
    [a, "Quality shirt"],
    [b, "Other shirt"],
  ] as const)
    await db.product.update({
      where: { id: v.productId },
      data: {
        sellerId: factory.id,
        title,
        category: "APPAREL",
        factoryPrice: "1400",
        commission: "100",
        kind: "men-shirts",
        audience: "MEN",
      },
    });
  return { admin, warehouse, member, factory, a, b };
}
describe("quality hide/remove", () => {
  it("hides a product from every shop path", async () => {
    const f = await fixture();
    await db.product.update({
      where: { id: f.a.productId },
      data: { brand: "Hidden-only brand" },
    });
    await hideProduct(f.admin.id, f.a.productId, "Poor stitching");
    expect(await getProduct(f.a.productId)).toBeNull();
    expect((await listProducts({})).some((p) => p.id === f.a.productId)).toBe(false);
    expect((await suggestProducts("Quality")).some((p) => p.id === f.a.productId)).toBe(false);
    expect((await shopFacets()).brands).not.toContain("Hidden-only brand");
    expect(await getProduct(f.b.productId)).not.toBeNull();
  });
  it("guards FACTORY/CORE quality queries and mutations", async () => {
    const f = await fixture();
    for (const actor of [f.member, f.factory, await makeUser("ADMIN", "PREMIUM"), f.warehouse]) {
      await expect(qualityOverview(actor.id)).rejects.toThrow();
      await expect(hideProduct(actor.id, f.a.productId, "Reason")).rejects.toThrow();
      await expect(removeFactory(actor.id, f.factory.id, "Reason", false)).rejects.toThrow();
    }
    expect(
      (await db.product.findUniqueOrThrow({ where: { id: f.a.productId } })).hiddenAt,
    ).toBeNull();
    await qualityOverview(f.admin.id);
    const core = await makeUser("ADMIN", "CORE");
    await qualityOverview(core.id);
    await hideProduct(core.id, f.a.productId, "Core decision");
  });
  it("removes factories, ends staff sessions, holds earnings and sends no factory notice", async () => {
    const f = await fixture();
    const staff = await db.user.create({
      data: {
        name: "Factory staff",
        email: "staff@test.lk",
        passwordHash: await hashPassword("password123"),
        role: "SELLER",
        factoryId: f.factory.id,
        factoryRole: "SALES",
      },
    });
    const sessions = [await startSession(f.factory.id), await startSession(staff.id)];
    await db.notification.deleteMany({ where: { userId: { in: [f.factory.id, staff.id] } } });
    await removeFactory(
      f.admin.id,
      f.factory.id,
      "Repeated quality failures",
      true,
      "Pending review",
    );
    await removeFactory(f.admin.id, f.factory.id, "Retry", true, "Pending review");
    expect(
      await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } }),
    ).toMatchObject({
      status: "REMOVED",
      removedById: f.admin.id,
      removalReason: "Repeated quality failures",
      earningsHeld: true,
      earningsHeldNote: "Pending review",
    });
    for (const session of sessions) expect(await userForToken(session.token)).toBeNull();
    await expect(authenticate(staff.email, "password123")).rejects.toThrow(/locked/);
    expect(await db.session.count({ where: { userId: { in: [f.factory.id, staff.id] } } })).toBe(0);
    expect(
      await db.notification.count({ where: { userId: { in: [f.factory.id, staff.id] } } }),
    ).toBe(0);
    expect(await db.product.count({ where: { sellerId: f.factory.id, hiddenAt: null } })).toBe(0);
  });
});

it("computes report flags on reads without automatic hiding or removal", async () => {
  const f = await fixture();
  for (let i = 0; i < 3; i++) {
    const o = await makeReceivedOrder({ factory: { factory: f.factory, variant: f.a } });
    await rateProduct(o.buyer.id, o.order.id, f.a.productId, 1, {
      reason: "SIZE",
      note: "Too small",
      photos: [],
    });
  }
  const overview = await qualityOverview(f.admin.id);
  expect(overview.products.find((p) => p.id === f.a.productId)?.flagged).toBe(true);
  expect(overview.factories.find((p) => p.id === f.factory.id)?.flagged).toBe(false);
  expect(
    (await db.product.findUniqueOrThrow({ where: { id: f.a.productId } })).hiddenAt,
  ).toBeNull();
  expect(
    (await db.factoryProfile.findUniqueOrThrow({ where: { factoryUserId: f.factory.id } })).status,
  ).toBe("ACTIVE");
});
it("keeps the first hide reason when hiding again", async () => {
  const f = await fixture();
  await db.product.update({
    where: { id: f.a.productId },
    data: { hiddenAt: new Date(), hiddenById: f.admin.id, hiddenReason: "Original reason" },
  });
  await hideProduct(f.admin.id, f.a.productId, "Retry reason");
  await hideProduct(f.admin.id, f.a.productId, "Retry again");
  expect((await db.product.findUniqueOrThrow({ where: { id: f.a.productId } })).hiddenReason).toBe(
    "Original reason",
  );
});
it("fences in-flight listings, staff creation and unlocks before removal locks all factory accounts", async () => {
  const f = await fixture();
  const staff = await db.user.create({
    data: {
      name: "Locked staff",
      email: "locked@test.lk",
      role: "SELLER",
      factoryId: f.factory.id,
      factoryRole: "SALES",
      passwordHash: "x",
      locked: true,
    },
  });
  const results = await Promise.allSettled([
    saveProduct(
      null,
      {
        title: "Concurrent shirt",
        brand: "Factory",
        audience: "MEN",
        kind: "men-shirts",
        price: "1400",
      },
      null,
      { sellerId: f.factory.id },
    ),
    addStaff(f.factory.id, {
      name: "New staff",
      email: "new-staff@test.lk",
      phone: "",
      role: "SALES",
      password: "password123",
    }),
    setStaffLocked(f.factory.id, staff.id, false, f.factory.id),
    removeFactory(f.admin.id, f.factory.id, "Quality removal", false),
  ]);
  expect(results[3].status).toBe("fulfilled");
  expect(await db.user.count({ where: { factoryId: f.factory.id, locked: false } })).toBe(0);
  expect(await db.product.count({ where: { sellerId: f.factory.id, hiddenAt: null } })).toBe(0);
});
