import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { getBasket, openBaskets } from "@/server/packs";
import { confirmPackSpot, joinBasket, releasePackSpot, startBasket } from "@/server/packs-join";
import { sweepPackGroups } from "@/server/packs-sweep";
import { makeBuyer, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", "1200000");
  vi.stubEnv("DEMO_MERCHANT_SECRET", "test-secret");
});
afterAll(() => db.$disconnect());

const HOME = { lat: 6.9, lng: 79.86 };
let n = 0;

async function pack(groupSize = 5, price = "150.00") {
  n++;
  const category = await db.category.create({ data: { slug: `pc-${n}`, name: "Personal Care", path: "/" } });
  const company = await db.company.create({ data: { slug: `co-${n}`, name: `Co ${n}`, categoryId: category.id } });
  const p = await db.standardPack.create({
    data: { slug: `pk-${n}`, name: "30-day Pack", durationDays: 30, companyId: company.id },
  });
  return db.packVersion.create({
    data: {
      packId: p.id,
      version: 1,
      publishedAt: new Date(),
      pricePerFamily: price,
      groupSize,
      commissionPct: "10.00",
      items: { create: [{ name: "Soap", size: "100 g", qty: 2 }] },
    },
  });
}

/** A buyer with an address pin `metres` north of HOME. */
async function buyerAt(metres = 0) {
  const b = await makeBuyer({ lat: HOME.lat + metres / 111_000, lng: HOME.lng });
  return db.user.update({ where: { id: b.id }, data: { address: "1 Main St", city: "Colombo" } });
}

const attemptOf = (userId: string) =>
  db.paymentAttempt.findFirstOrThrow({ where: { buyerId: userId, purpose: "PACK_JOIN" }, orderBy: { createdAt: "desc" } });
const pay = async (userId: string) => {
  const a = await attemptOf(userId);
  return db.$transaction((tx) => confirmPackSpot(tx, a.id));
};
const group = (versionId: string) => db.packGroup.findFirstOrThrow({ where: { versionId } });

/** An OPEN basket owned by a paid starter, plus `others` paid members. */
async function openBasket(versionId: string, others = 0) {
  const owner = await buyerAt();
  await startBasket(owner.id, versionId);
  await pay(owner.id);
  const g = await group(versionId);
  for (let i = 0; i < others; i++) {
    const b = await buyerAt(10 * (i + 1));
    await joinBasket(b.id, g.id);
    await pay(b.id);
  }
  return { owner, groupId: g.id };
}

describe("family-pack baskets (DEC-030)", () => {
  it("keeps a started basket hidden until the owner has paid", async () => {
    const v = await pack();
    const owner = await buyerAt();
    const viewer = await buyerAt(100);
    await startBasket(owner.id, v.id);
    const g = await group(v.id);
    expect(g.status).toBe("PENDING");
    expect(await openBaskets(viewer)).toEqual([]);
    expect(await getBasket(g.id, viewer)).toBeNull();
    await pay(owner.id);
    expect((await group(v.id)).status).toBe("OPEN");
    expect(await openBaskets(viewer)).toEqual([expect.objectContaining({ id: g.id, joined: 1, size: 5 })]);
  });

  it("drops the basket when the owner's payment fails", async () => {
    const v = await pack();
    const owner = await buyerAt();
    await startBasket(owner.id, v.id);
    const a = await attemptOf(owner.id);
    await db.$transaction((tx) => releasePackSpot(tx, a.id));
    expect(await db.packGroup.count()).toBe(0);
  });

  it("lists only baskets within 1 km, contacts first then closest", async () => {
    const v = await pack(10);
    const near = await openBasket(v.id);
    const viewer = await buyerAt(400);
    // A second basket by a contact, farther away but still within 1 km.
    const friend = await makeBuyer({ lat: HOME.lat + 900 / 111_000, lng: HOME.lng });
    await db.user.update({ where: { id: friend.id }, data: { address: "2 Main St", phone: "0771234567" } });
    await startBasket(friend.id, v.id);
    await pay(friend.id);
    const far = await buyerAt(3000);
    const list = await openBaskets(viewer);
    expect(list?.map((b) => b.fromContact)).toEqual([false, false]);
    await db.userContact.create({ data: { userId: viewer.id, phone: "0771234567" } });
    const ranked = await openBaskets(viewer);
    expect(ranked?.[0]).toMatchObject({ fromContact: true });
    expect(ranked?.[1]).toMatchObject({ id: near.groupId });
    expect(await openBaskets(far)).toEqual([]);
    await expect(joinBasket(far.id, near.groupId)).rejects.toThrow(/1 km/);
  });

  it("refuses a second spot in the same basket", async () => {
    const v = await pack();
    const { owner, groupId } = await openBasket(v.id);
    await expect(joinBasket(owner.id, groupId)).rejects.toThrow(/already/);
  });

  it("needs an address pin", async () => {
    const v = await pack();
    const b = await makeBuyer();
    await db.user.update({ where: { id: b.id }, data: { lat: null, lng: null } });
    await expect(startBasket(b.id, v.id)).rejects.toThrow(/address/);
  });

  it("frees a held spot when its payment fails", async () => {
    const v = await pack();
    const { groupId } = await openBasket(v.id);
    const b = await buyerAt(20);
    await joinBasket(b.id, groupId);
    expect((await group(v.id)).joined).toBe(2);
    await db.$transaction(async (tx) => releasePackSpot(tx, (await attemptOf(b.id)).id));
    expect((await group(v.id)).joined).toBe(1);
  });

  it("gives the last spot to exactly one of two buyers", async () => {
    const v = await pack(5);
    const { groupId } = await openBasket(v.id, 3);
    const [x, y] = [await buyerAt(50), await buyerAt(60)];
    const r = await Promise.allSettled([joinBasket(x.id, groupId), joinBasket(y.id, groupId)]);
    expect(r.filter((s) => s.status === "fulfilled")).toHaveLength(1);
    expect((await group(v.id)).joined).toBe(5);
  });

  it("fills on the last payment and places the order with the company", async () => {
    const v = await pack(5, "150.00");
    const { groupId } = await openBasket(v.id, 4);
    const g = await db.packGroup.findUniqueOrThrow({ where: { id: groupId }, include: { delivery: true } });
    expect(g.status).toBe("FULL");
    // (150 − 15 commission) × 5 families
    expect(g.delivery).toMatchObject({ families: 5, status: "ORDERED" });
    expect(g.delivery?.amountDue.toFixed(2)).toBe("675.00");
    await expect(joinBasket((await buyerAt(5)).id, groupId)).rejects.toThrow(/no longer/);
  });

  it("extends an unfilled basket twice, then closes it and refunds paid spots as tokens", async () => {
    const v = await pack(5, "150.00");
    const { owner, groupId } = await openBasket(v.id, 1);
    const later = (days: number) => new Date(Date.now() + days * 86_400_000);
    await sweepPackGroups(later(31));
    await sweepPackGroups(later(61));
    expect(await db.packGroup.findUniqueOrThrow({ where: { id: groupId } })).toMatchObject({ status: "OPEN", extensions: 2 });
    await sweepPackGroups(later(91));
    await sweepPackGroups(later(92));
    expect((await db.packGroup.findUniqueOrThrow({ where: { id: groupId } })).status).toBe("CLOSED");
    const refunds = await db.tokenEntry.findMany({ where: { kind: "PACK_REFUND" } });
    expect(refunds).toHaveLength(2);
    expect(refunds.find((r) => r.userId === owner.id)?.amount.toFixed(2)).toBe("150.00");
  });

  it("frees a spot whose payment window ran out", async () => {
    const v = await pack();
    const { groupId } = await openBasket(v.id);
    const b = await buyerAt(20);
    await joinBasket(b.id, groupId);
    await sweepPackGroups(new Date(Date.now() + 24 * 3_600_000));
    expect((await group(v.id)).joined).toBe(1);
    expect((await attemptOf(b.id)).status).toBe("EXPIRED");
  });
});
