import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { setCartItem } from "@/server/orders/cart";
import { startCheckout } from "@/server/orders/checkout";
import {
  bookCourier,
  DeliveryError,
  dismissMissingReport,
  givenToDriver,
  markPacked,
  pendingMissingReports,
  reportMissing,
} from "@/server/orders/delivery";
import { courierToBook, searchOrders } from "@/server/agents/admin-screens";
import { adminPayouts, tokenLookup, tokensOutstanding } from "@/server/admin-core";
import { fundTokens, makeAgent, makeBuyer, makeFactory, makeUser, resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
  await db.settings.update({ where: { id: 1 }, data: { basketLockAmount: "1000" } });
});
afterAll(() => db.$disconnect());

type Factory = Awaited<ReturnType<typeof makeFactory>>;

/** One item paid fully with tokens (1100 + 40 + 20) locks the basket. */
async function lockedOrder(agentId: string, f: Factory) {
  const buyer = (await makeBuyer()).id;
  await fundTokens(buyer, "1160.00");
  await setCartItem(buyer, f.variant.id, 1);
  const r = await startCheckout(buyer, {
    agentId,
    tokens: "1160.00",
    requestKey: `k${Date.now()}`,
  });
  const order = await db.order.findUniqueOrThrow({
    where: { id: r.orderIds[0] },
    include: { lines: true },
  });
  return { buyerId: buyer, order, basketId: order.basketId! };
}

describe("dismiss a missing report", () => {
  it("clears the report with no refund or deduction, so the basket can ship", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    const agentsAdmin = await makeUser("ADMIN", "AGENTS");
    const { order, basketId, buyerId } = await lockedOrder(agent.id, f);
    const line = order.lines[0];
    await markPacked(f.factory.id, basketId);
    await reportMissing(f.factory.id, line.id, 1, "Out of stock");
    expect((await pendingMissingReports(factoryAdmin.id)).map((l) => l.id)).toEqual([line.id]);

    for (const who of [agentsAdmin.id, buyerId, f.factory.id])
      await expect(dismissMissingReport(who, line.id)).rejects.toThrow(DeliveryError);
    await expect(pendingMissingReports(agentsAdmin.id)).rejects.toThrow(DeliveryError);

    await dismissMissingReport(factoryAdmin.id, line.id);
    const row = await db.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect([row.missingQty, row.missingReportedQty, row.missingNote, row.status]).toEqual([
      0,
      0,
      null,
      "ACTIVE",
    ]);
    expect(await db.tokenEntry.count({ where: { kind: "MISSING_ITEM" } })).toBe(0);
    expect(await db.payoutDeduction.count()).toBe(0);
    expect(await pendingMissingReports(factoryAdmin.id)).toEqual([]);
    await expect(dismissMissingReport(factoryAdmin.id, line.id)).rejects.toThrow(
      "Nothing is reported missing",
    );

    await bookCourier(agentsAdmin.id, basketId, {
      fee: "850",
      driverName: "Sunil",
      driverPhone: "0771234567",
      vehicleNo: "LB-1234",
    });
    await givenToDriver(f.factory.id, basketId);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basketId } })).status).toBe(
      "WITH_COURIER",
    );
    await expect(dismissMissingReport(factoryAdmin.id, line.id)).rejects.toThrow(DeliveryError);
  });
});

describe("admin screen queries", () => {
  it("each area reads only its own lists", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const agentsAdmin = await makeUser("ADMIN", "AGENTS");
    const coreAdmin = await makeUser("ADMIN", "CORE");
    const { order, basketId } = await lockedOrder(agent.id, f);
    await markPacked(f.factory.id, basketId);

    const packed = await courierToBook(agentsAdmin.id);
    expect(packed.map((b) => [b.id, b.pieces])).toEqual([[basketId, 1]]);
    expect((await searchOrders(agentsAdmin.id, basketId)).map((o) => o.id)).toEqual([order.id]);
    expect((await searchOrders(agentsAdmin.id, order.id)).map((o) => o.id)).toEqual([order.id]);

    await expect(courierToBook(coreAdmin.id)).rejects.toThrow("Not allowed");
    await expect(searchOrders(coreAdmin.id, order.id)).rejects.toThrow("Not allowed");
    await expect(adminPayouts(agentsAdmin.id)).rejects.toThrow("Not allowed");
    await expect(tokenLookup(agentsAdmin.id, "x@example.com")).rejects.toThrow("Not allowed");

    const buyer = await db.user.findUniqueOrThrow({ where: { id: order.buyerId } });
    const found = await tokenLookup(coreAdmin.id, buyer.email.toUpperCase());
    expect(found?.user.id).toBe(buyer.id);
    expect(found?.balance.toFixed(2)).toBe("0.00");
  });

  it("Core sees the total outstanding tokens: the sum of every balance", async () => {
    const coreAdmin = await makeUser("ADMIN", "CORE");
    const agentsAdmin = await makeUser("ADMIN", "AGENTS");
    expect((await tokensOutstanding(coreAdmin.id)).toFixed(2)).toBe("0.00");
    const a = await makeBuyer();
    const b = await makeBuyer();
    await fundTokens(a.id, "1000.10");
    await db.tokenEntry.create({
      data: { userId: a.id, amount: "-250.05", kind: "HOLD", eventKey: "test:hold", note: "Hold" },
    });
    await fundTokens(b.id, "0.01");
    expect((await tokensOutstanding(coreAdmin.id)).toFixed(2)).toBe("750.06");
    await expect(tokensOutstanding(agentsAdmin.id)).rejects.toThrow("Not allowed");
  });
});
