import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
const principal = vi.hoisted(() => ({ user: null as null | { id: string } }));
vi.mock("@/server/auth/session", () => ({ getCurrentUser: async () => principal.user }));
import { GET } from "@/app/api/return-photos/[id]/route";
import { db } from "@/server/db";
import {
  fileReturn,
  factoryDecide,
  adminDecide,
  collectReturn,
  lapseReturns,
  markReceived,
  escalateOverdue,
  returnPhotoFor,
  postReturnMessage,
  listReturnMessages,
  adminReturn,
  adminReturns,
  buyerFaultDecide,
  buyerFaultHistory,
  changeToBuyerFault,
  markResold,
  markTakenBack,
} from "@/server/returns";
import { creditAgentFees } from "@/server/payouts";
import { agentFeeKey } from "@/server/agent-fees";
import { markBasketReceived } from "@/server/orders/delivery";
import { removeFactory } from "@/server/quality";
import { tokenBalance } from "@/server/tokens";
import { makeAgent, makeReceivedOrder, makeUser, resetDb, giftPhotoFile } from "./helpers";
import { flushReturnNotices as flushReturnNoticesForTest } from "@/server/returns";
beforeEach(resetDb);
afterAll(() => db.$disconnect());
const HOUR = 3600000;
const receivedAt = new Date("2026-11-01T10:00:00Z");
const now = new Date("2026-11-02T10:00:00Z");
const input = (qty = 1, fault: "FACTORY" | "BUYER" = "FACTORY") => ({
  qty,
  fault,
  reason: fault === "FACTORY" ? ("DAMAGED" as const) : null,
  buyerReason: fault === "BUYER" ? ("SIZE" as const) : null,
  note: "Loose sleeve seam",
  photos: fault === "FACTORY" ? [giftPhotoFile()] : [],
});
async function fixture(qty = 1, collectedAt: Date | null = receivedAt) {
  const o = await makeReceivedOrder({ qty, receivedAt, collectedAt });
  const other = await makeUser(),
    admin = await makeUser("ADMIN", "FACTORY");
  const sales = await db.user.create({
    data: {
      name: "Sales",
      email: `sales-${o.buyer.id}@test.lk`,
      role: "SELLER",
      passwordHash: "x",
      factoryId: o.factory.id,
      factoryRole: "SALES",
    },
  });
  return { ...o, other, admin, sales };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const row = (id: string) => db.returnRequest.findUniqueOrThrow({ where: { id } });
const credits = (id: string) => db.tokenEntry.findMany({ where: { returnId: id, kind: "RETURN" } });
const deductions = () => db.payoutDeduction.findMany();
const money = (v: { toFixed(n: number): string }) => v.toFixed(2);

/** Accepted (by the factory, or the Agents and orders admin for buyer fault) and handed to the
 * order's agent. */
async function collected(f: Fixture, qty = 1, fault: "FACTORY" | "BUYER" = "FACTORY") {
  const r = await fileReturn(f.buyer.id, f.line.id, input(qty, fault), now);
  if (fault === "BUYER")
    await buyerFaultDecide((await makeUser("ADMIN", "AGENTS")).id, r.id, true, "", now);
  else await factoryDecide(f.factory.id, r.id, true, now);
  await collectReturn(f.agentUser.id, r.id, now);
  return r;
}

/** A second basket from the same factory reaches the agent and carries the returns back. */
async function sendBack(f: Fixture, returnIds: string[]) {
  const booker = await makeUser("ADMIN", "AGENTS");
  const basket = await db.basket.create({
    data: {
      agentId: f.agent.id,
      factoryId: f.factory.id,
      status: "WITH_COURIER",
      courier: {
        create: {
          fee: "850",
          driverName: "Sunil",
          driverPhone: "0771234567",
          vehicleNo: "LB-1234",
          bookedById: booker.id,
          givenToDriverAt: now,
        },
      },
    },
  });
  await markBasketReceived(f.agentUser.id, basket.id, returnIds);
  return basket;
}

describe("filing", () => {
  it("files within 48 hours of receipt with a 24h factory deadline", async () => {
    const f = await fixture();
    const at47 = new Date(receivedAt.getTime() + 47 * HOUR);
    const r = await fileReturn(f.buyer.id, f.line.id, input(), at47);
    expect(r).toMatchObject({
      status: "WAITING_FACTORY",
      orderLineId: f.line.id,
    });
    expect(r.factoryDueAt.getTime() - r.createdAt.getTime()).toBe(24 * HOUR);
  });
  it("refuses a return filed at hour 49", async () => {
    const f = await fixture();
    await expect(
      fileReturn(f.buyer.id, f.line.id, input(), new Date(receivedAt.getTime() + 49 * HOUR)),
    ).rejects.toThrow(/48 hours/);
  });
  it("uses the collectHours setting", async () => {
    const f = await fixture();
    await db.settings.update({ where: { id: 1 }, data: { collectHours: 12 } });
    await expect(fileReturn(f.buyer.id, f.line.id, input(), now)).rejects.toThrow();
  });
  it("refuses an uncollected line", async () => {
    const f = await fixture(1, null);
    await expect(fileReturn(f.buyer.id, f.line.id, input(), now)).rejects.toThrow(/collected/i);
  });
  it("refuses an order that is not RECEIVED", async () => {
    const f = await fixture();
    await db.order.update({ where: { id: f.order.id }, data: { status: "PAID" } });
    await expect(fileReturn(f.buyer.id, f.line.id, input(), now)).rejects.toThrow();
  });
  it("allows only the line buyer to file; only owner and SALES decide", async () => {
    const f = await fixture();
    for (const id of [f.other.id, f.factory.id, f.agentUser.id, f.admin.id])
      await expect(fileReturn(id, f.line.id, input(), now)).rejects.toThrow();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await db.user.update({ where: { id: f.sales.id }, data: { factoryRole: "PACKING" } });
    await expect(factoryDecide(f.sales.id, r.id, true, now)).rejects.toThrow();
    await db.user.update({ where: { id: f.sales.id }, data: { factoryRole: "SALES" } });
    await factoryDecide(f.sales.id, r.id, true, now);
    expect((await row(r.id)).status).toBe("AWAITING_HANDOVER");
  });
  it("limits quantity by returned, missing and open returns", async () => {
    const f = await fixture(4);
    await db.orderLine.update({ where: { id: f.line.id }, data: { missingQty: 1 } });
    const a = await fileReturn(f.buyer.id, f.line.id, input(2), now);
    await expect(fileReturn(f.buyer.id, f.line.id, input(2), now)).rejects.toThrow(/Quantity/);
    await factoryDecide(f.factory.id, a.id, true, now);
    await collectReturn(f.agentUser.id, a.id, now);
    expect(await db.orderLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      returnedQty: 2,
      status: "ACTIVE",
    });
    await expect(fileReturn(f.buyer.id, f.line.id, input(2), now)).rejects.toThrow(/Quantity/);
    const b = await fileReturn(f.buyer.id, f.line.id, input(1), now);
    await factoryDecide(f.factory.id, b.id, true, now);
    await collectReturn(f.agentUser.id, b.id, now);
    expect(await db.orderLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      returnedQty: 3,
      status: "RETURNED",
    });
    expect(money(await tokenBalance(f.buyer.id))).toBe("3465.00");
  });
  it("refuses invalid photos, quantities and missing factory photo", async () => {
    const f = await fixture();
    for (const qty of [0, -1, 1.5, 2])
      await expect(fileReturn(f.buyer.id, f.line.id, input(qty), now)).rejects.toThrow();
    await expect(
      fileReturn(f.buyer.id, f.line.id, { ...input(), photos: [] }, now),
    ).rejects.toThrow(/photo/i);
    await expect(
      fileReturn(
        f.buyer.id,
        f.line.id,
        { ...input(), photos: Array.from({ length: 6 }, giftPhotoFile) },
        now,
      ),
    ).rejects.toThrow();
    await expect(
      fileReturn(
        f.buyer.id,
        f.line.id,
        { ...input(), photos: [new File(["x"], "x.pdf", { type: "application/pdf" })] },
        now,
      ),
    ).rejects.toThrow();
  });
});

describe("acceptance and handover", () => {
  it("factory fault: accept tells the buyer the agent; collect gives 1155, a fault and no deduction", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, true, now);
    const accepted = await row(r.id);
    expect(accepted).toMatchObject({ status: "AWAITING_HANDOVER", handoverAgentId: f.agent.id });
    expect(accepted.handoverDueAt!.getTime() - now.getTime()).toBe(7 * 24 * HOUR);
    const notice = await db.notification.findFirstOrThrow({
      where: { userId: f.buyer.id, title: "Return accepted" },
    });
    expect(notice.body).toContain(f.agentUser.name);
    expect(notice.body).toContain(f.agent.address);
    expect(await db.factoryFault.count()).toBe(0);
    expect(await credits(r.id)).toHaveLength(0);

    const results = await Promise.allSettled([
      collectReturn(f.agentUser.id, r.id, now),
      collectReturn(f.agentUser.id, r.id, now),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const done = await row(r.id);
    expect(done.status).toBe("HANDED_OVER");
    expect(done.handedOverAt).not.toBeNull();
    const tokens = await credits(r.id);
    expect(tokens.map((e) => [money(e.amount), e.eventKey])).toEqual([
      ["1155.00", `credit:RETURN:${r.id}`],
    ]);
    expect(await db.factoryFault.findUniqueOrThrow({ where: { returnId: r.id } })).toMatchObject({
      units: 1,
      confirmedBy: "FACTORY",
      confirmedById: f.factory.id,
    });
    // The factory pays the return courier on arrival (DEC-018).
    expect(await deductions()).toHaveLength(0);
    expect(await db.orderLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      returnedQty: 1,
      status: "RETURNED",
    });
  });
  it("buyer fault: collect leaves it WITH_AGENT with no tokens, deduction, fault or returnedQty", async () => {
    const f = await fixture();
    const r = await collected(f, 1, "BUYER");
    expect(await row(r.id)).toMatchObject({ status: "WITH_AGENT" });
    expect(await credits(r.id)).toHaveLength(0);
    expect(money(await tokenBalance(f.buyer.id))).toBe("0.00");
    expect(await deductions()).toHaveLength(0);
    expect(await db.factoryFault.count()).toBe(0);
    expect((await db.orderLine.findUniqueOrThrow({ where: { id: f.line.id } })).returnedQty).toBe(
      0,
    );
  });
  it("multiplies refund and deduction by quantity", async () => {
    const f = await fixture(2);
    const r = await collected(f, 2);
    expect((await credits(r.id)).map((e) => money(e.amount))).toEqual(["2310.00"]);
    expect(await deductions()).toHaveLength(0);
  });
  it("wrong agent, buyer or factory cannot collect, and nothing before acceptance", async () => {
    const f = await fixture();
    const stranger = await makeAgent();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(collectReturn(f.agentUser.id, r.id, now)).rejects.toThrow();
    await factoryDecide(f.factory.id, r.id, true, now);
    for (const id of [stranger.user.id, f.buyer.id, f.factory.id, f.admin.id])
      await expect(collectReturn(id, r.id, now)).rejects.toThrow();
    expect((await row(r.id)).status).toBe("AWAITING_HANDOVER");
    expect(await credits(r.id)).toHaveLength(0);
  });
  it("escalation: after 24h admin decides and acceptance goes to AWAITING_HANDOVER", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    expect(await escalateOverdue(new Date(now.getTime() + 24 * HOUR - 60000))).toBe(0);
    expect((await row(r.id)).status).toBe("WAITING_FACTORY");
    expect(await escalateOverdue(new Date(now.getTime() + 24 * HOUR + 60000))).toBe(1);
    expect((await row(r.id)).status).toBe("WITH_ADMIN");
    await expect(
      factoryDecide(f.factory.id, r.id, true, new Date(now.getTime() + 25 * HOUR)),
    ).rejects.toThrow(/already been decided/);
    const decidedAt = new Date();
    await adminDecide(f.admin.id, r.id, true, "Defect confirmed");
    const after = await row(r.id);
    expect(after).toMatchObject({
      status: "AWAITING_HANDOVER",
      handoverAgentId: f.agent.id,
      adminDecision: true,
    });
    expect(after.handoverDueAt!.getTime()).toBeGreaterThanOrEqual(
      decidedAt.getTime() + 7 * 24 * HOUR - 1000,
    );
    expect(
      (
        await db.notification.findFirstOrThrow({
          where: { userId: f.buyer.id, title: "Return accepted" },
        })
      ).body,
    ).toContain(f.agentUser.name);
    await collectReturn(f.agentUser.id, r.id, now);
    expect(await db.factoryFault.findUniqueOrThrow({ where: { returnId: r.id } })).toMatchObject({
      confirmedBy: "ADMIN",
      confirmedById: f.admin.id,
    });
  });
  it("lapse: after 7 days the return is LAPSED and no tokens are given", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, true, now);
    const due = (await row(r.id)).handoverDueAt!;
    expect(await lapseReturns(new Date(due.getTime() - 60000))).toBe(0);
    expect(await lapseReturns(due)).toBe(1);
    expect(await lapseReturns(due)).toBe(0);
    expect((await row(r.id)).status).toBe("LAPSED");
    await expect(collectReturn(f.agentUser.id, r.id, due)).rejects.toThrow();
    expect(await credits(r.id)).toHaveLength(0);
    expect(await deductions()).toHaveLength(0);
    expect(await db.orderLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({
      returnedQty: 0,
      status: "ACTIVE",
    });
  });
});

describe("send back and receipt", () => {
  it("goes PICKED_UP with the next courier and the factory receives it with restock", async () => {
    const f = await fixture();
    const r = await collected(f);
    await expect(markReceived(f.factory.id, r.id, true)).rejects.toThrow();
    const basket = await sendBack(f, [r.id]);
    expect(await row(r.id)).toMatchObject({ status: "PICKED_UP", sentBackBasketId: basket.id });
    const before = await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } });
    for (const id of [f.other.id, f.agentUser.id, (await makeUser("ADMIN", "AGENTS")).id])
      await expect(markReceived(id, r.id, true)).rejects.toThrow();
    const results = await Promise.allSettled([
      markReceived(f.sales.id, r.id, true, "Seam open"),
      markReceived(f.factory.id, r.id, true),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await row(r.id)).toMatchObject({ status: "COMPLETED" });
    expect((await row(r.id)).receivedAt).not.toBeNull();
    expect((await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } })).available).toBe(
      before.available + 1,
    );
    expect(await credits(r.id)).toHaveLength(1);
  });
  it("receipt without restock leaves stock alone", async () => {
    const f = await fixture();
    const r = await collected(f, 1);
    await sendBack(f, [r.id]);
    const before = await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } });
    await markReceived(f.factory.id, r.id, false);
    expect((await row(r.id)).status).toBe("COMPLETED");
    expect(await db.variant.findUniqueOrThrow({ where: { id: f.variant.id } })).toEqual(before);
  });
});

describe("decisions", () => {
  it("keeps a stored 48h due time", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await db.returnRequest.update({
      where: { id: r.id },
      data: { factoryDueAt: new Date(now.getTime() + 48 * HOUR) },
    });
    expect(await escalateOverdue(new Date(now.getTime() + 25 * HOUR))).toBe(0);
    expect((await row(r.id)).status).toBe("WAITING_FACTORY");
  });
  it("allows the factory exactly at its 24-hour boundary and refuses it one minute later", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(
      factoryDecide(f.factory.id, r.id, true, new Date(now.getTime() + 24 * HOUR + 60000)),
    ).rejects.toThrow(/already been decided/);
    await factoryDecide(f.factory.id, r.id, true, new Date(now.getTime() + 24 * HOUR));
    expect((await row(r.id)).status).toBe("AWAITING_HANDOVER");
  });
  it("notifies FACTORY and CORE admins at filing and permits view-only admin access", async () => {
    const f = await fixture();
    const core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM"),
      warehouse = await makeUser("ADMIN");
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    for (const id of [f.admin.id, core.id]) {
      expect(
        await db.notification.count({ where: { userId: id, title: "Return requested" } }),
      ).toBe(1);
      expect(await adminReturn(id, r.id)).toMatchObject({ id: r.id, status: "WAITING_FACTORY" });
      expect((await adminReturns(id)).map((x) => x.id)).toContain(r.id);
      await expect(adminDecide(id, r.id, true, "Review")).rejects.toThrow(
        "This return has already been decided",
      );
    }
    for (const id of [premium.id, warehouse.id])
      expect(
        await db.notification.count({ where: { userId: id, title: "Return requested" } }),
      ).toBe(0);
  });
  it("requires a factory refusal reason and automatically notifies admins", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(factoryDecide(f.sales.id, r.id, false, now)).rejects.toThrow(/reason/i);
    await expect(factoryDecide(f.sales.id, r.id, false, now, "x".repeat(1001))).rejects.toThrow(
      /reason/i,
    );
    await factoryDecide(f.sales.id, r.id, false, now, "Please review the seam");
    expect(await row(r.id)).toMatchObject({
      status: "WITH_ADMIN",
      factoryNote: "Please review the seam",
    });
    expect(
      await db.notification.count({ where: { userId: f.admin.id, title: "Return needs review" } }),
    ).toBe(1);
    expect(await credits(r.id)).toHaveLength(0);
  });
  it("escalates silence through sweep and refuses late factory decisions", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    const late = new Date(now.getTime() + 48 * HOUR + 1);
    const { runSweep } = await import("@/server/sweep");
    await runSweep(late);
    expect((await row(r.id)).status).toBe("WITH_ADMIN");
    await expect(factoryDecide(f.factory.id, r.id, true, late)).rejects.toThrow(
      /already been decided/,
    );
  });
  it("serializes factory decision racing timeout", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await Promise.allSettled([
      factoryDecide(f.factory.id, r.id, true, now),
      escalateOverdue(new Date(now.getTime() + 48 * HOUR + 1)),
    ]);
    const state = (await row(r.id)).status;
    expect(["AWAITING_HANDOVER", "WITH_ADMIN"]).toContain(state);
    expect(
      await db.notification.count({
        where: { userId: f.buyer.id, title: { in: ["Return accepted", "Return sent to admin"] } },
      }),
    ).toBe(1);
  });
  it("rejects, serializes final admin decisions; no early credit", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
    const results = await Promise.allSettled([
      adminDecide(f.admin.id, r.id, true, "Defect confirmed"),
      adminDecide(f.admin.id, r.id, false, "Rejected"),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((x) => x.status === "rejected");
    expect(loser?.status === "rejected" && loser.reason.message).toBe(
      "This return has already been decided",
    );
    expect(await credits(r.id)).toHaveLength(0);
    await expect(adminDecide(f.admin.id, r.id, true, "Again")).rejects.toThrow();
  });
  it("refuses non-quality admin decisions; a rejection frees the quantity", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review needed");
    for (const actor of [
      f.buyer,
      f.factory,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN"),
    ])
      await expect(adminDecide(actor.id, r.id, true, "Approve")).rejects.toThrow();
    await adminDecide(f.admin.id, r.id, false, "Not eligible");
    expect((await row(r.id)).status).toBe("REJECTED");
    expect(await credits(r.id)).toHaveLength(0);
    expect((await fileReturn(f.buyer.id, f.line.id, input(), now)).status).toBe("WAITING_FACTORY");
  });
});

describe("factory removal", () => {
  it("moves waiting returns to admin and denies factory access", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    const photo = await db.returnPhoto.findFirstOrThrow({ where: { returnId: r.id } });
    await removeFactory(f.admin.id, f.factory.id, "Repeated defects", false);
    expect((await row(r.id)).status).toBe("WITH_ADMIN");
    await expect(factoryDecide(f.sales.id, r.id, true, now)).rejects.toThrow();
    expect(await returnPhotoFor(f.sales.id, photo.id)).toBeNull();
  });
  it("keeps accepted returns moving; an admin receives them for a removed factory", async () => {
    const f = await fixture(2),
      waiting = await fileReturn(f.buyer.id, f.line.id, input(1), now);
    await factoryDecide(f.factory.id, waiting.id, true, now);
    const handed = await collected(f, 1);
    await removeFactory(f.admin.id, f.factory.id, "Repeated defects", false);
    expect((await row(waiting.id)).status).toBe("AWAITING_HANDOVER");
    expect((await row(handed.id)).status).toBe("HANDED_OVER");
    await collectReturn(f.agentUser.id, waiting.id, now);
    expect(await credits(waiting.id)).toHaveLength(1);
    await sendBack(f, [handed.id]);
    await expect(markReceived(f.factory.id, handed.id, true)).rejects.toThrow();
    await markReceived(f.admin.id, handed.id, false);
    expect((await row(handed.id)).status).toBe("COMPLETED");
  });
});

describe("messages and photos", () => {
  it("keeps admin-factory messages private, readable after decision, and deduplicates unread notices", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await expect(postReturnMessage(f.sales.id, r.id, "Early")).rejects.toThrow();
    await factoryDecide(f.factory.id, r.id, false, now, "Review seam");
    await Promise.all([
      postReturnMessage(f.sales.id, r.id, "Please inspect"),
      postReturnMessage(f.sales.id, r.id, "Sleeve seam"),
    ]);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New return message", readAt: null },
      }),
    ).toBe(1);
    // The two posts race, so their order is not fixed.
    expect((await listReturnMessages(f.admin.id, r.id)).map((m) => m.body).sort()).toEqual([
      "Please inspect",
      "Sleeve seam",
    ]);
    expect(
      await db.notification.count({
        where: { userId: f.admin.id, title: "New return message", readAt: null },
      }),
    ).toBe(0);
    await postReturnMessage(f.admin.id, r.id, "I will review");
    expect(
      (await listReturnMessages(f.sales.id, r.id)).some((m) => m.body === "I will review"),
    ).toBe(true);
    const packing = await db.user.create({
      data: {
        role: "SELLER",
        name: "Packing",
        email: "return-packing@test.lk",
        passwordHash: "x",
        factoryId: f.factory.id,
        factoryRole: "PACKING",
      },
    });
    for (const actor of [
      f.buyer,
      f.other,
      f.agentUser,
      packing,
      await makeUser("ADMIN", "PREMIUM"),
      await makeUser("ADMIN"),
    ]) {
      await expect(listReturnMessages(actor.id, r.id)).rejects.toThrow();
      await expect(postReturnMessage(actor.id, r.id, "Secret")).rejects.toThrow();
    }
    await adminDecide(f.admin.id, r.id, false, "Not eligible");
    expect(await listReturnMessages(f.sales.id, r.id)).toHaveLength(3);
    await expect(postReturnMessage(f.admin.id, r.id, "Late")).rejects.toThrow();
  });
  it("validates message length and serializes the per-user rate limit", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Review");
    for (const text of [" ", "x".repeat(1001)])
      await expect(postReturnMessage(f.sales.id, r.id, text)).rejects.toThrow();
    const results = await Promise.allSettled(
      Array.from({ length: 11 }, (_, i) => postReturnMessage(f.sales.id, r.id, `Message ${i}`)),
    );
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(10);
    expect(await listReturnMessages(f.admin.id, r.id)).toHaveLength(10);
  });
  it("scopes private photos to buyer, own owner/SALES and FACTORY/CORE admins", async () => {
    const f = await fixture(),
      r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    const photo = await db.returnPhoto.findFirstOrThrow({ where: { returnId: r.id } });
    const core = await makeUser("ADMIN", "CORE"),
      premium = await makeUser("ADMIN", "PREMIUM");
    const get = async (id: string | null) => {
      principal.user = id ? { id } : null;
      return GET(new Request("http://localhost/api/return-photos/" + photo.id), {
        params: Promise.resolve({ id: photo.id }),
      });
    };
    expect((await get(null)).status).toBe(404);
    for (const id of [f.buyer.id, f.factory.id, f.sales.id, f.admin.id, core.id]) {
      const response = await get(id);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toContain("no-store");
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    }
    for (const id of [f.other.id, premium.id, f.agentUser.id, (await makeUser("ADMIN")).id])
      expect((await get(id)).status).toBe(404);
    await db.user.update({ where: { id: f.sales.id }, data: { factoryRole: "PACKING" } });
    expect(await returnPhotoFor(f.sales.id, photo.id)).toBeNull();
  });
});

describe("buyer-fault returns (DEC-017)", () => {
  const agentsAdmin = () => makeUser("ADMIN", "AGENTS");
  it("files as BUYER_REQUESTED with a reason and no photo; only AGENTS admins are told", async () => {
    const f = await fixture();
    const agents = await agentsAdmin();
    const r = await fileReturn(f.buyer.id, f.line.id, input(1, "BUYER"), now);
    await flushReturnNoticesForTest();
    expect(await row(r.id)).toMatchObject({
      status: "BUYER_REQUESTED",
      fault: "BUYER",
      buyerReason: "SIZE",
      reason: null,
    });
    const told = await db.notification.findMany({ select: { userId: true, href: true } });
    expect(told).toEqual([{ userId: agents.id, href: "/admin/agents/returns" }]);
    await expect(
      fileReturn(f.buyer.id, f.line.id, { ...input(1, "BUYER"), buyerReason: null }, now),
    ).rejects.toThrow();
  });
  it("keeps the unit out of a second return for good", async () => {
    const f = await fixture();
    const r = await collected(f, 1, "BUYER");
    await markResold(f.agentUser.id, r.id, now);
    await expect(fileReturn(f.buyer.id, f.line.id, input(1), now)).rejects.toThrow(/Quantity/);
  });
  it("AGENTS admin accepts with a 2-day handover; refusal closes it", async () => {
    const f = await fixture(2);
    const agents = await agentsAdmin();
    const a = await fileReturn(f.buyer.id, f.line.id, input(1, "BUYER"), now);
    await buyerFaultDecide(agents.id, a.id, true, "", now);
    const accepted = await row(a.id);
    expect(accepted).toMatchObject({ status: "AWAITING_HANDOVER", handoverAgentId: f.agent.id });
    expect(accepted.handoverDueAt!.getTime() - now.getTime()).toBe(2 * 24 * HOUR);
    expect(
      await db.notification.count({
        where: { userId: f.agentUser.id, title: "Return to collect" },
      }),
    ).toBe(1);
    const b = await fileReturn(f.buyer.id, f.line.id, input(1, "BUYER"), now);
    await buyerFaultDecide(agents.id, b.id, false, "Worn", now);
    expect((await row(b.id)).status).toBe("REJECTED");
    await expect(buyerFaultDecide(agents.id, b.id, true, "", now)).rejects.toThrow();
  });
  it("only an AGENTS admin decides; the factory cannot", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(1, "BUYER"), now);
    for (const id of [f.admin.id, (await makeUser("ADMIN", "CORE")).id, f.buyer.id])
      await expect(buyerFaultDecide(id, r.id, true, "", now)).rejects.toThrow();
    await expect(factoryDecide(f.factory.id, r.id, true, now)).rejects.toThrow();
    await expect(adminDecide(f.admin.id, r.id, true, "ok")).rejects.toThrow();
  });
  it("lapses as not brought after 2 days, with no tokens", async () => {
    const f = await fixture();
    const r = await fileReturn(f.buyer.id, f.line.id, input(1, "BUYER"), now);
    await buyerFaultDecide((await agentsAdmin()).id, r.id, true, "", now);
    expect(await lapseReturns(new Date(now.getTime() + 2 * 24 * HOUR - 1))).toBe(0);
    expect(await lapseReturns(new Date(now.getTime() + 2 * 24 * HOUR))).toBe(1);
    expect((await row(r.id)).status).toBe("LAPSED");
    expect(await credits(r.id)).toHaveLength(0);
  });
  it("the handover agent marks it sold or taken back, once", async () => {
    const f = await fixture(2);
    const a = await collected(f, 1, "BUYER");
    const stranger = await makeAgent();
    await expect(markResold(stranger.user.id, a.id, now)).rejects.toThrow();
    await markResold(f.agentUser.id, a.id, now);
    expect(await row(a.id)).toMatchObject({ status: "SOLD" });
    await expect(markTakenBack(f.agentUser.id, a.id, now)).rejects.toThrow();
    const b = await collected(f, 1, "BUYER");
    await markTakenBack(f.agentUser.id, b.id, now);
    expect((await row(b.id)).takenBackAt).not.toBeNull();
  });
  it("never goes back to the factory and the factory never sees it", async () => {
    const f = await fixture();
    const r = await collected(f, 1, "BUYER");
    await expect(sendBack(f, [r.id])).rejects.toThrow();
    expect((await row(r.id)).status).toBe("WITH_AGENT");
    const { factoryReturns } = await import("@/server/returns");
    expect(await factoryReturns(f.factory.id)).toHaveLength(0);
    expect(await adminReturns(f.admin.id)).toHaveLength(0);
  });
  it("Factory admin changes a factory fault to buyer fault: no fault, AGENTS decide", async () => {
    const f = await fixture();
    const agents = await agentsAdmin();
    const r = await fileReturn(f.buyer.id, f.line.id, input(), now);
    await factoryDecide(f.factory.id, r.id, false, now, "Worn");
    await expect(changeToBuyerFault(agents.id, r.id, "Worn")).rejects.toThrow();
    await changeToBuyerFault(f.admin.id, r.id, "Worn twice", now);
    expect(await row(r.id)).toMatchObject({ status: "BUYER_REQUESTED", fault: "BUYER" });
    expect(
      await db.notification.count({
        where: { userId: agents.id, title: "Buyer return requested" },
      }),
    ).toBe(1);
    await buyerFaultDecide(agents.id, r.id, true, "", now);
    await collectReturn(f.agentUser.id, r.id, now);
    expect(await db.factoryFault.count()).toBe(0);
    expect(await credits(r.id)).toHaveLength(0);
  });
  it("photos: AGENTS and CORE admins see them, the factory does not", async () => {
    const f = await fixture();
    const r = await fileReturn(
      f.buyer.id,
      f.line.id,
      { ...input(1, "BUYER"), photos: [giftPhotoFile()] },
      now,
    );
    const photo = await db.returnPhoto.findFirstOrThrow({ where: { returnId: r.id } });
    expect(await returnPhotoFor(f.buyer.id, photo.id)).not.toBeNull();
    expect(await returnPhotoFor((await agentsAdmin()).id, photo.id)).not.toBeNull();
    expect(await returnPhotoFor((await makeUser("ADMIN", "CORE")).id, photo.id)).not.toBeNull();
    expect(await returnPhotoFor(f.factory.id, photo.id)).toBeNull();
    expect(await returnPhotoFor(f.admin.id, photo.id)).toBeNull();
  });
  it("history counts reasons per product for AGENTS and CORE only", async () => {
    const f = await fixture(3);
    for (const buyerReason of ["SIZE", "SIZE", "MATERIAL"] as const)
      await fileReturn(f.buyer.id, f.line.id, { ...input(1, "BUYER"), buyerReason }, now);
    const { products, rows } = await buyerFaultHistory((await agentsAdmin()).id);
    expect(rows).toHaveLength(3);
    expect(products).toEqual([
      expect.objectContaining({ total: 3, counts: { SIZE: 2, MATERIAL: 1 } }),
    ]);
    await expect(buyerFaultHistory((await makeUser("ADMIN", "CORE")).id)).resolves.toBeTruthy();
    for (const id of [f.admin.id, f.factory.id, f.buyer.id])
      await expect(buyerFaultHistory(id)).rejects.toThrow();
  });
});

describe("factory-fault agent fee take-back (DEC-018)", () => {
  const sunday = new Date("2026-11-08T10:00:00Z");
  it("before the fee week is paid: no take-back, the fee leaves the unit out", async () => {
    const f = await fixture(2);
    await collected(f, 1);
    expect(await db.agentFeeClawback.count()).toBe(0);
    await creditAgentFees(sunday);
    const fee = await db.tokenEntry.findUniqueOrThrow({
      where: { eventKey: agentFeeKey(f.agent.id, receivedAt) },
    });
    expect(money(fee.amount)).toBe("55.00");
  });
  it("after the fee week is paid: the 55 comes off the agent's tokens", async () => {
    const f = await fixture();
    await creditAgentFees(sunday);
    expect(money(await tokenBalance(f.agentUser.id))).toBe("55.00");
    const r = await collected(f, 1);
    expect(money(await tokenBalance(f.agentUser.id))).toBe("0.00");
    expect(
      await db.agentFeeClawback.findUniqueOrThrow({ where: { returnId: r.id } }),
    ).toMatchObject({ agentId: f.agent.id });
    expect(money(await tokenBalance(f.buyer.id))).toBe("1155.00");
  });
  it("a short balance stops at 0 and the rest comes off the next weekly fee", async () => {
    const f = await fixture();
    await creditAgentFees(sunday);
    // The agent spent most of its fee.
    await db.tokenEntry.create({
      data: {
        userId: f.agentUser.id,
        amount: "-35",
        kind: "TRANSFER_OUT",
        eventKey: "spent:" + f.agentUser.id,
        note: "Sent",
      },
    });
    const r = await collected(f, 1);
    expect(money(await tokenBalance(f.agentUser.id))).toBe("0.00");
    const row1 = await db.agentFeeClawback.findUniqueOrThrow({ where: { returnId: r.id } });
    expect(money(row1.left)).toBe("35.00");
    // Next week the agent receives another order and earns 55.
    const later = new Date("2026-11-10T10:00:00Z");
    await makeReceivedOrder({ receivedAt: later, agent: { agent: f.agent, user: f.agentUser } });
    await creditAgentFees(new Date("2026-11-15T10:00:00Z"));
    expect(money(await tokenBalance(f.agentUser.id))).toBe("20.00");
    expect(
      money((await db.agentFeeClawback.findUniqueOrThrow({ where: { returnId: r.id } })).left),
    ).toBe("0.00");
  });
});
