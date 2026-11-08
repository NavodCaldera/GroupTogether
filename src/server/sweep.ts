import "server-only";
import { weekEnding } from "@/lib/agent-rules";
import { db } from "./db";
import { getSettings } from "./settings";
import { closeLeavingAgents } from "./agents/leave";
import { flushBrandNotices } from "./brand-communications";
import { remindAgreements } from "./agreements";
import { enforceHold } from "./fault-holds";
import { removeFactory } from "./quality";
import { expireOrders, lockBasket } from "./orders/baskets";
import { lockBasketSlot, withOrderTransaction } from "./orders/locks";
import { buildWeeklyPayouts, creditAgentFees } from "./payouts";
import { escalateOverdue, flushReturnNotices, lapseReturns } from "./returns";

const DAY_MS = 24 * 60 * 60 * 1000;

/** OPEN baskets holding a paid order whose first order is maxWaitDays old lock with MAX_WAIT.
 * One transaction per basket: basket advisory -> Basket row. Returns how many locked.
 */
export async function lockWaitedBaskets(now: Date): Promise<number> {
  const { maxWaitDays } = await getSettings();
  const cutoff = new Date(now.getTime() - maxWaitDays * DAY_MS);
  const due = await db.basket.findMany({
    where: { status: "OPEN", firstOrderAt: { lte: cutoff }, orders: { some: { status: "PAID" } } },
    select: { id: true, agentId: true, factoryId: true },
    orderBy: { id: "asc" },
  });
  let locked = 0;
  for (const b of due) {
    try {
      locked += await withOrderTransaction([], [], async (tx) => {
        await lockBasketSlot(tx, b.agentId, b.factoryId);
        const row = await tx.basket.findUniqueOrThrow({
          where: { id: b.id },
          select: { status: true, firstOrderAt: true },
        });
        if (row.status !== "OPEN" || !row.firstOrderAt || row.firstOrderAt > cutoff) return 0;
        if (!(await tx.order.count({ where: { basketId: b.id, status: "PAID" } }))) return 0;
        await lockBasket(tx, b.id, "MAX_WAIT", now);
        return 1;
      });
    } catch (error) {
      console.error("Max-wait lock will retry", b.id, error);
    }
  }
  return locked;
}

/** Builds payouts and credits agent fees once per week, after Saturday 23:59 Asia/Colombo. */
async function weekly(now: Date): Promise<{ payouts: number; agentFees: number }> {
  const end = weekEnding(now);
  const { payoutsBuiltThrough } = await getSettings();
  if (payoutsBuiltThrough && payoutsBuiltThrough >= end) return { payouts: 0, agentFees: 0 };
  const payouts = await buildWeeklyPayouts(now);
  const agentFees = await creditAgentFees(now);
  // Lines that miss this build (a failed factory, a return that closes later) go to next week.
  await db.settings.updateMany({
    where: { id: 1, OR: [{ payoutsBuiltThrough: null }, { payoutsBuiltThrough: { lt: end } }] },
    data: { payoutsBuiltThrough: end },
  });
  return { payouts, agentFees };
}

/** Finishes open fault holds and carries out decided factory removals; each retries next run. */
async function sweepFaultHolds(): Promise<number> {
  let done = 0;
  const holds = await db.faultHold.findMany({
    where: { decidedAt: null, cleanedAt: null },
    select: { id: true },
  });
  for (const hold of holds) {
    try {
      await enforceHold(hold.id);
      done++;
    } catch (error) {
      console.error("Fault hold cleanup will retry", hold.id, error);
    }
  }
  const removals = await db.faultHold.findMany({
    where: {
      decision: "REMOVE",
      factory: { factoryProfile: { is: { status: { not: "REMOVED" } } } },
    },
    select: { id: true, factoryId: true, decidedById: true, decisionNote: true },
    orderBy: { id: "asc" },
  });
  for (const hold of removals) {
    try {
      if (!hold.decidedById || !hold.decisionNote)
        throw new Error("Removal decision is incomplete");
      await removeFactory(hold.decidedById, hold.factoryId, hold.decisionNote, false);
      done++;
    } catch (error) {
      console.error("Fault hold removal will retry", hold.id, error);
    }
  }
  return done;
}

/** Every time-based rule, run by cron. Each step is independent: one failing step is logged and
 * the rest still run. Page loads never call this.
 */
export async function runSweep(now = new Date()): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const step = async (name: string, work: () => Promise<number | Record<string, number>>) => {
    try {
      const out = await work();
      if (typeof out === "number") result[name] = out;
      else Object.assign(result, out);
    } catch (error) {
      console.error(`Sweep step ${name} failed`, error);
      result[`${name}Failed`] = 1;
    }
  };
  await step("expiredOrders", () => expireOrders(now));
  await step("maxWaitLocked", () => lockWaitedBaskets(now));
  await step("escalatedReturns", () => escalateOverdue(now));
  await step("lapsedReturns", () => lapseReturns(now));
  await step("agentsClosed", () => closeLeavingAgents(now));
  await step("weekly", () => weekly(now));
  await step("faultHolds", () => sweepFaultHolds());
  await step("agreements", async () => {
    await remindAgreements(now);
    return 0;
  });
  await step("notices", async () => {
    await flushBrandNotices();
    await flushReturnNotices();
    return 0;
  });
  return result;
}
