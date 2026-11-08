import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { acceptMerge, requestMerge, createCart } from "@/server/carts/service";
import { db } from "@/server/db";
import { acceptSampleTransport, requestSample, updateSample } from "@/server/samples";
import { makeUser, resetDb } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
async function fixture() {
  const [owner, other, warehouse, premium] = await Promise.all([
    makeUser(),
    makeUser(),
    makeUser("ADMIN"),
    makeUser("ADMIN"),
  ]);
  await db.user.update({ where: { id: warehouse.id }, data: { adminArea: "AGENTS" } });
  await db.user.update({ where: { id: premium.id }, data: { adminArea: "PREMIUM" } });
  const product = await db.product.create({
    data: {
      title: "Patterned linen shirt",
      brand: "Test",
      category: "APPAREL",
      stockType: "FACTORY_SURPLUS",
      price: "1200",
      variants: { create: { size: "M", available: 5 } },
    },
  });
  const cart = await createCart(owner.id, {});
  return {
    owner,
    other,
    warehouse,
    premium,
    product,
    cart,
    input: { cartId: cart.id, productId: product.id, designNote: "Blue pattern, medium" },
  };
}
describe("pre-purchase group samples", () => {
  it("requires accepted group transport before dispatch, retains snapshots and no sample charge", async () => {
    const f = await fixture();
    const sample = await requestSample(f.owner.id, f.input);
    await expect(
      updateSample(f.warehouse.id, {
        id: sample.id,
        status: "DISPATCHED",
        courier: "Manual",
        tracking: "S1",
      }),
    ).rejects.toThrow("another stage");
    await updateSample(f.warehouse.id, { id: sample.id, status: "QUOTED", transportFee: "450.25" });
    await expect(acceptSampleTransport(f.other.id, sample.id, "450.25")).rejects.toThrow(
      "not your group",
    );
    await expect(acceptSampleTransport(f.owner.id, sample.id, "400")).rejects.toThrow(
      "no longer available",
    );
    await acceptSampleTransport(f.owner.id, sample.id, "450.25");
    await db.user.update({ where: { id: f.owner.id }, data: { address: "Changed address" } });
    await updateSample(f.warehouse.id, {
      id: sample.id,
      status: "DISPATCHED",
      courier: "Manual",
      tracking: "S1",
    });
    const delivered = await updateSample(f.warehouse.id, { id: sample.id, status: "DELIVERED" });
    expect(delivered.address).toBe("1 Test Rd");
    expect(delivered.transportFee?.toString()).toBe("450.25");
    expect(delivered).not.toHaveProperty("sampleFee");
    expect(
      (await db.groupCart.findUniqueOrThrow({ where: { id: f.cart.id } })).total.toString(),
    ).toBe("0");
    expect(
      (await db.variant.findFirstOrThrow({ where: { productId: f.product.id } })).available,
    ).toBe(5);
  });
  it("denies other owners and premium admins, rejects after checkout and notifies relevant admins only", async () => {
    const f = await fixture();
    await expect(requestSample(f.other.id, f.input)).rejects.toThrow("group owner");
    const sample = await requestSample(f.owner.id, f.input);
    await expect(
      updateSample(f.premium.id, { id: sample.id, status: "QUOTED", transportFee: "450" }),
    ).rejects.toThrow("unavailable");
    expect(await db.notification.count({ where: { userId: f.premium.id } })).toBe(0);
    expect(
      await db.notification.count({
        where: { userId: f.warehouse.id, title: "Design sample requested" },
      }),
    ).toBe(1);
    await db.groupCart.update({ where: { id: f.cart.id }, data: { status: "AWAITING_SLIP" } });
    await expect(requestSample(f.owner.id, f.input)).rejects.toThrow("before accepting");
  });
  it("preserves sample tracking and its delivery snapshot when the source group merges", async () => {
    const f = await fixture();
    const sample = await requestSample(f.owner.id, f.input);
    await updateSample(f.warehouse.id, { id: sample.id, status: "QUOTED", transportFee: "450.25" });
    await db.user.update({
      where: { id: f.other.id },
      data: { address: "Different target owner address" },
    });
    const target = await createCart(f.other.id, {});
    const merge = await requestMerge(f.owner.id, target.id);
    await acceptMerge(f.other.id, merge.id);
    expect(await db.groupCart.findUnique({ where: { id: f.cart.id } })).toBeNull();
    const moved = await db.sampleRequest.findUniqueOrThrow({ where: { id: sample.id } });
    expect(moved.cartId).toBe(target.id);
    expect(moved.address).toBe("1 Test Rd");
    expect(moved.requesterId).toBe(f.owner.id);
    await acceptSampleTransport(f.owner.id, sample.id, "450.25");
  });
  it("serializes duplicate concurrent sample requests and quote acceptance", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      requestSample(f.owner.id, f.input),
      requestSample(f.owner.id, f.input),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const sample = await db.sampleRequest.findFirstOrThrow();
    await updateSample(f.warehouse.id, { id: sample.id, status: "QUOTED", transportFee: "0" });
    const accepts = await Promise.allSettled([
      acceptSampleTransport(f.owner.id, sample.id, "0"),
      acceptSampleTransport(f.owner.id, sample.id, "0"),
    ]);
    expect(accepts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});
