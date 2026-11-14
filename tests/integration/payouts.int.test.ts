import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { markPayoutPaid } from "@/server/payouts";
import { runSweep } from "@/server/sweep";
import { makeAgent, makeBuyer, makeFactory, makeReceivedOrder, makeUser, resetDb } from "./helpers";

beforeEach(resetDb);
afterAll(() => db.$disconnect());

/** Asia/Colombo wall time (UTC+05:30) as a Date. */
const lk = (iso: string) => new Date(`${iso}+05:30`);
const THURSDAY = lk("2026-11-12T10:00:00");
const SATURDAY_NIGHT = lk("2026-11-14T20:00:00");
const SUNDAY = lk("2026-11-15T01:00:00");
const NEXT_SUNDAY = lk("2026-11-22T01:00:00");
const WEEK_1 = lk("2026-11-14T23:59:59.999");
const WEEK_2 = lk("2026-11-21T23:59:59.999");

const payouts = () =>
  db.factoryPayout.findMany({ include: { items: true }, orderBy: { weekEnding: "asc" } });

describe("weekly payouts", () => {
  it("pays a line 48 hours after receipt; a Saturday-night line waits a week", async () => {
    const f = await makeFactory();
    const a = await makeAgent();
    const thu = await makeReceivedOrder({ factory: f, agent: a, receivedAt: THURSDAY });
    const sat = await makeReceivedOrder({ factory: f, agent: a, receivedAt: SATURDAY_NIGHT });

    await runSweep(SUNDAY);
    let rows = await payouts();
    expect(rows).toHaveLength(1);
    expect(rows[0].weekEnding).toEqual(WEEK_1);
    expect(rows[0].items.map((i) => i.orderLineId)).toEqual([thu.line.id]);
    expect(rows[0].items[0].amount.toFixed(2)).toBe("1000.00");
    expect(rows[0].gross.toFixed(2)).toBe("1000.00");
    expect(rows[0].net.toFixed(2)).toBe("1000.00");

    await runSweep(NEXT_SUNDAY);
    rows = await payouts();
    expect(rows).toHaveLength(2);
    expect(rows[1].weekEnding).toEqual(WEEK_2);
    expect(rows[1].items.map((i) => i.orderLineId)).toEqual([sat.line.id]);
  });

  it("pays only for units not returned or missing", async () => {
    const r = await makeReceivedOrder({ qty: 3, receivedAt: THURSDAY });
    await db.orderLine.update({
      where: { id: r.line.id },
      data: { returnedQty: 1, missingQty: 1 },
    });
    await runSweep(SUNDAY);
    const [p] = await payouts();
    expect(p.items[0].amount.toFixed(2)).toBe("1000.00");
  });

  it("a buyer-fault return in any state never holds the factory payout (DEC-017)", async () => {
    for (const status of ["BUYER_REQUESTED", "AWAITING_HANDOVER", "WITH_AGENT"] as const) {
      await resetDb();
      const r = await makeReceivedOrder({ receivedAt: THURSDAY });
      await db.returnRequest.create({
        data: {
          orderLineId: r.line.id,
          buyerId: r.buyer.id,
          factoryId: r.factory.id,
          qty: 1,
          buyerReason: "SIZE",
          fault: "BUYER",
          note: "Too small",
          status,
          factoryDueAt: THURSDAY,
          handoverAgentId: r.agent.id,
        },
      });
      await runSweep(SUNDAY);
      const [p] = await payouts();
      expect(p.items[0].amount.toFixed(2)).toBe("1000.00");
    }
  });

  it("holds a line with an open return; once it lapses the line is paid the next week", async () => {
    const r = await makeReceivedOrder({ receivedAt: THURSDAY });
    const ret = await db.returnRequest.create({
      data: {
        orderLineId: r.line.id,
        buyerId: r.buyer.id,
        factoryId: r.factory.id,
        qty: 1,
        reason: "DAMAGED",
        fault: "FACTORY",
        note: "Torn",
        status: "AWAITING_HANDOVER",
        factoryDueAt: THURSDAY,
        handoverAgentId: r.agent.id,
        handoverDueAt: lk("2026-11-18T12:00:00"),
      },
    });

    await runSweep(SUNDAY);
    expect(await payouts()).toHaveLength(0);

    // Lapses mid-week; the week already built stays closed.
    await runSweep(lk("2026-11-18T13:00:00"));
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe(
      "LAPSED",
    );
    expect(await payouts()).toHaveLength(0);

    await runSweep(NEXT_SUNDAY);
    const rows = await payouts();
    expect(rows).toHaveLength(1);
    expect(rows[0].weekEnding).toEqual(WEEK_2);
    expect(rows[0].items.map((i) => i.orderLineId)).toEqual([r.line.id]);
  });

  it("nets deductions to zero and carries the rest", async () => {
    const r = await makeReceivedOrder({ receivedAt: THURSDAY });
    await db.payoutDeduction.createMany({
      data: [
        {
          factoryId: r.factory.id,
          kind: "MISSING_ITEM",
          amount: "900",
          ref: "missing:a",
          createdAt: THURSDAY,
        },
        {
          factoryId: r.factory.id,
          kind: "RETURN_COURIER",
          amount: "300",
          ref: "retcourier:b",
          createdAt: THURSDAY,
        },
        // Created after the week ended: waits for the next payout.
        {
          factoryId: r.factory.id,
          kind: "RETURN_COURIER",
          amount: "50",
          ref: "retcourier:c",
          createdAt: SUNDAY,
        },
      ],
    });

    await runSweep(SUNDAY);
    const [p] = await payouts();
    expect(p.gross.toFixed(2)).toBe("1000.00");
    expect(p.deductions.toFixed(2)).toBe("1200.00");
    expect(p.net.toFixed(2)).toBe("0.00");
    const carry = await db.payoutDeduction.findFirstOrThrow({ where: { ref: `carry:${p.id}` } });
    expect(carry).toMatchObject({ kind: "MISSING_ITEM", payoutId: null, factoryId: r.factory.id });
    expect(carry.amount.toFixed(2)).toBe("200.00");
    expect(await db.payoutDeduction.count({ where: { payoutId: p.id } })).toBe(2);
    expect(
      (await db.payoutDeduction.findFirstOrThrow({ where: { ref: "retcourier:c" } })).payoutId,
    ).toBeNull();
  });

  it("holds a line with a missing report waiting for an admin", async () => {
    const r = await makeReceivedOrder({ qty: 2, receivedAt: THURSDAY });
    await db.orderLine.update({ where: { id: r.line.id }, data: { missingReportedQty: 1 } });
    await runSweep(SUNDAY);
    expect(await payouts()).toHaveLength(0);

    // The admin removes the unit; the line is paid next week without it.
    await db.orderLine.update({
      where: { id: r.line.id },
      data: { missingReportedQty: 0, missingQty: 1 },
    });
    await runSweep(NEXT_SUNDAY);
    const [p] = await payouts();
    expect(p.weekEnding).toEqual(WEEK_2);
    expect(p.items.map((i) => i.orderLineId)).toEqual([r.line.id]);
    expect(p.items[0].amount.toFixed(2)).toBe("1000.00");
  });

  it("does not pay a cancelled order that still carries its basket", async () => {
    const r = await makeReceivedOrder({ receivedAt: THURSDAY });
    const basket = await db.basket.create({
      data: { agentId: r.agent.id, factoryId: r.factory.id, status: "AT_AGENT" },
    });
    await db.order.update({
      where: { id: r.order.id },
      data: { status: "CANCELLED", basketId: basket.id },
    });
    await runSweep(SUNDAY);
    expect(await payouts()).toHaveLength(0);
    expect(await db.payoutItem.count()).toBe(0);
  });

  it("running the sweep twice builds one payout and one agent fee credit", async () => {
    const r = await makeReceivedOrder({ qty: 3, receivedAt: THURSDAY });
    await db.orderLine.update({ where: { id: r.line.id }, data: { missingQty: 1 } });
    await runSweep(SUNDAY);
    await runSweep(SUNDAY);
    await Promise.all([runSweep(SUNDAY), runSweep(SUNDAY)]);
    expect(await db.factoryPayout.count()).toBe(1);
    expect(await db.payoutItem.count()).toBe(1);
    const fees = await db.tokenEntry.findMany({ where: { kind: "AGENT_FEE" } });
    expect(fees).toHaveLength(1);
    expect(fees[0]).toMatchObject({
      userId: r.agentUser.id,
      eventKey: `agentfee:${r.agent.id}:${WEEK_1.toISOString()}`,
    });
    expect(fees[0].amount.toFixed(2)).toBe("110.00");
  });

  it("credits agent fees only for orders received within the week", async () => {
    const a = await makeAgent();
    await makeReceivedOrder({ agent: a, receivedAt: THURSDAY });
    await makeReceivedOrder({ agent: a, receivedAt: lk("2026-11-16T09:00:00") });
    await runSweep(SUNDAY);
    const fees = await db.tokenEntry.findMany({ where: { kind: "AGENT_FEE" } });
    expect(fees.map((e) => e.amount.toFixed(2))).toEqual(["55.00"]);
  });
});

describe("max wait", () => {
  it("locks a basket 61 days old with MAX_WAIT and leaves a younger one open", async () => {
    const now = SUNDAY;
    const f = await makeFactory();
    const a = await makeAgent();
    const other = await makeFactory();
    const makeBasket = async (factoryId: string, days: number) => {
      const buyer = await makeBuyer();
      const at = new Date(now.getTime() - days * 86_400_000);
      return db.basket.create({
        data: {
          agentId: a.agent.id,
          factoryId,
          total: "1100",
          firstOrderAt: at,
          orders: {
            create: {
              buyerId: buyer.id,
              agentId: a.agent.id,
              factoryId,
              status: "PAID",
              itemsTotal: "1100",
              courierTotal: "0",
              agentFeeTotal: "55",
              amountDue: "1155",
              holdUntil: at,
              paidAt: at,
            },
          },
        },
      });
    };
    const old = await makeBasket(f.factory.id, 61);
    const young = await makeBasket(other.factory.id, 59);
    await runSweep(now);
    expect(await db.basket.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({
      status: "LOCKED",
      lockReason: "MAX_WAIT",
    });
    expect((await db.basket.findUniqueOrThrow({ where: { id: young.id } })).status).toBe("OPEN");
  });
});

describe("marking a payout paid", () => {
  it("only a CORE admin can, once, with a bank reference", async () => {
    await makeReceivedOrder({ receivedAt: THURSDAY });
    await runSweep(SUNDAY);
    const [p] = await payouts();
    const agentsAdmin = await makeUser("ADMIN", "AGENTS");
    const core = await makeUser("ADMIN", "CORE");
    await expect(markPayoutPaid(agentsAdmin.id, p.id, "BANK-1")).rejects.toThrow();
    await expect(markPayoutPaid(core.id, p.id, "  ")).rejects.toThrow();
    await markPayoutPaid(core.id, p.id, "BANK-1");
    const paid = await db.factoryPayout.findUniqueOrThrow({ where: { id: p.id } });
    expect(paid).toMatchObject({ bankRef: "BANK-1", paidById: core.id });
    expect(paid.paidAt).not.toBeNull();
    await expect(markPayoutPaid(core.id, p.id, "BANK-2")).rejects.toThrow();
  });
});
