import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { tokenBalance } from "@/server/tokens";
import { setCartItem } from "@/server/orders/cart";
import { CheckoutError, startCheckout } from "@/server/orders/checkout";
import { handOver } from "@/server/orders/handover";
import { handleNotice } from "@/server/payments/notice";
import { signNotice } from "@/server/payments/demo";
import { applyAsAgent } from "@/server/agents/apply";
import { decideAgent, liftSuspension, recordLoss, suspendAgent } from "@/server/agents/admin";
import { agentDepositPaid, startDeposit } from "@/server/agents/deposit";
import { closeLeavingAgents, collectHeldReturns, requestLeave } from "@/server/agents/leave";
import { cancelOrder } from "@/server/orders/baskets";
import { lockBasketSlot } from "@/server/orders/locks";
import { factoryDecide, fileReturn } from "@/server/returns";
import { CartError } from "@/server/errors";
import { setHours } from "@/server/agents/hours";
import { liveAgents } from "@/server/agents/live";
import {
  fundTokens,
  giftPhotoFile,
  makeAgent,
  makeBuyer,
  makeFactory,
  makeReceivedOrder,
  makeUser,
  resetDb,
  slipFile,
} from "./helpers";

const MERCHANT = "1200000";
const SECRET = "test-secret";

beforeEach(async () => {
  await resetDb();
  vi.stubEnv("PAYMENT_GATEWAY", "demo");
  vi.stubEnv("DEMO_MERCHANT_ID", MERCHANT);
  vi.stubEnv("DEMO_MERCHANT_SECRET", SECRET);
});
afterAll(() => db.$disconnect());

const money = (v: { toFixed(n: number): string }) => v.toFixed(2);
/** About 1.5 km north of the default pin (6.9271, 79.8612). */
const NEAR_LAT = 6.9271 + 1.5 / 111.32;
/** About 5 km north. */
const FAR_LAT = 6.9271 + 5 / 111.32;

function noticeBody(attemptId: string, amount: string, paymentId = "pay_1") {
  const fields = {
    merchant_id: MERCHANT,
    order_id: attemptId,
    payment_id: paymentId,
    payhere_amount: amount,
    payhere_currency: "LKR",
    status_code: "2",
  };
  return new URLSearchParams({ ...fields, md5sig: signNotice(fields, SECRET) }).toString();
}
const send = (raw: string) => handleNotice(raw, new Headers());

function applicationForm(lat: number, lng = 79.8612) {
  const fd = new FormData();
  fd.set("address", "12 Temple Rd");
  fd.set("city", "Colombo");
  fd.set("lat", String(lat));
  fd.set("lng", String(lng));
  fd.set("nic", slipFile());
  fd.set("photo", giftPhotoFile());
  fd.append("storagePhotos", giftPhotoFile());
  fd.append("storagePhotos", slipFile());
  return fd;
}

async function applicant(lat = FAR_LAT) {
  const user = await makeUser("CUSTOMER");
  await applyAsAgent(user.id, applicationForm(lat));
  const agent = await db.agent.findUniqueOrThrow({ where: { userId: user.id } });
  return { user, agent };
}

/** A LIVE agent who paid the 200,000 deposit. */
async function paidAgent() {
  const a = await makeAgent();
  await db.agent.update({
    where: { id: a.agent.id },
    data: { depositPaidAt: new Date(), depositAmount: "200000" },
  });
  return a;
}

const agentsAdmin = () => makeUser("ADMIN", "AGENTS");

/** An OPEN basket at the agent holding one PAID order, paid in full with tokens. */
async function openBasket(agentId: string, f: Awaited<ReturnType<typeof makeFactory>>) {
  const buyer = await makeBuyer();
  await fundTokens(buyer.id, "1160");
  await setCartItem(buyer.id, f.variant.id, 1);
  await startCheckout(buyer.id, { agentId, tokens: "1160", requestKey: "open" });
  return db.basket.findFirstOrThrow({
    where: { agentId, factoryId: f.factory.id, status: "OPEN" },
  });
}

describe("applying", () => {
  it("stores the documents and pin as APPLIED; one application per user", async () => {
    const { user, agent } = await applicant();
    expect(agent.status).toBe("APPLIED");
    expect(agent.nicKey).toMatch(/^agents\//);
    expect(agent.photoKey).toMatch(/^agents\//);
    expect(agent.storagePhotoKeys).toHaveLength(2);
    expect(agent.address).toBe("12 Temple Rd");
    await expect(applyAsAgent(user.id, applicationForm(FAR_LAT))).rejects.toThrow();
  });

  it("refuses an application without the NIC or storage photos", async () => {
    const user = await makeUser("CUSTOMER");
    const noNic = applicationForm(FAR_LAT);
    noNic.delete("nic");
    await expect(applyAsAgent(user.id, noNic)).rejects.toThrow();
    const noStorage = applicationForm(FAR_LAT);
    noStorage.delete("storagePhotos");
    await expect(applyAsAgent(user.id, noStorage)).rejects.toThrow();
    expect(await db.agent.count()).toBe(0);
  });

  it("a rejected applicant can apply again", async () => {
    const { user, agent } = await applicant();
    await decideAgent((await agentsAdmin()).id, agent.id, false, "Storage too small");
    const rejected = await db.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect([rejected.status, rejected.statusNote]).toEqual(["REJECTED", "Storage too small"]);
    await applyAsAgent(user.id, applicationForm(FAR_LAT));
    const again = await db.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect([again.status, again.statusNote]).toEqual(["APPLIED", null]);
  });
});

describe("deciding", () => {
  it("clash: approving one 1.5 km from a live agent is refused", async () => {
    await makeAgent({ status: "LIVE" });
    const { agent } = await applicant(NEAR_LAT);
    const admin = await agentsAdmin();
    await expect(decideAgent(admin.id, agent.id, true, "")).rejects.toThrow(/2 km|agent/i);
    expect((await db.agent.findUniqueOrThrow({ where: { id: agent.id } })).status).toBe("APPLIED");
    // A rejected or left neighbour does not block.
    const far = await applicant(FAR_LAT);
    await decideAgent(admin.id, far.agent.id, true, "");
    expect((await db.agent.findUniqueOrThrow({ where: { id: far.agent.id } })).status).toBe(
      "APPROVED",
    );
  });

  it("only an AGENTS admin can decide", async () => {
    const { agent } = await applicant();
    const factoryAdmin = await makeUser("ADMIN", "FACTORY");
    const core = await makeUser("ADMIN", "CORE");
    const buyer = await makeUser("CUSTOMER");
    const locked = await agentsAdmin();
    await db.user.update({ where: { id: locked.id }, data: { locked: true } });
    for (const u of [factoryAdmin, core, buyer, locked])
      await expect(decideAgent(u.id, agent.id, true, "")).rejects.toThrow();
    expect((await db.agent.findUniqueOrThrow({ where: { id: agent.id } })).status).toBe("APPLIED");
    await decideAgent((await agentsAdmin()).id, agent.id, true, "");
    expect((await db.agent.findUniqueOrThrow({ where: { id: agent.id } })).status).toBe("APPROVED");
  });
});

describe("deposit", () => {
  async function approved() {
    const a = await applicant();
    await decideAgent((await agentsAdmin()).id, a.agent.id, true, "");
    await setHours(a.user.id, [{ weekday: 1, opensAt: 540, closesAt: 1080 }]);
    return a;
  }

  it("an approved applicant sets opening hours before the deposit can start", async () => {
    const a = await applicant();
    await decideAgent((await agentsAdmin()).id, a.agent.id, true, "");
    await expect(startDeposit(a.user.id)).rejects.toThrow("opening hours");
    expect(await db.paymentAttempt.count({ where: { agentId: a.agent.id } })).toBe(0);
    await setHours(a.user.id, [{ weekday: 1, opensAt: 540, closesAt: 1080 }]);
    await startDeposit(a.user.id);
    expect(await db.paymentAttempt.count({ where: { agentId: a.agent.id } })).toBe(1);
  });

  it("the amount is the deposit plus the gateway fee", async () => {
    const { user, agent } = await approved();
    const r = await startDeposit(user.id);
    expect(r.redirectUrl).toBeTruthy();
    const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { agentId: agent.id } });
    expect([attempt.purpose, attempt.buyerId, money(attempt.amount)]).toEqual([
      "DEPOSIT",
      null,
      "206825.23",
    ]);
  });

  it("refuses an agent that is not APPROVED", async () => {
    const { user } = await applicant();
    await expect(startDeposit(user.id)).rejects.toThrow();
    const live = await makeAgent();
    await expect(startDeposit(live.user.id)).rejects.toThrow();
  });

  it("a paid notice sets LIVE and role AGENT; a late deposit credits LATE_PAYMENT", async () => {
    const { user, agent } = await approved();
    await startDeposit(user.id);
    await startDeposit(user.id);
    const [first, second] = await db.paymentAttempt.findMany({
      where: { agentId: agent.id },
      orderBy: { createdAt: "asc" },
    });
    expect(await send(noticeBody(first.id, money(first.amount), "pay_1"))).toEqual({
      status: 200,
    });
    const live = await db.agent.findUniqueOrThrow({
      where: { id: agent.id },
      include: { user: true },
    });
    expect([live.status, live.user.role, money(live.depositAmount)]).toEqual([
      "LIVE",
      "AGENT",
      "200000.00",
    ]);
    expect(live.depositPaidAt).not.toBeNull();
    expect(money(await tokenBalance(user.id))).toBe("0.00");

    await send(noticeBody(second.id, money(second.amount), "pay_2"));
    const late = await db.paymentAttempt.findUniqueOrThrow({ where: { id: second.id } });
    expect(late.status).toBe("LATE_PAID");
    const credit = await db.tokenEntry.findUniqueOrThrow({
      where: { eventKey: `late:${second.id}:pay_2` },
    });
    expect([credit.userId, credit.kind, money(credit.amount)]).toEqual([
      user.id,
      "LATE_PAYMENT",
      "206825.23",
    ]);
  });

  it("a deposit notice with no opening hours records the deposit but does not go LIVE", async () => {
    const { user, agent } = await approved();
    await startDeposit(user.id);
    const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { agentId: agent.id } });
    // setHours refuses an empty list; clear the rows directly to reach the guard.
    await db.agentHours.deleteMany({ where: { agentId: agent.id } });
    expect(await send(noticeBody(attempt.id, money(attempt.amount)))).toEqual({ status: 200 });
    const held = await db.agent.findUniqueOrThrow({
      where: { id: agent.id },
      include: { user: true },
    });
    expect([held.status, held.user.role, money(held.depositAmount)]).toEqual([
      "APPROVED",
      "CUSTOMER",
      "200000.00",
    ]);
    expect(held.depositPaidAt).not.toBeNull();
    expect((await db.paymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } })).status).toBe(
      "SUCCEEDED",
    );
    expect(money(await tokenBalance(user.id))).toBe("0.00");
    expect(await liveAgents()).toHaveLength(0);
    await expect(startDeposit(user.id)).rejects.toThrow("not due");

    await setHours(user.id, [{ weekday: 2, opensAt: 540, closesAt: 1080 }]);
    const live = await db.agent.findUniqueOrThrow({
      where: { id: agent.id },
      include: { user: true },
    });
    expect([live.status, live.user.role, money(live.depositAmount)]).toEqual([
      "LIVE",
      "AGENT",
      "200000.00",
    ]);
  });

  it("the deposit returned on leaving is the one charged, not a later setting", async () => {
    const { user, agent } = await approved();
    await startDeposit(user.id);
    const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { agentId: agent.id } });
    expect(money(attempt.depositPrincipal!)).toBe("200000.00");
    await db.settings.update({ where: { id: 1 }, data: { agentDeposit: "250000" } });
    await send(noticeBody(attempt.id, money(attempt.amount)));
    const live = await db.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect([live.status, money(live.depositAmount)]).toEqual(["LIVE", "200000.00"]);
    await requestLeave(user.id);
    expect(await closeLeavingAgents(new Date())).toBe(1);
    expect(money(await tokenBalance(user.id))).toBe("200000.00");
  });

  it("agentDepositPaid returns false when the agent is no longer APPROVED", async () => {
    const { user, agent } = await approved();
    await startDeposit(user.id);
    const attempt = await db.paymentAttempt.findFirstOrThrow({ where: { agentId: agent.id } });
    await db.agent.update({ where: { id: agent.id }, data: { status: "REJECTED" } });
    expect(await db.$transaction((tx) => agentDepositPaid(tx, attempt.id))).toBe(false);
    await send(noticeBody(attempt.id, money(attempt.amount)));
    expect(money(await tokenBalance(user.id))).toBe("206825.23");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe("CUSTOMER");
  });
});

describe("hours", () => {
  it("replaces the agent's hours and refuses open >= close", async () => {
    const { user, agent } = await makeAgent();
    await setHours(user.id, [
      { weekday: 1, opensAt: 540, closesAt: 1020 },
      { weekday: 2, opensAt: 540, closesAt: 1020 },
    ]);
    await setHours(user.id, [{ weekday: 3, opensAt: 600, closesAt: 900 }]);
    const rows = await db.agentHours.findMany({ where: { agentId: agent.id } });
    expect(rows.map((r) => [r.weekday, r.opensAt, r.closesAt])).toEqual([[3, 600, 900]]);
    await expect(
      setHours(user.id, [{ weekday: 4, opensAt: 900, closesAt: 900 }]),
    ).rejects.toThrow();
    await expect(
      setHours(user.id, [
        { weekday: 4, opensAt: 500, closesAt: 900 },
        { weekday: 4, opensAt: 950, closesAt: 1000 },
      ]),
    ).rejects.toThrow();
    expect(await db.agentHours.count({ where: { agentId: agent.id } })).toBe(1);
  });

  it("refuses an empty list in every status and keeps the hours", async () => {
    const pending = await applicant();
    const approvedOne = await applicant(FAR_LAT + 0.1);
    await decideAgent((await agentsAdmin()).id, approvedOne.agent.id, true, "");
    await setHours(approvedOne.user.id, [{ weekday: 1, opensAt: 540, closesAt: 1080 }]);
    const live = await makeAgent();
    await setHours(live.user.id, [{ weekday: 1, opensAt: 540, closesAt: 1080 }]);
    for (const status of ["SUSPENDED", "LEAVING", "LIVE"] as const) {
      await db.agent.update({ where: { id: live.agent.id }, data: { status } });
      await expect(setHours(live.user.id, [])).rejects.toThrow("Open on at least one day");
    }
    for (const u of [pending.user, approvedOne.user])
      await expect(setHours(u.id, [])).rejects.toThrow("Open on at least one day");
    expect(await db.agentHours.count({ where: { agentId: live.agent.id } })).toBe(1);
    expect(await db.agentHours.count({ where: { agentId: approvedOne.agent.id } })).toBe(1);
  });
});

describe("suspension", () => {
  it("locks OPEN baskets and refuses checkout; lifting makes the agent LIVE again", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const basket = await openBasket(agent.id, f);
    const admin = await agentsAdmin();
    await suspendAgent(admin.id, agent.id, "Complaints");
    const suspended = await db.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect([suspended.status, suspended.statusNote]).toEqual(["SUSPENDED", "Complaints"]);
    expect(suspended.suspendedAt).not.toBeNull();
    const locked = await db.basket.findUniqueOrThrow({ where: { id: basket.id } });
    expect([locked.status, locked.lockReason]).toEqual(["LOCKED", "SUSPENDED"]);
    expect((await liveAgents()).map((a) => a.id)).not.toContain(agent.id);

    const buyer = await makeBuyer();
    await setCartItem(buyer.id, f.variant.id, 1);
    await expect(
      startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k" }),
    ).rejects.toBeInstanceOf(CheckoutError);

    await liftSuspension(admin.id, agent.id);
    const lifted = await db.agent.findUniqueOrThrow({ where: { id: agent.id } });
    expect([lifted.status, lifted.suspendedAt]).toEqual(["LIVE", null]);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe("LOCKED");
    expect((await liveAgents()).map((a) => a.id)).toContain(agent.id);
  });

  it("a payment arriving for a suspended agent locks its new basket", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const buyer = await makeBuyer();
    await setCartItem(buyer.id, f.variant.id, 1);
    const r = await startCheckout(buyer.id, { agentId: agent.id, tokens: "0", requestKey: "k" });
    await suspendAgent((await agentsAdmin()).id, agent.id, "Complaints");
    const attempt = await db.paymentAttempt.findUniqueOrThrow({ where: { id: r.attemptId! } });
    await send(noticeBody(attempt.id, money(attempt.amount)));
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderIds[0] } });
    const basket = await db.basket.findUniqueOrThrow({ where: { id: order.basketId! } });
    expect([order.status, basket.status, basket.lockReason]).toEqual([
      "PAID",
      "LOCKED",
      "SUSPENDED",
    ]);
  });

  it("suspend does not deadlock with a pickup code written under the basket advisory", async () => {
    const { agent } = await makeAgent();
    const f = await makeFactory();
    const basket = await openBasket(agent.id, f);
    const buyer = await makeBuyer();
    const admin = await agentsAdmin();
    let suspending: Promise<void> | undefined;
    // Like markBasketReceived: hold basket:<agent>:<factory>, then insert a row referencing Agent.
    await db.$transaction(
      async (tx) => {
        await lockBasketSlot(tx, agent.id, f.factory.id);
        suspending = suspendAgent(admin.id, agent.id, "Complaints");
        await new Promise((r) => setTimeout(r, 500));
        await tx.pickupCode.create({
          data: { buyerId: buyer.id, agentId: agent.id, code: "654321" },
        });
      },
      { timeout: 20000 },
    );
    await suspending;
    const row = await db.basket.findUniqueOrThrow({ where: { id: basket.id } });
    expect(row.status).toBe("LOCKED");
    expect(await db.pickupCode.count()).toBe(1);
  });

  it("only an AGENTS admin can suspend or lift", async () => {
    const { agent } = await makeAgent();
    const other = await makeUser("ADMIN", "FACTORY");
    await expect(suspendAgent(other.id, agent.id, "x")).rejects.toThrow();
    await suspendAgent((await agentsAdmin()).id, agent.id, "x");
    await expect(liftSuspension(other.id, agent.id)).rejects.toThrow();
  });
});

describe("leaving", () => {
  it("stays LEAVING with a waiting parcel; after hand over LEFT with 200,000 - losses once", async () => {
    const a = await paidAgent();
    const r = await makeReceivedOrder({ collectedAt: null, agent: a });
    await db.pickupCode.create({
      data: { buyerId: r.buyer.id, agentId: a.agent.id, code: "123456" },
    });
    await requestLeave(a.user.id);
    expect((await db.agent.findUniqueOrThrow({ where: { id: a.agent.id } })).status).toBe(
      "LEAVING",
    );
    const admin = await agentsAdmin();
    await recordLoss(admin.id, a.agent.id, "15000.50", "Damaged parcel", [giftPhotoFile()]);
    const loss = await db.agentLoss.findFirstOrThrow({ where: { agentId: a.agent.id } });
    expect([money(loss.amount), loss.reason, loss.photoKeys.length]).toEqual([
      "15000.50",
      "Damaged parcel",
      1,
    ]);

    expect(await closeLeavingAgents(new Date())).toBe(0);
    expect((await db.agent.findUniqueOrThrow({ where: { id: a.agent.id } })).status).toBe(
      "LEAVING",
    );

    await handOver(a.user.id, "123456", [r.line.id]);
    expect(await closeLeavingAgents(new Date())).toBe(1);
    expect(await closeLeavingAgents(new Date())).toBe(0);
    const left = await db.agent.findUniqueOrThrow({ where: { id: a.agent.id } });
    expect(left.status).toBe("LEFT");
    expect(left.leftAt).not.toBeNull();
    expect(money(await tokenBalance(a.user.id))).toBe("184999.50");
    expect(await db.tokenEntry.count({ where: { kind: "DEPOSIT_RETURN" } })).toBe(1);
  });

  it("locks OPEN baskets on leave and waits for them to reach the agent", async () => {
    const a = await paidAgent();
    const f = await makeFactory();
    const basket = await openBasket(a.agent.id, f);
    await requestLeave(a.user.id);
    const locked = await db.basket.findUniqueOrThrow({ where: { id: basket.id } });
    expect(locked.status).toBe("LOCKED");
    expect(await closeLeavingAgents(new Date())).toBe(0);
    await db.basket.update({ where: { id: basket.id }, data: { status: "AT_AGENT" } });
    expect(await closeLeavingAgents(new Date())).toBe(1);
  });

  it("a held return keeps the agent LEAVING until the admin collects it", async () => {
    const a = await paidAgent();
    const r = await makeReceivedOrder({ agent: a });
    const ret = await db.returnRequest.create({ data: returnData(r, a.agent.id) });
    await requestLeave(a.user.id);
    expect(await closeLeavingAgents(new Date())).toBe(0);
    expect((await db.agent.findUniqueOrThrow({ where: { id: a.agent.id } })).status).toBe(
      "LEAVING",
    );
    const admin = await agentsAdmin();
    await expect(
      collectHeldReturns((await makeUser("ADMIN", "FACTORY")).id, a.agent.id),
    ).rejects.toThrow();
    expect(await collectHeldReturns(admin.id, a.agent.id)).toBe(1);
    const moved = await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } });
    expect(moved.status).toBe("PICKED_UP");
    expect(await closeLeavingAgents(new Date())).toBe(1);
    expect(await closeLeavingAgents(new Date())).toBe(0);
    expect(await collectHeldReturns(admin.id, a.agent.id)).toBe(0);
    expect(money(await tokenBalance(a.user.id))).toBe("200000.00");
    expect(await db.tokenEntry.count({ where: { kind: "DEPOSIT_RETURN" } })).toBe(1);
  });

  it("collectHeldReturns refuses an agent that is not leaving", async () => {
    const a = await paidAgent();
    await expect(collectHeldReturns((await agentsAdmin()).id, a.agent.id)).rejects.toThrow();
  });

  it("an empty OPEN basket (its only order cancelled) does not block closing", async () => {
    const a = await paidAgent();
    const f = await makeFactory();
    const buyer = await makeBuyer();
    await fundTokens(buyer.id, "1160");
    await setCartItem(buyer.id, f.variant.id, 1);
    const r = await startCheckout(buyer.id, {
      agentId: a.agent.id,
      tokens: "1160",
      requestKey: "k",
    });
    await cancelOrder(buyer.id, r.orderIds[0]);
    const basket = await db.basket.findFirstOrThrow({ where: { agentId: a.agent.id } });
    await requestLeave(a.user.id);
    expect((await db.basket.findUniqueOrThrow({ where: { id: basket.id } })).status).toBe("OPEN");
    expect(await closeLeavingAgents(new Date())).toBe(1);
    expect(money(await tokenBalance(a.user.id))).toBe("200000.00");
  });

  it("a return cannot be assigned to an agent that has LEFT", async () => {
    const a = await makeAgent({ status: "LEFT" });
    const r = await makeReceivedOrder({ agent: a, receivedAt: new Date("2026-11-01T10:00:00Z") });
    const now = new Date("2026-11-02T10:00:00Z");
    const ret = await fileReturn(
      r.buyer.id,
      r.line.id,
      { qty: 1, fault: "FACTORY", reason: "DAMAGED", note: "Torn", photos: [giftPhotoFile()] },
      now,
    );
    await expect(factoryDecide(r.factory.id, ret.id, true, now)).rejects.toBeInstanceOf(CartError);
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: ret.id } })).status).toBe(
      "WAITING_FACTORY",
    );
  });

  it("losses above the deposit return nothing; no deposit paid returns nothing", async () => {
    const a = await paidAgent();
    await requestLeave(a.user.id);
    await recordLoss((await agentsAdmin()).id, a.agent.id, "200000", "Lost basket", [
      giftPhotoFile(),
    ]);
    const unpaid = await makeAgent();
    await requestLeave(unpaid.user.id);
    expect(await closeLeavingAgents(new Date())).toBe(2);
    expect(await db.tokenEntry.count()).toBe(0);
  });

  it("recordLoss needs an AGENTS admin, a positive amount, a reason and a photo", async () => {
    const a = await paidAgent();
    const admin = await agentsAdmin();
    const other = await makeUser("ADMIN", "FACTORY");
    await expect(recordLoss(other.id, a.agent.id, "10", "x", [giftPhotoFile()])).rejects.toThrow();
    await expect(recordLoss(admin.id, a.agent.id, "0", "x", [giftPhotoFile()])).rejects.toThrow();
    await expect(
      recordLoss(admin.id, a.agent.id, "1.001", "x", [giftPhotoFile()]),
    ).rejects.toThrow();
    await expect(recordLoss(admin.id, a.agent.id, "10", " ", [giftPhotoFile()])).rejects.toThrow();
    await expect(recordLoss(admin.id, a.agent.id, "10", "x", [])).rejects.toThrow();
    await recordLoss(admin.id, a.agent.id, "10", "x", [giftPhotoFile()]);
    await recordLoss(admin.id, a.agent.id, "5.25", "y", [giftPhotoFile()]);
    const row = await db.agent.findUniqueOrThrow({ where: { id: a.agent.id } });
    expect(money(row.lossAmount)).toBe("15.25");
  });
});

/** A return the buyer has handed to the agent, waiting to go back to the factory. */
function returnData(r: Awaited<ReturnType<typeof makeReceivedOrder>>, agentId: string) {
  return {
    buyerId: r.buyer.id,
    factoryId: r.factory.id,
    orderLineId: r.line.id,
    qty: 1,
    reason: "DAMAGED" as const,
    fault: "FACTORY" as const,
    note: "Torn",
    status: "HANDED_OVER" as const,
    handoverAgentId: agentId,
    factoryDueAt: new Date(),
  };
}
