import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { CartError } from "@/server/carts/errors";
import { handOver, lookupCode, PickupBlocked } from "@/server/orders/handover";
import { makeAgent, makeReceivedOrder, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

/** A RECEIVED order with two uncollected lines and the buyer's code at the agent. */
async function setup() {
  const r = await makeReceivedOrder({ collectedAt: null, qty: 2 });
  const second = await db.orderLine.create({
    data: {
      orderId: r.order.id,
      variantId: r.variant.id,
      qty: 1,
      unitPrice: "1100",
      factoryPrice: "1000",
      courierEach: "40",
      agentFeeEach: "20",
    },
  });
  const code = "123456";
  await db.pickupCode.create({ data: { buyerId: r.buyer.id, agentId: r.agent.id, code } });
  return { ...r, code, lineIds: [r.line.id, second.id] };
}

describe("pickup by code", () => {
  it("shows the lines for the right code and is empty after hand over", async () => {
    const s = await setup();
    const found = await lookupCode(s.agentUser.id, s.code);
    expect(found?.buyerName).toBe(s.buyer.name);
    expect(found?.lines.map((l) => l.id).sort()).toEqual([...s.lineIds].sort());
    expect(found?.lines.find((l) => l.id === s.line.id)?.qty).toBe(2);
    expect(await handOver(s.agentUser.id, s.code, s.lineIds)).toBe(2);
    expect(await lookupCode(s.agentUser.id, s.code)).toBeNull();
    expect(await db.orderLine.count({ where: { collectedAt: null } })).toBe(0);
  });

  it("hides lines that are fully missing", async () => {
    const s = await setup();
    await db.orderLine.update({ where: { id: s.line.id }, data: { missingQty: 2 } });
    const found = await lookupCode(s.agentUser.id, s.code);
    expect(found?.lines.map((l) => l.id)).toEqual([s.lineIds[1]]);
  });

  it("returns null for another agent's code", async () => {
    const s = await setup();
    const other = await makeAgent();
    expect(await lookupCode(other.user.id, s.code)).toBeNull();
  });

  it("blocks after 5 wrong codes, even for the right one, until 10 minutes pass", async () => {
    const s = await setup();
    const t0 = new Date("2026-11-08T10:00:00Z");
    for (const bad of ["000001", "000002", "000003", "000004", "abc"])
      expect(await lookupCode(s.agentUser.id, bad, t0)).toBeNull();
    await expect(lookupCode(s.agentUser.id, "000006", t0)).rejects.toBeInstanceOf(PickupBlocked);
    const nineMin = new Date(t0.getTime() + 9 * 60_000);
    await expect(lookupCode(s.agentUser.id, s.code, nineMin)).rejects.toBeInstanceOf(PickupBlocked);
    const later = new Date(t0.getTime() + 10 * 60_000 + 1);
    expect((await lookupCode(s.agentUser.id, s.code, later))?.lines).toHaveLength(2);
  });

  it("refuses a line id from another buyer and changes nothing", async () => {
    const s = await setup();
    const other = await makeReceivedOrder({
      collectedAt: null,
      agent: { user: s.agentUser, agent: s.agent },
    });
    await expect(
      handOver(s.agentUser.id, s.code, [s.lineIds[0], other.line.id]),
    ).rejects.toBeInstanceOf(CartError);
    expect(await db.orderLine.count({ where: { collectedAt: { not: null } } })).toBe(0);
  });

  it("refuses a line that is already collected", async () => {
    const s = await setup();
    await handOver(s.agentUser.id, s.code, [s.lineIds[0]]);
    await expect(handOver(s.agentUser.id, s.code, s.lineIds)).rejects.toBeInstanceOf(CartError);
    expect(await db.orderLine.count({ where: { collectedAt: null } })).toBe(1);
  });

  it("holds the throttle under 20 parallel wrong lookups", async () => {
    const s = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, (_, i) => lookupCode(s.agentUser.id, String(900000 + i))),
    );
    const nulls = results.filter((r) => r.status === "fulfilled" && r.value === null).length;
    const blocked = results.filter(
      (r) => r.status === "rejected" && r.reason instanceof PickupBlocked,
    ).length;
    expect(nulls).toBe(5);
    expect(blocked).toBe(15);
    expect(await db.pickupAttempt.count({ where: { agentId: s.agent.id, ok: false } })).toBe(5);
  });
});
