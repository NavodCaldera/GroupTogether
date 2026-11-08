import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { BasketStatus, FactoryRole, OrderStatus } from "@/generated/prisma/client";
import { db } from "@/server/db";
import {
  factoryBasketBoard,
  factoryEarnings,
  fillingBaskets,
  packingWork,
  returnsWaiting,
} from "@/server/factory-dashboard";
import { buildWeeklyPayouts, weekOf } from "@/server/payouts";
import { makeAgent, makeBuyer, makeFactory, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
afterAll(() => db.$disconnect());

const DAY = 86_400_000;
let n = 0;

async function staff(factoryId: string, factoryRole: FactoryRole) {
  n++;
  return db.user.create({
    data: {
      role: "SELLER",
      factoryId,
      factoryRole,
      name: `${factoryRole} ${n}`,
      email: `s${n}-${Date.now()}@test.lk`,
      phone: `07${String(40000000 + n).slice(-8)}`,
      passwordHash: "x",
    },
  });
}

/** A basket for the factory at the agent, holding one order of `qty` pieces. */
async function basket(
  f: Awaited<ReturnType<typeof makeFactory>>,
  agentId: string,
  status: BasketStatus,
  opts: { qty?: number; orderStatus?: OrderStatus; receivedAt?: Date | null } = {},
) {
  const { qty = 2, orderStatus = "PAID", receivedAt = null } = opts;
  const buyer = await makeBuyer();
  const b = await db.basket.create({
    data: {
      agentId,
      factoryId: f.factory.id,
      status,
      total: String(1100 * qty),
      firstOrderAt: new Date(),
      lockedAt: status === "OPEN" ? null : new Date(),
    },
  });
  const order = await db.order.create({
    data: {
      buyerId: buyer.id,
      agentId,
      factoryId: f.factory.id,
      basketId: b.id,
      status: orderStatus,
      itemsTotal: String(1100 * qty),
      courierTotal: String(40 * qty),
      agentFeeTotal: String(20 * qty),
      amountDue: "0",
      holdUntil: new Date(),
      paidAt: new Date(),
      receivedAt,
      lines: {
        create: {
          variantId: f.variant.id,
          qty,
          unitPrice: "1100",
          factoryPrice: "1000",
          courierEach: "40",
          agentFeeEach: "20",
        },
      },
    },
    include: { lines: true },
  });
  return { basket: b, order, line: order.lines[0] };
}

async function setup() {
  const f = await makeFactory();
  const other = await makeFactory();
  const { agent } = await makeAgent();
  return {
    f,
    other,
    agent,
    packing: await staff(f.factory.id, "PACKING"),
    sales: await staff(f.factory.id, "SALES"),
    otherPacking: await staff(other.factory.id, "PACKING"),
  };
}

describe("factory screens", () => {
  it("shows Packing its locked baskets with lines and courier-booked baskets; Sales cannot", async () => {
    const s = await setup();
    const locked = await basket(s.f, s.agent.id, "LOCKED", { qty: 3 });
    const packed = await basket(s.f, s.agent.id, "PACKED");
    await basket(s.f, s.agent.id, "PACKED");
    await db.courierBooking.create({
      data: {
        basketId: packed.basket.id,
        fee: "1500",
        driverName: "Nimal",
        driverPhone: "0771234567",
        vehicleNo: "CAB-1",
        bookedById: (await makeBuyer()).id,
      },
    });

    const work = await packingWork(s.packing.id);
    expect(work.toPack.map((b) => b.id)).toEqual([locked.basket.id]);
    expect(work.toPack[0]).toMatchObject({ pieces: 3 });
    expect(work.toPack[0].products[0].lines).toEqual([
      expect.objectContaining({ id: locked.line.id, size: "M", qty: 3, reportable: true }),
    ]);
    expect(work.courierBooked.map((b) => b.courier?.driverName)).toEqual(["Nimal"]);
    expect(work.waitingCourier).toBe(1);
    expect(await packingWork(s.f.factory.id)).toMatchObject({ waitingCourier: 1 });

    await expect(packingWork(s.sales.id)).rejects.toThrow();
    expect((await packingWork(s.otherPacking.id)).toPack).toEqual([]);
  });

  it("counts baskets by stage on the orders board", async () => {
    const s = await setup();
    await basket(s.f, s.agent.id, "OPEN");
    await basket(s.f, s.agent.id, "LOCKED");
    await basket(s.f, s.agent.id, "AT_AGENT", { orderStatus: "RECEIVED", receivedAt: new Date() });
    // An open basket whose only order was cancelled is not filling.
    await basket(s.f, (await makeAgent()).agent.id, "OPEN", { orderStatus: "CANCELLED" });

    const board = await factoryBasketBoard(s.packing.id);
    expect(board.counts).toEqual({ OPEN: 1, LOCKED: 1, PACKED: 0, WITH_COURIER: 0, AT_AGENT: 1 });
    expect(board.baskets.map((b) => b.status)).toEqual(["LOCKED", "AT_AGENT"]);
    await expect(factoryBasketBoard(s.sales.id)).rejects.toThrow();
  });

  it("shows filling baskets with totals to Sales and the Owner, not to Packing", async () => {
    const s = await setup();
    const open = await basket(s.f, s.agent.id, "OPEN", { qty: 4 });
    await basket(s.f, (await makeAgent()).agent.id, "OPEN", { orderStatus: "CANCELLED" });

    const sales = await fillingBaskets(s.sales.id);
    expect(sales.baskets.map((b) => [b.id, b.total.toString()])).toEqual([
      [open.basket.id, "4400"],
    ]);
    expect(sales.lockAmount.toString()).toBe("50000");
    expect((await fillingBaskets(s.f.factory.id)).baskets).toHaveLength(1);
    await expect(fillingBaskets(s.packing.id)).rejects.toThrow();
    expect(await returnsWaiting(s.sales.id)).toBe(0);
    await expect(returnsWaiting(s.packing.id)).rejects.toThrow();
  });

  it("shows the Owner this week's earning, holds reported lines, then the Sunday payout", async () => {
    const s = await setup();
    const now = new Date();
    const received = new Date(now.getTime() - 10 * DAY);
    await basket(s.f, s.agent.id, "AT_AGENT", {
      qty: 2,
      orderStatus: "RECEIVED",
      receivedAt: received,
    });
    const held = await basket(s.f, s.agent.id, "AT_AGENT", {
      qty: 1,
      orderStatus: "RECEIVED",
      receivedAt: received,
    });
    await db.orderLine.update({ where: { id: held.line.id }, data: { missingReportedQty: 1 } });

    const before = await factoryEarnings(s.f.factory.id, now);
    expect(before.earned.toString()).toBe("2000");
    expect(before.nextWeek.toString()).toBe("0");
    expect(before.held.toString()).toBe("1000");
    expect(before.payouts).toEqual([]);
    expect(before.nextSunday.getTime()).toBeGreaterThan(now.getTime());
    expect(before.nextSunday.getTime() - now.getTime()).toBeLessThanOrEqual(7 * DAY);

    expect(await buildWeeklyPayouts(now)).toBe(1);
    const after = await factoryEarnings(s.f.factory.id, now);
    expect(after.earned.toString()).toBe("0");
    expect(after.nextWeek.toString()).toBe("0");
    expect(after.held.toString()).toBe("1000");
    expect(after.payouts.map((p) => [p.gross.toString(), p.net.toString(), p.paidAt])).toEqual([
      ["2000", "2000", null],
    ]);

    await expect(factoryEarnings(s.sales.id)).rejects.toThrow();
    await expect(factoryEarnings(s.packing.id)).rejects.toThrow();
    expect((await factoryEarnings(s.other.factory.id)).payouts).toEqual([]);
  });

  it("counts a line received inside the collect window before Saturday in next week's payout", async () => {
    const s = await setup();
    const end = weekOf(new Date());
    // Half an hour before the week ends; one line came an hour ago, one ten days ago.
    const now = new Date(end.getTime() - 30 * 60_000);
    await basket(s.f, s.agent.id, "AT_AGENT", {
      qty: 1,
      orderStatus: "RECEIVED",
      receivedAt: new Date(end.getTime() - 3_600_000),
    });
    await basket(s.f, s.agent.id, "AT_AGENT", {
      qty: 3,
      orderStatus: "RECEIVED",
      receivedAt: new Date(end.getTime() - 10 * DAY),
    });

    const e = await factoryEarnings(s.f.factory.id, now);
    expect(e.earned.toString()).toBe("3000");
    expect(e.nextWeek.toString()).toBe("1000");
    expect(e.held.toString()).toBe("0");
    expect(e.nextSunday.getTime()).toBe(end.getTime() + 1);

    // The Sunday payout built after this Saturday takes exactly "Earned this week".
    const built = new Date(end.getTime() + 60_000);
    expect(await buildWeeklyPayouts(built)).toBe(1);
    const payout = await db.factoryPayout.findFirstOrThrow({
      where: { factoryId: s.f.factory.id },
    });
    expect(payout.gross.toString()).toBe(e.earned.toString());
  });
});
