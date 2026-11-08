import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentStatus } from "@/generated/prisma/client";
import { ADMIN_AREA_LABEL, AGENTS_AREA, adminHome } from "@/lib/admin-access";
import { FACTORY_ROLES, canFactory, factorySections } from "@/lib/factory-roles";
import { suspendAgent } from "@/server/agents/admin";
import { requestLeave } from "@/server/agents/leave";
import { assertAdminArea, assertAgent, assertFactorySection, homeFor } from "@/server/auth/service";
import { db } from "@/server/db";
import { bookCourier, markBasketReceived, markPacked } from "@/server/orders/delivery";
import { handOver, lookupCode } from "@/server/orders/handover";
import { markPayoutPaid } from "@/server/payouts";
import {
  adminReturns,
  buyerReturns,
  collectReturn,
  factoryDecide,
  factoryReturns,
  fileReturn,
  listReturnMessages,
} from "@/server/returns";
import { makeAgent, makeReceivedOrder, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

const receivedAt = new Date("2026-11-01T10:00:00Z");
const now = new Date("2026-11-02T10:00:00Z");
const CODE = "123456";
const courier = { fee: "850", driverName: "Sunil", driverPhone: "0771234567", vehicleNo: "LB-1" };

/** Agent A with a buyer's code, an uncollected line, a return awaiting handover and a basket on
 * its way; agent B elsewhere. */
async function fixture() {
  const o = await makeReceivedOrder({ receivedAt, collectedAt: receivedAt });
  const waiting = await db.orderLine.create({
    data: {
      orderId: o.order.id,
      variantId: o.variant.id,
      qty: 1,
      unitPrice: "1100",
      factoryPrice: "1000",
      courierEach: "40",
      agentFeeEach: "20",
    },
  });
  await db.pickupCode.create({ data: { buyerId: o.buyer.id, agentId: o.agent.id, code: CODE } });
  const ret = await fileReturn(
    o.buyer.id,
    o.line.id,
    { qty: 1, fault: "BUYER", reason: "DAMAGED", note: "Too small", photos: [] },
    now,
  );
  await factoryDecide(o.factory.id, ret.id, true, now);
  const agentsAdmin = await makeUser("ADMIN", "AGENTS");
  const basket = await db.basket.create({
    data: {
      agentId: o.agent.id,
      factoryId: o.factory.id,
      status: "WITH_COURIER",
      courier: { create: { ...courier, bookedById: agentsAdmin.id, givenToDriverAt: now } },
    },
  });
  const packed = await db.basket.create({
    data: { agentId: o.agent.id, factoryId: o.factory.id, status: "PACKED" },
  });
  const other = await makeAgent({ lat: 7.2906, lng: 80.6337 });
  return { ...o, waiting, ret, agentsAdmin, basket, packed, other };
}

const staff = (factoryId: string, factoryRole: "OWNER" | "PACKING" | "SALES") =>
  db.user.create({
    data: {
      role: "SELLER",
      name: `${factoryRole} staff`,
      email: `${factoryRole}-${factoryId}@test.lk`,
      passwordHash: "x",
      factoryId,
      factoryRole,
    },
  });

describe("roles and areas", () => {
  it("renames the warehouse area to Agents and orders", () => {
    expect(AGENTS_AREA).toBe("AGENTS");
    expect(ADMIN_AREA_LABEL.AGENTS).toBe("Agents and orders");
    expect(ADMIN_AREA_LABEL).not.toHaveProperty("WAREHOUSE");
    expect(adminHome("WAREHOUSE")).toBe("/");
  });

  it("gives factories three jobs with the approved sections", () => {
    expect(FACTORY_ROLES).toEqual(["OWNER", "PACKING", "SALES"]);
    expect(factorySections("OWNER")).toEqual([
      "home",
      "orders",
      "products",
      "insights",
      "team",
      "returns",
      "earnings",
    ]);
    expect(factorySections("PACKING")).toEqual(["home", "orders"]);
    expect(factorySections("SALES")).toEqual([
      "home",
      "products",
      "insights",
      "returns",
      "baskets",
    ]);
  });

  it("sends an agent to the agent home", () => {
    expect(homeFor("AGENT")).not.toBe("/packing");
  });
});

describe("requireAgent", () => {
  it("admits only a live, suspended or leaving agent", async () => {
    const allowed: AgentStatus[] = ["LIVE", "SUSPENDED", "LEAVING"];
    const refused: AgentStatus[] = ["APPLIED", "APPROVED", "LEFT"];
    for (const status of allowed) {
      const a = await makeAgent({ status, lat: 6 + allowed.indexOf(status) / 10 });
      await expect(assertAgent(a.user.id)).resolves.toMatchObject({ id: a.agent.id, status });
    }
    for (const status of refused) {
      const a = await makeAgent({ status, lat: 7 + refused.indexOf(status) / 10 });
      await expect(assertAgent(a.user.id)).rejects.toThrow();
    }
    const locked = await makeAgent({ lat: 8 });
    await db.user.update({ where: { id: locked.user.id }, data: { locked: true } });
    await expect(assertAgent(locked.user.id)).rejects.toThrow();
    await expect(assertAgent((await makeUser()).id)).rejects.toThrow();
  });

  it("lets a suspended agent still hand over parcels; a left agent cannot", async () => {
    const f = await fixture();
    await db.agent.update({ where: { id: f.agent.id }, data: { status: "SUSPENDED" } });
    expect((await lookupCode(f.agentUser.id, CODE, now))?.lines.map((l) => l.id)).toEqual([
      f.waiting.id,
    ]);
    await db.agent.update({ where: { id: f.agent.id }, data: { status: "LEFT" } });
    await expect(lookupCode(f.agentUser.id, CODE, now)).rejects.toThrow();
    await expect(handOver(f.agentUser.id, CODE, [f.waiting.id], now)).rejects.toThrow();
  });
});

describe("agent isolation", () => {
  it("an agent cannot see another agent's baskets, codes or returns", async () => {
    const f = await fixture();
    const b = f.other.user.id;
    expect(await lookupCode(b, CODE, now)).toBeNull();
    await expect(handOver(b, CODE, [f.waiting.id], now)).rejects.toThrow();
    await expect(markBasketReceived(b, f.basket.id, [])).rejects.toThrow("Not allowed");
    await expect(collectReturn(b, f.ret.id, now)).rejects.toThrow();
    await expect(listReturnMessages(b, f.ret.id)).rejects.toThrow();
    await expect(adminReturns(b)).rejects.toThrow();
    expect((await db.basket.findUniqueOrThrow({ where: { id: f.basket.id } })).status).toBe(
      "WITH_COURIER",
    );
    expect(
      (await db.orderLine.findUniqueOrThrow({ where: { id: f.waiting.id } })).collectedAt,
    ).toBeNull();
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: f.ret.id } })).status).toBe(
      "AWAITING_HANDOVER",
    );
  });
});

describe("buyers", () => {
  it("a buyer cannot call agent, factory or admin services", async () => {
    const f = await fixture();
    const buyer = f.buyer.id;
    // agent
    await expect(assertAgent(buyer)).rejects.toThrow();
    await expect(lookupCode(buyer, CODE, now)).rejects.toThrow();
    await expect(handOver(buyer, CODE, [f.waiting.id], now)).rejects.toThrow();
    await expect(markBasketReceived(buyer, f.basket.id, [])).rejects.toThrow();
    await expect(collectReturn(buyer, f.ret.id, now)).rejects.toThrow();
    await expect(requestLeave(buyer)).rejects.toThrow();
    // factory
    await expect(assertFactorySection(buyer, "home")).rejects.toThrow();
    await expect(markPacked(buyer, f.packed.id)).rejects.toThrow();
    await expect(factoryReturns(buyer)).rejects.toThrow();
    await expect(factoryDecide(buyer, f.ret.id, false, now, "No")).rejects.toThrow();
    // admin
    for (const area of ["PREMIUM", "FACTORY", "AGENTS", "CORE"] as const)
      await expect(assertAdminArea(buyer, area)).rejects.toThrow();
    await expect(bookCourier(buyer, f.packed.id, courier)).rejects.toThrow();
    await expect(suspendAgent(buyer, f.agent.id, "No")).rejects.toThrow();
    await expect(adminReturns(buyer)).rejects.toThrow();
    const payout = await db.factoryPayout.create({
      data: { factoryId: f.factory.id, weekEnding: now, gross: "1000", net: "1000" },
    });
    await expect(markPayoutPaid(buyer, payout.id, "REF-1")).rejects.toThrow();
  });

  it("an agent buys like a buyer", async () => {
    const o = await makeReceivedOrder({ receivedAt, collectedAt: receivedAt });
    const shopper = await makeAgent({ lat: 7.2906, lng: 80.6337 });
    await db.order.update({ where: { id: o.order.id }, data: { buyerId: shopper.user.id } });
    await fileReturn(
      shopper.user.id,
      o.line.id,
      { qty: 1, fault: "BUYER", reason: "DAMAGED", note: "Too small", photos: [] },
      now,
    );
    await expect(buyerReturns(shopper.user.id, o.order.id)).resolves.toHaveLength(1);
  });
});

describe("factory jobs", () => {
  it("Packing cannot see earnings", async () => {
    const f = await fixture();
    const [packing, sales] = [
      await staff(f.factory.id, "PACKING"),
      await staff(f.factory.id, "SALES"),
    ];
    expect(canFactory("PACKING", "earnings")).toBe(false);
    expect(canFactory("SALES", "earnings")).toBe(false);
    expect(canFactory("OWNER", "earnings")).toBe(true);
    await expect(assertFactorySection(packing.id, "earnings")).rejects.toThrow();
    await expect(assertFactorySection(sales.id, "earnings")).rejects.toThrow();
    await expect(assertFactorySection(f.factory.id, "earnings")).resolves.toMatchObject({
      factoryId: f.factory.id,
      factoryRole: "OWNER",
    });
    await expect(assertFactorySection(sales.id, "baskets")).resolves.toMatchObject({
      factoryId: f.factory.id,
      factoryRole: "SALES",
    });
    await expect(assertFactorySection(packing.id, "orders")).resolves.toBeTruthy();
  });
});

describe("admin areas", () => {
  it("a FACTORY admin cannot book couriers", async () => {
    const f = await fixture();
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    await expect(bookCourier(factoryAdmin.id, f.packed.id, courier)).rejects.toThrow("Not allowed");
    expect(await db.courierBooking.count({ where: { basketId: f.packed.id } })).toBe(0);
    await bookCourier(f.agentsAdmin.id, f.packed.id, courier);
    expect(await db.courierBooking.count({ where: { basketId: f.packed.id } })).toBe(1);
  });

  it("an AGENTS admin cannot mark payouts paid", async () => {
    const f = await fixture();
    const core = await makeUser("ADMIN", "CORE");
    const payout = await db.factoryPayout.create({
      data: { factoryId: f.factory.id, weekEnding: now, gross: "1000", net: "1000" },
    });
    await expect(markPayoutPaid(f.agentsAdmin.id, payout.id, "REF-1")).rejects.toThrow(
      "Not allowed",
    );
    expect(
      (await db.factoryPayout.findUniqueOrThrow({ where: { id: payout.id } })).paidAt,
    ).toBeNull();
    await markPayoutPaid(core.id, payout.id, "REF-1");
    expect(
      (await db.factoryPayout.findUniqueOrThrow({ where: { id: payout.id } })).paidAt,
    ).not.toBeNull();
  });
});
