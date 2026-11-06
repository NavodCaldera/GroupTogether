import { afterAll, beforeEach, describe, it, expect } from "vitest";
import { db } from "@/server/db";
import { factoryDecide, adminDecide, fileReturn } from "@/server/returns";
import { recordFault, countedFaultUnits } from "@/server/fault-holds";
import { makeUser, makeVariant, resetDb, giftPhotoFile } from "./helpers";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
const now = new Date("2026-11-06T10:00:00Z");
async function fixture() {
  const factory = await db.user.update({
    where: { id: (await makeUser()).id },
    data: {
      role: "SELLER",
      factoryProfile: { create: { complianceDueAt: new Date("2099-01-01") } },
    },
  });
  const admin = await makeUser("ADMIN", "FACTORY"),
    buyer = await makeUser();
  const v = await makeVariant("1500", 40);
  await db.product.update({ where: { id: v.productId }, data: { sellerId: factory.id } });
  return { factory, admin, buyer, v };
}
async function request(
  f: Awaited<ReturnType<typeof fixture>>,
  qty = 1,
  fault: "FACTORY" | "BUYER" = "FACTORY",
) {
  const cart = await db.groupCart.create({
    data: {
      code: crypto.randomUUID().slice(0, 8),
      ownerId: f.buyer.id,
      status: "DELIVERED",
      total: "4500",
      minOrderValue: "1500",
      expiresAt: now,
      delivery: { create: { provider: "manual", status: "DELIVERED", deliveredAt: now } },
      lines: { create: { userId: f.buyer.id, variantId: f.v.id, qty, unitPrice: "1500" } },
    },
    include: { lines: true },
  });
  return fileReturn(
    f.buyer.id,
    cart.lines[0].id,
    {
      qty,
      fault,
      reason: "DAMAGED",
      note: "Seam",
      photos: fault === "FACTORY" ? [giftPhotoFile()] : [],
    },
    now,
  );
}
describe("factory faults", () => {
  it("factory accepts qty 3: one fault with 3 units and a hold", async () => {
    const f = await fixture(),
      r = await request(f, 3);
    await factoryDecide(f.factory.id, r.id, true, now);
    expect(await db.factoryFault.findMany()).toMatchObject([
      { units: 3, confirmedBy: "FACTORY", confirmedById: f.factory.id },
    ]);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
  });
  it("qty 1 then qty 1 opens a hold on the second", async () => {
    const f = await fixture();
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    expect(await db.faultHold.count()).toBe(0);
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    expect(await db.faultHold.count()).toBe(1);
  });
  it("buyer-fault accepts and rejections record no faults", async () => {
    const f = await fixture();
    await factoryDecide(f.factory.id, (await request(f, 1, "BUYER")).id, true, now);
    const r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    await adminDecide(f.admin.id, r.id, false, "No defect");
    expect(await db.factoryFault.count()).toBe(0);
  });
  it.each([false, true])("admin accepts factory fault, received=%s", async (received) => {
    const f = await fixture(),
      r = await request(f);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    if (received) await db.returnRequest.update({ where: { id: r.id }, data: { receivedAt: now } });
    await adminDecide(f.admin.id, r.id, true, "Confirmed");
    expect(await db.factoryFault.findUnique({ where: { returnId: r.id } })).toMatchObject({
      confirmedBy: "ADMIN",
      units: 1,
      confirmedById: f.admin.id,
    });
  });
  it("calendar window boundary and cancelled faults", async () => {
    const f = await fixture();
    for (const date of ["2026-06-05", "2027-06-05"]) {
      const r = await request(f);
      await db.$transaction((tx) => recordFault(tx, r, "FACTORY", f.factory.id, new Date(date)));
    }
    expect(await countedFaultUnits(db, f.factory.id, new Date("2027-06-06"))).toBe(1);
    await db.factoryFault.updateMany({
      data: { cancelledAt: now, cancelledById: f.admin.id, cancelNote: "Mistake" },
    });
    expect(await countedFaultUnits(db, f.factory.id, new Date("2027-06-06"))).toBe(0);
  });
  it("two faults eleven months apart open a hold; same return records once", async () => {
    const f = await fixture(),
      r = await request(f),
      s = await request(f);
    await db.$transaction((tx) =>
      recordFault(tx, r, "FACTORY", f.factory.id, new Date("2026-01-01")),
    );
    await db.$transaction((tx) =>
      recordFault(tx, s, "FACTORY", f.factory.id, new Date("2026-12-01")),
    );
    await db.$transaction((tx) =>
      recordFault(tx, s, "FACTORY", f.factory.id, new Date("2026-12-01")),
    );
    expect(await db.factoryFault.count()).toBe(2);
    expect(await db.faultHold.count()).toBe(1);
  });
  it("parallel accepts reaching 2 open one hold", async () => {
    const f = await fixture();
    await factoryDecide(f.factory.id, (await request(f)).id, true, now);
    const a = await request(f),
      b = await request(f);
    const results = await Promise.allSettled([
      factoryDecide(f.factory.id, a.id, true, now),
      factoryDecide(f.factory.id, b.id, true, now),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.faultHold.count({ where: { decidedAt: null } })).toBe(1);
    expect(await db.factoryFault.count()).toBe(3);
  });
  it("removed factory opens no hold", async () => {
    const f = await fixture(),
      r = await request(f, 3);
    await db.factoryProfile.update({
      where: { factoryUserId: f.factory.id },
      data: { status: "REMOVED" },
    });
    await db.returnRequest.update({ where: { id: r.id }, data: { status: "WITH_ADMIN" } });
    await adminDecide(f.admin.id, r.id, true, "Confirmed");
    expect(await db.factoryFault.count()).toBe(1);
    expect(await db.faultHold.count()).toBe(0);
  });
  it("hold notices go only to owners and FACTORY/CORE", async () => {
    const f = await fixture(),
      core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM"),
      warehouse = await makeUser("ADMIN");
    const staff = [];
    for (const role of ["OWNER", "SALES", "PACKING"] as const)
      staff.push(
        await db.user.update({
          where: { id: (await makeUser()).id },
          data: { role: "SELLER", factoryId: f.factory.id, factoryRole: role },
        }),
      );
    await factoryDecide(f.factory.id, (await request(f, 2)).id, true, now);
    for (const id of [f.factory.id, staff[0].id])
      expect(
        await db.notification.count({ where: { userId: id, title: "Your shop is on hold" } }),
      ).toBe(1);
    for (const id of [core.id, f.admin.id])
      expect(await db.notification.count({ where: { userId: id, title: "Factory on hold" } })).toBe(
        1,
      );
    for (const id of [premium.id, warehouse.id, staff[1].id, staff[2].id])
      expect(
        await db.notification.count({
          where: { userId: id, title: { in: ["Your shop is on hold", "Factory on hold"] } },
        }),
      ).toBe(0);
  });
});
