import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { setCartItem } from "@/server/orders/cart";
import { startCheckout } from "@/server/orders/checkout";
import {
  bookCourier,
  DeliveryError,
  givenToDriver,
  markBasketReceived,
  markPacked,
  removeMissingLine,
  reportMissing,
} from "@/server/orders/delivery";
import { fundTokens, makeAgent, makeBuyer, makeFactory, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  // One 1100 order locks the basket.
  await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "1000" } });
});
afterAll(() => db.$disconnect());

const money = (v: { toFixed(n: number): string }) => v.toFixed(2);
const COURIER = {
  fee: "850",
  driverName: " Sunil ",
  driverPhone: "0771234567",
  vehicleNo: "LB-1234",
};

type Factory = Awaited<ReturnType<typeof makeFactory>>;

/** The buyer pays one item fully with tokens (1100 + 55 agent fee); the basket locks. */
async function lockedOrder(agentId: string, f: Factory, buyerId?: string, qty = 1) {
  const buyer = buyerId ?? (await makeBuyer()).id;
  const tokens = (1155 * qty).toFixed(2);
  await fundTokens(buyer, tokens);
  await setCartItem(buyer, f.variant.id, qty);
  const r = await startCheckout(buyer, { agentId, tokens, requestKey: `k${Date.now()}` });
  const order = await db.order.findUniqueOrThrow({
    where: { id: r.orderIds[0] },
    include: { lines: true },
  });
  expect(order.status).toBe("PAID");
  const basket = await db.basket.findUniqueOrThrow({ where: { id: order.basketId! } });
  expect(basket.status).toBe("LOCKED");
  return { buyerId: buyer, order, basket };
}

async function staff(factoryId: string, factoryRole: "OWNER" | "PACKING" | "SALES") {
  const u = await makeUser();
  return db.user.update({ where: { id: u.id }, data: { role: "SELLER", factoryId, factoryRole } });
}

async function shipToAgent(basketId: string, packerId: string, adminId: string) {
  await markPacked(packerId, basketId);
  await bookCourier(adminId, basketId, COURIER);
  await givenToDriver(packerId, basketId);
}

describe("packing, courier and receipt", () => {
  it("full path: credits the courier fee once and gives one stable pickup code", async () => {
    const { user: agentUser, agent } = await makeAgent();
    const f = await makeFactory();
    const packer = await staff(f.factory.id, "PACKING");
    const admin = await makeUser("ADMIN", "AGENTS");
    const first = await lockedOrder(agent.id, f);

    await markPacked(packer.id, first.basket.id);
    expect((await db.basket.findUniqueOrThrow({ where: { id: first.basket.id } })).status).toBe(
      "PACKED",
    );
    await bookCourier(admin.id, first.basket.id, { ...COURIER, fee: "800" });
    await bookCourier(admin.id, first.basket.id, COURIER); // re-booking while PACKED updates it
    const booking = await db.courierBooking.findUniqueOrThrow({
      where: { basketId: first.basket.id },
    });
    expect([money(booking.fee), booking.driverName, booking.bookedById]).toEqual([
      "850.00",
      "Sunil",
      admin.id,
    ]);
    await givenToDriver(packer.id, first.basket.id);
    const sent = await db.basket.findUniqueOrThrow({
      where: { id: first.basket.id },
      include: { courier: true },
    });
    expect(sent.status).toBe("WITH_COURIER");
    expect(sent.courier!.givenToDriverAt).not.toBeNull();

    await markBasketReceived(agentUser.id, first.basket.id, []);
    await markBasketReceived(agentUser.id, first.basket.id, []);

    const basket = await db.basket.findUniqueOrThrow({
      where: { id: first.basket.id },
      include: { courier: true },
    });
    expect(basket.status).toBe("AT_AGENT");
    expect(basket.courier!.receivedAt).not.toBeNull();
    const order = await db.order.findUniqueOrThrow({ where: { id: first.order.id } });
    expect(order.status).toBe("RECEIVED");
    expect(order.receivedAt).not.toBeNull();
    // The agent pays the driver from its fees; nothing is repaid (DEC-018).
    expect(money(await tokenBalance(agentUser.id))).toBe("0.00");
    expect(await db.tokenEntry.count({ where: { kind: "COURIER_REPAY" } })).toBe(0);
    expect(await db.tokenEntry.count({ where: { kind: "AGENT_FEE" } })).toBe(0);

    const code = await db.pickupCode.findUniqueOrThrow({
      where: { buyerId_agentId: { buyerId: first.buyerId, agentId: agent.id } },
    });
    expect(code.code).toMatch(/^\d{6}$/);
    const notices = await db.notification.findMany({ where: { userId: first.buyerId } });
    expect(notices.filter((n) => n.title === "Ready to collect")).toHaveLength(1);
    const notice = notices.find((n) => n.title === "Ready to collect")!;
    expect(notice.body).toContain(code.code);
    expect(notice.body).toContain(agentUser.name);
    expect(notice.href).toBe("/");

    // A later order for the same buyer and agent keeps the same code.
    const second = await lockedOrder(agent.id, f, first.buyerId);
    expect(second.basket.id).not.toBe(first.basket.id);
    await shipToAgent(second.basket.id, packer.id, admin.id);
    await markBasketReceived(agentUser.id, second.basket.id, []);
    expect(await db.pickupCode.count()).toBe(1);
    const ready = await db.notification.findMany({
      where: { userId: first.buyerId, title: "Ready to collect" },
    });
    expect(ready).toHaveLength(2);
    for (const n of ready) expect(n.body).toContain(code.code);
    expect(money(await tokenBalance(agentUser.id))).toBe("0.00");
  });

  it("a factory that does not own the basket cannot pack it", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const other = await makeFactory();
    const otherPacker = await staff(other.factory.id, "PACKING");
    const { basket } = await lockedOrder(agent.id, f);
    await expect(markPacked(other.factory.id, basket.id)).rejects.toThrow(DeliveryError);
    await expect(markPacked(otherPacker.id, basket.id)).rejects.toThrow(DeliveryError);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe("LOCKED");
    await markPacked(f.factory.id, basket.id); // the factory account itself is an owner
  });

  it("sales staff cannot mark packed", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const sales = await staff(f.factory.id, "SALES");
    const { basket } = await lockedOrder(agent.id, f);
    await expect(markPacked(sales.id, basket.id)).rejects.toThrow(DeliveryError);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe("LOCKED");
  });

  it("a courier cannot be booked before the basket is packed, nor by another admin area", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "AGENTS");
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    const { basket } = await lockedOrder(agent.id, f);
    await expect(bookCourier(admin.id, basket.id, COURIER)).rejects.toThrow(DeliveryError);
    await markPacked(f.factory.id, basket.id);
    await expect(bookCourier(factoryAdmin.id, basket.id, COURIER)).rejects.toThrow(DeliveryError);
    await expect(bookCourier(admin.id, basket.id, { ...COURIER, fee: "0" })).rejects.toThrow(
      DeliveryError,
    );
    await expect(bookCourier(admin.id, basket.id, { ...COURIER, fee: "10.005" })).rejects.toThrow(
      DeliveryError,
    );
    await expect(
      bookCourier(admin.id, basket.id, { ...COURIER, driverName: "  " }),
    ).rejects.toThrow(DeliveryError);
    await expect(givenToDriver(f.factory.id, basket.id)).rejects.toThrow(DeliveryError);
    expect(await db.courierBooking.count()).toBe(0);
  });

  it("a wrong factory and sales staff cannot hand the basket to the driver", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const other = await makeFactory();
    const sales = await staff(f.factory.id, "SALES");
    const admin = await makeUser("ADMIN", "AGENTS");
    const { basket } = await lockedOrder(agent.id, f);
    await markPacked(f.factory.id, basket.id);
    await bookCourier(admin.id, basket.id, COURIER);
    await expect(givenToDriver(other.factory.id, basket.id)).rejects.toThrow(DeliveryError);
    await expect(givenToDriver(sales.id, basket.id)).rejects.toThrow(DeliveryError);
    const row = await db.basket.findUniqueOrThrow({
      where: { id: basket.id },
      include: { courier: true },
    });
    expect([row.status, row.courier!.givenToDriverAt]).toEqual(["PACKED", null]);
  });

  it("a repeat receipt resends a lost ready notice without crediting again", async () => {
    const { user: agentUser, agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "AGENTS");
    const { basket, buyerId } = await lockedOrder(agent.id, f);
    await shipToAgent(basket.id, f.factory.id, admin.id);
    await markBasketReceived(agentUser.id, basket.id, []);
    // Simulate a crash between commit and notify.
    await db.notification.deleteMany({ where: { userId: buyerId, title: "Ready to collect" } });
    await markBasketReceived(agentUser.id, basket.id, []);
    await markBasketReceived(agentUser.id, basket.id, []);
    const code = await db.pickupCode.findFirstOrThrow({ where: { buyerId, agentId: agent.id } });
    const ready = await db.notification.findMany({
      where: { userId: buyerId, title: "Ready to collect" },
    });
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe(`ready:${basket.id}:${buyerId}`);
    expect(ready[0].body).toContain(code.code);
    expect(await db.tokenEntry.count({ where: { kind: "COURIER_REPAY" } })).toBe(0);
  });

  it("another agent cannot mark the basket received", async () => {
    const { agent } = await makeAgent();
    const { user: otherUser } = await makeAgent({ lat: 7.2, lng: 80.6 });
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "AGENTS");
    const { basket } = await lockedOrder(agent.id, f);
    await shipToAgent(basket.id, f.factory.id, admin.id);
    await expect(markBasketReceived(otherUser.id, basket.id, [])).rejects.toThrow(DeliveryError);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe(
      "WITH_COURIER",
    );
    expect(await db.tokenEntry.count({ where: { kind: "COURIER_REPAY" } })).toBe(0);
  });

  it("sends back the listed handed-over returns for that factory", async () => {
    const { user: agentUser, agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "AGENTS");
    const { basket, order, buyerId } = await lockedOrder(agent.id, f);
    const ret = await db.returnRequest.create({
      data: {
        orderLineId: order.lines[0].id,
        buyerId,
        factoryId: f.factory.id,
        qty: 1,
        reason: "DAMAGED",
        fault: "FACTORY",
        note: "Torn",
        status: "HANDED_OVER",
        handoverAgentId: agent.id,
        factoryDueAt: new Date(),
      },
    });
    const waiting = await db.returnRequest.create({
      data: {
        orderLineId: order.lines[0].id,
        buyerId,
        factoryId: f.factory.id,
        qty: 1,
        reason: "DAMAGED",
        fault: "FACTORY",
        note: "Torn",
        status: "AWAITING_HANDOVER",
        handoverAgentId: agent.id,
        factoryDueAt: new Date(),
      },
    });
    await shipToAgent(basket.id, f.factory.id, admin.id);
    await expect(markBasketReceived(agentUser.id, basket.id, [waiting.id])).rejects.toThrow(
      DeliveryError,
    );
    await markBasketReceived(agentUser.id, basket.id, [ret.id]);
    const row = await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } });
    expect([row.status, row.sentBackBasketId]).toEqual(["PICKED_UP", basket.id]);
  });
});

describe("missing items", () => {
  it("refunds the buyer 1155 tokens, queues a 155 deduction and lowers the basket total", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const packer = await staff(f.factory.id, "PACKING");
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    const agentsAdmin = await makeUser("ADMIN", "AGENTS");
    const { basket, order, buyerId } = await lockedOrder(agent.id, f);
    const line = order.lines[0];
    expect(money(await tokenBalance(buyerId))).toBe("0.00");

    await expect(removeMissingLine(factoryAdmin.id, line.id)).rejects.toThrow(DeliveryError);
    await expect(reportMissing(packer.id, line.id, 2, "Out of stock")).rejects.toThrow(
      DeliveryError,
    );
    await expect(reportMissing(packer.id, line.id, 1, "  ")).rejects.toThrow(DeliveryError);
    await reportMissing(packer.id, line.id, 1, "Out of stock");
    const reported = await db.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([
      reported.missingReportedQty,
      reported.missingNote,
      reported.missingReportedById,
    ]).toEqual([1, "Out of stock", packer.id]);

    await expect(removeMissingLine(agentsAdmin.id, line.id)).rejects.toThrow(DeliveryError);
    await removeMissingLine(factoryAdmin.id, line.id);

    expect(money(await tokenBalance(buyerId))).toBe("1155.00");
    const entry = await db.tokenEntry.findUniqueOrThrow({
      where: { eventKey: `missing:${line.id}:1` },
    });
    expect(entry.kind).toBe("MISSING_ITEM");
    const deduction = await db.payoutDeduction.findUniqueOrThrow({
      where: { kind_ref: { kind: "MISSING_ITEM", ref: `missing:${line.id}:1` } },
    });
    expect([money(deduction.amount), deduction.factoryId, deduction.payoutId]).toEqual([
      "155.00",
      f.factory.id,
      null,
    ]);
    expect(money((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).total)).toBe(
      "0.00",
    );
    const after = await db.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([after.missingQty, after.missingReportedQty, after.status]).toEqual([1, 0, "CANCELLED"]);
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: buyerId, title: "Item removed" },
    });
    expect(notice.body).toContain("1155");

    // Nothing left to report or remove.
    await expect(removeMissingLine(factoryAdmin.id, line.id)).rejects.toThrow(DeliveryError);
    await expect(reportMissing(packer.id, line.id, 1, "Again")).rejects.toThrow(DeliveryError);
  });

  it("two partial removals on one line are separate refunds and deductions", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    const { basket, order, buyerId } = await lockedOrder(agent.id, f, undefined, 2);
    const line = order.lines[0];
    expect(line.qty).toBe(2);
    expect(money(basket.total)).toBe("2200.00");

    await reportMissing(f.factory.id, line.id, 1, "One short");
    await removeMissingLine(factoryAdmin.id, line.id);
    const mid = await db.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([mid.missingQty, mid.missingReportedQty, mid.status]).toEqual([1, 0, "ACTIVE"]);
    expect(money((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).total)).toBe(
      "1100.00",
    );

    await reportMissing(f.factory.id, line.id, 1, "Second one short");
    await removeMissingLine(factoryAdmin.id, line.id);
    const end = await db.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([end.missingQty, end.missingReportedQty, end.status]).toEqual([2, 0, "CANCELLED"]);
    expect(money((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).total)).toBe(
      "0.00",
    );

    const entries = await db.tokenEntry.findMany({
      where: { kind: "MISSING_ITEM" },
      orderBy: { eventKey: "asc" },
    });
    expect(entries.map((e) => [e.eventKey, money(e.amount)])).toEqual([
      [`missing:${line.id}:1`, "1155.00"],
      [`missing:${line.id}:2`, "1155.00"],
    ]);
    const deductions = await db.payoutDeduction.findMany({ orderBy: { ref: "asc" } });
    expect(deductions.map((d) => [d.ref, money(d.amount)])).toEqual([
      [`missing:${line.id}:1`, "155.00"],
      [`missing:${line.id}:2`, "155.00"],
    ]);
    expect(money(await tokenBalance(buyerId))).toBe("2310.00");
  });

  it("only an unlocked factory admin can remove a missing line", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const lockedAdmin = await makeUser("ADMIN", "FACTORY");
    await db.user.update({ where: { id: lockedAdmin.id }, data: { locked: true } });
    const { order, buyerId } = await lockedOrder(agent.id, f);
    const line = order.lines[0];
    await reportMissing(f.factory.id, line.id, 1, "Out of stock");
    await expect(removeMissingLine(buyerId, line.id)).rejects.toThrow(DeliveryError);
    await expect(removeMissingLine(lockedAdmin.id, line.id)).rejects.toThrow(DeliveryError);
    await expect(removeMissingLine(f.factory.id, line.id)).rejects.toThrow(DeliveryError);
    const row = await db.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([row.missingQty, row.missingReportedQty]).toEqual([0, 1]);
    expect(await db.tokenEntry.count({ where: { kind: "MISSING_ITEM" } })).toBe(0);
  });

  it("a basket with a pending missing report cannot be handed to the driver", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "AGENTS");
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    const { basket, order } = await lockedOrder(agent.id, f);
    await markPacked(f.factory.id, basket.id);
    await reportMissing(f.factory.id, order.lines[0].id, 1, "Out of stock");
    await bookCourier(admin.id, basket.id, COURIER);
    await expect(givenToDriver(f.factory.id, basket.id)).rejects.toThrow(
      "Resolve the missing items first",
    );
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe("PACKED");
    await removeMissingLine(factoryAdmin.id, order.lines[0].id);
    await givenToDriver(f.factory.id, basket.id);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe(
      "WITH_COURIER",
    );
  });

  it("cannot report once the basket has left the factory", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const admin = await makeUser("ADMIN", "AGENTS");
    const sales = await staff(f.factory.id, "SALES");
    const { basket, order } = await lockedOrder(agent.id, f);
    await expect(reportMissing(sales.id, order.lines[0].id, 1, "Gone")).rejects.toThrow(
      DeliveryError,
    );
    await shipToAgent(basket.id, f.factory.id, admin.id);
    await expect(reportMissing(f.factory.id, order.lines[0].id, 1, "Gone")).rejects.toThrow(
      DeliveryError,
    );
  });
});
