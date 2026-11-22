import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { joinGroup, nearbyGroups, setPickupPoint, startGroup } from "@/server/packs";
import { makeAgent, makeBuyer, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

let n = 0;
async function pack(groupSize = 10) {
  n++;
  const category = await db.category.create({ data: { slug: `pc-${n}`, name: "Personal Care", path: "/" } });
  const company = await db.company.create({ data: { slug: `co-${n}`, name: "Co", categoryId: category.id } });
  const p = await db.standardPack.create({
    data: { slug: `pk-${n}`, name: "Pack", durationDays: 30, companyId: company.id },
  });
  return db.packVersion.create({
    data: {
      packId: p.id,
      version: 1,
      publishedAt: new Date(),
      pricePerFamily: "1000.00",
      groupSize,
      items: { create: [{ name: "Soap", size: "100 g", qty: 2 }] },
    },
  });
}

async function buyerAt(agentId: string) {
  const b = await makeBuyer();
  await setPickupPoint(b.id, agentId);
  return b;
}

describe("family-pack groups", () => {
  it("starts a group, joins it and matches only the exact pack and pickup point", async () => {
    const { agent: a1 } = await makeAgent();
    const { agent: a2 } = await makeAgent({ lat: 7.29, lng: 80.63 });
    const v30 = await pack();
    const v15 = await pack();
    const first = await buyerAt(a1.id);
    const { groupId } = await startGroup(first.id, v30.id);
    await joinGroup((await buyerAt(a1.id)).id, groupId);

    const here = await nearbyGroups(v30.id, a1.id);
    expect(here).toEqual([expect.objectContaining({ id: groupId, joined: 2, size: 10, spotsLeft: 8 })]);
    expect(Object.keys(here[0])).not.toContain("members");
    expect(await nearbyGroups(v15.id, a1.id)).toEqual([]);
    expect(await nearbyGroups(v30.id, a2.id)).toEqual([]);
  });

  it("needs a pickup point to start a group", async () => {
    const v = await pack();
    const b = await makeBuyer();
    await expect(startGroup(b.id, v.id)).rejects.toThrow(/pickup point/);
  });

  it("rejects a duplicate join", async () => {
    const { agent: a } = await makeAgent();
    const v = await pack();
    const b = await buyerAt(a.id);
    const { groupId } = await startGroup(b.id, v.id);
    await expect(joinGroup(b.id, groupId)).rejects.toThrow(/already/);
    expect((await db.packGroup.findUniqueOrThrow({ where: { id: groupId } })).joined).toBe(1);
  });

  it("fills on the last spot and then rejects joins", async () => {
    const { agent: a } = await makeAgent();
    const v = await pack(5);
    const { groupId } = await startGroup((await buyerAt(a.id)).id, v.id);
    for (let i = 0; i < 4; i++) await joinGroup((await buyerAt(a.id)).id, groupId);
    expect((await db.packGroup.findUniqueOrThrow({ where: { id: groupId } })).status).toBe("FULL");
    await expect(joinGroup((await buyerAt(a.id)).id, groupId)).rejects.toThrow(/no longer/);
    expect(await nearbyGroups(v.id, a.id)).toEqual([]);
  });

  it("rejects joins to a closed group", async () => {
    const { agent: a } = await makeAgent();
    const v = await pack();
    const { groupId } = await startGroup((await buyerAt(a.id)).id, v.id);
    await db.packGroup.update({ where: { id: groupId }, data: { status: "CLOSED" } });
    await expect(joinGroup((await buyerAt(a.id)).id, groupId)).rejects.toThrow(/no longer/);
  });

  it("gives the last spot to exactly one of two buyers racing for it", async () => {
    const { agent: a } = await makeAgent();
    const v = await pack(5);
    const { groupId } = await startGroup((await buyerAt(a.id)).id, v.id);
    for (let i = 0; i < 3; i++) await joinGroup((await buyerAt(a.id)).id, groupId);
    const [x, y] = [await buyerAt(a.id), await buyerAt(a.id)];
    const results = await Promise.allSettled([joinGroup(x.id, groupId), joinGroup(y.id, groupId)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const g = await db.packGroup.findUniqueOrThrow({ where: { id: groupId }, include: { _count: { select: { members: true } } } });
    expect(g).toMatchObject({ joined: 5, status: "FULL", _count: { members: 5 } });
  });
});
